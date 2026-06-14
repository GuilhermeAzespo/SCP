const cron = require('node-cron');
const Database = require('better-sqlite3');

const dbPath = process.env.DATABASE_URL ? process.env.DATABASE_URL.replace('file:', '') : '/app/data/dev.db';

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
        activeTasks[taskId].task.stop();
        delete activeTasks[taskId];
      }
    }

    clients.forEach(client => {
      if (!client.rsyncCron || !cron.validate(client.rsyncCron)) {
        if (activeTasks[client.id]) {
           activeTasks[client.id].task.stop();
           delete activeTasks[client.id];
        }
        return;
      }

      if (activeTasks[client.id] && activeTasks[client.id].cronStr === client.rsyncCron) {
        return;
      }

      if (activeTasks[client.id]) {
        activeTasks[client.id].task.stop();
      }

      const task = cron.schedule(client.rsyncCron, async () => {
        console.log(`[RSYNC Cron] Triggering RSYNC via API for client ${client.id}...`);
        try {
          const res = await fetch(`http://127.0.0.1:3000/api/rsync?clientId=${client.id}&cronSecret=scp-internal-cron-secret-2026`, { method: 'POST' });
          if (!res.ok) {
            console.error(`[RSYNC Cron] HTTP error! status: ${res.status}`);
          } else {
            console.log(`[RSYNC Cron] API triggered successfully.`);
          }
        } catch (err) {
          console.error(`[RSYNC Cron] Failed to trigger API:`, err);
        }
      });

      activeTasks[client.id] = { task, cronStr: client.rsyncCron };
    });
  } catch (error) {
    if (db) db.close();
    console.error("[RSYNC Cron] Error reloading tasks:", error);
  }
}

console.log("[RSYNC Cron] Starting background scheduler engine...");
reloadTasks();
setInterval(reloadTasks, 60000);
