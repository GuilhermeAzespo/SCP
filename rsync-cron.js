const cron = require('node-cron');
const Database = require('better-sqlite3');
const fs = require('fs');
const http = require('http');

const dbPath = process.env.DATABASE_URL ? process.env.DATABASE_URL.replace('file:', '') : '/app/data/dev.db';

// Logger wrapper to write to both console and file
function logCron(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  try {
    fs.appendFileSync('/app/data/cron.log', line + '\n');
  } catch (e) {}
}

// Wait for Next.js to be ready by polling the health endpoint
function waitForServer(retries = 30, delayMs = 5000) {
  return new Promise((resolve) => {
    function attempt(remaining) {
      const req = http.request(
        { hostname: '127.0.0.1', port: 3000, path: '/api/auth/me', method: 'GET' },
        (res) => {
          // Any HTTP response means the server is up
          logCron(`[RSYNC Cron] Next.js server is ready (HTTP ${res.statusCode}). Starting scheduler.`);
          resolve();
        }
      );
      req.on('error', () => {
        if (remaining <= 0) {
          logCron(`[RSYNC Cron] WARNING: Server did not respond after all retries. Starting anyway.`);
          resolve();
          return;
        }
        logCron(`[RSYNC Cron] Waiting for Next.js server... (${remaining} retries left)`);
        setTimeout(() => attempt(remaining - 1), delayMs);
      });
      req.end();
    }
    attempt(retries);
  });
}

function httpPost(clientId) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path: `/api/rsync?clientId=${clientId}&cronSecret=scp-internal-cron-secret-2026`,
      method: 'POST'
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          logCron(`[RSYNC Cron] API triggered successfully. Response: ${data}`);
        } else {
          logCron(`[RSYNC Cron] HTTP error! status: ${res.statusCode} - Data: ${data}`);
        }
        resolve();
      });
    });
    req.on('error', (err) => {
      logCron(`[RSYNC Cron] Failed to trigger API: ${err.message}`);
      resolve();
    });
    req.end();
  });
}

let activeTasks = {};

async function reloadTasks() {
  let db;
  try {
    db = new Database(dbPath, { readonly: true });
    const clients = db.prepare('SELECT id, rsyncCron FROM Client WHERE rsyncEnabled = 1').all();
    db.close();

    const currentClientIds = new Set(clients.map(c => c.id));
    for (const taskId in activeTasks) {
      if (!currentClientIds.has(taskId)) {
        logCron(`[RSYNC Cron] Stopping task for deleted/disabled client ${taskId}`);
        activeTasks[taskId].task.stop();
        delete activeTasks[taskId];
      }
    }

    clients.forEach(client => {
      if (!client.rsyncCron || !cron.validate(client.rsyncCron)) {
        if (activeTasks[client.id]) {
           logCron(`[RSYNC Cron] Stopping invalid cron task for client ${client.id}`);
           activeTasks[client.id].task.stop();
           delete activeTasks[client.id];
        }
        return;
      }

      if (activeTasks[client.id] && activeTasks[client.id].cronStr === client.rsyncCron) {
        return;
      }

      if (activeTasks[client.id]) {
        logCron(`[RSYNC Cron] Updating schedule for client ${client.id} to ${client.rsyncCron}`);
        activeTasks[client.id].task.stop();
      } else {
        logCron(`[RSYNC Cron] Starting new schedule for client ${client.id}: ${client.rsyncCron}`);
      }

      const task = cron.schedule(client.rsyncCron, () => {
        logCron(`[RSYNC Cron] Triggering RSYNC via API for client ${client.id}...`);
        httpPost(client.id);
      });

      activeTasks[client.id] = { task, cronStr: client.rsyncCron };
    });
  } catch (error) {
    if (db) db.close();
    logCron(`[RSYNC Cron] Error reloading tasks: ${error.message}`);
  }
}

logCron("[RSYNC Cron] Starting background scheduler engine...");
waitForServer().then(() => {
  reloadTasks();
  setInterval(reloadTasks, 60000);
});
