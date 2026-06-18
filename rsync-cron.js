const cron = require('node-cron');
const Database = require('better-sqlite3');
const fs = require('fs');

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

      const task = cron.schedule(client.rsyncCron, async () => {
        logCron(`[RSYNC Cron] Triggering RSYNC via API for client ${client.id}...`);
        try {
          const res = await fetch(`http://127.0.0.1:3000/api/rsync?clientId=${client.id}&cronSecret=scp-internal-cron-secret-2026`, { method: 'POST' });
          if (!res.ok) {
            logCron(`[RSYNC Cron] HTTP error! status: ${res.status}`);
          } else {
            const data = await res.json();
            logCron(`[RSYNC Cron] API triggered successfully. Success: ${data.success}`);
          }
        } catch (err) {
          logCron(`[RSYNC Cron] Failed to trigger API: ${err.message}`);
        }
      });

      activeTasks[client.id] = { task, cronStr: client.rsyncCron };
    });
  } catch (error) {
    if (db) db.close();
    logCron(`[RSYNC Cron] Error reloading tasks: ${error.message}`);
  }
}

logCron("[RSYNC Cron] Starting background scheduler engine...");
reloadTasks();
setInterval(reloadTasks, 60000);
