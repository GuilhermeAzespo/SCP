const cron = require('node-cron');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('./src/generated/prisma/client/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');

const dbPath = process.env.DATABASE_URL || 'file:/app/data/dev.db';
const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });

let activeTasks = {};

async function reloadTasks() {
  try {
    const clients = await prisma.client.findMany({ where: { rsyncEnabled: true } });
    
    // Stop and delete all existing tasks to refresh configurations
    for (const taskId in activeTasks) {
      activeTasks[taskId].stop();
      delete activeTasks[taskId];
    }

    clients.forEach(client => {
      if (!client.rsyncCron || !cron.validate(client.rsyncCron)) {
        // Silent ignore for invalid or missing crons
        return;
      }

      const task = cron.schedule(client.rsyncCron, () => {
        console.log(`[RSYNC Cron] Triggering RSYNC for client ${client.slug}...`);
        
        const host = client.rsyncHost;
        const user = client.rsyncUser;
        const remotePath = client.rsyncPath;
        const sshKey = client.rsyncSshKey;
        const port = "22";
        const mode = client.rsyncMode || "push";
        const localDataDir = process.env.DATA_DIR || "/app/data";
        const localPath = path.join(localDataDir, "uploads", client.slug, "files");

        if (!host || !user || !remotePath) {
          console.error(`[RSYNC Cron] Missing required RSYNC config for client ${client.slug}`);
          return;
        }

        const protocol = client.rsyncProtocol || "rsync";
        const sshPassword = client.rsyncSshPassword;

        let sshCommand = `ssh -p ${port} -o StrictHostKeyChecking=no`;
        let rsyncPrefix = "";
        const keyPath = `/tmp/rsync_id_rsa_cron_${client.id}`;

        if (sshKey) {
          fs.writeFileSync(keyPath, sshKey.replace(/\\n/g, "\n"), { encoding: "utf-8", mode: 0o600 });
          sshCommand += ` -i ${keyPath} -o PasswordAuthentication=no`;
        } else if (sshPassword) {
          const escapedPassword = sshPassword.replace(/'/g, "'\\''");
          rsyncPrefix = `sshpass -p '${escapedPassword}' `;
          sshCommand += ` -o PasswordAuthentication=yes`;
        }

        try {
          if (protocol === "scp") {
            // SCP Command
            let scpBase = `scp -P ${port} -o StrictHostKeyChecking=no`;
            if (sshKey) scpBase += ` -i ${keyPath} -o PasswordAuthentication=no`;
            else if (sshPassword) scpBase += ` -o PasswordAuthentication=yes`;

            if (mode === "push" || mode === "both") {
              console.log(`[RSYNC Cron] [${client.slug}] Running PUSH (SCP)...`);
              const cmd = `${rsyncPrefix}${scpBase} -r ${localPath}/* ${user}@${host}:${remotePath}/`;
              execSync(cmd, { encoding: 'utf-8' });
            }
            if (mode === "pull" || mode === "both") {
              console.log(`[RSYNC Cron] [${client.slug}] Running PULL (SCP)...`);
              const cmd = `${rsyncPrefix}${scpBase} -r ${user}@${host}:${remotePath}/* ${localPath}/`;
              execSync(cmd, { encoding: 'utf-8' });
            }
          } else {
            // RSYNC Command
            if (mode === "push" || mode === "both") {
              console.log(`[RSYNC Cron] [${client.slug}] Running PUSH (RSYNC)...`);
              const cmd = `${rsyncPrefix}rsync -avz --delete -e "${sshCommand}" ${localPath}/ ${user}@${host}:${remotePath}/`;
              execSync(cmd, { encoding: 'utf-8' });
            }
            if (mode === "pull" || mode === "both") {
              console.log(`[RSYNC Cron] [${client.slug}] Running PULL (RSYNC)...`);
              const cmd = `${rsyncPrefix}rsync -avz --delete -e "${sshCommand}" ${user}@${host}:${remotePath}/ ${localPath}/`;
              execSync(cmd, { encoding: 'utf-8' });
            }
          }
          console.log(`[RSYNC Cron] [${client.slug}] Synchronization completed successfully.`);
        } catch (err) {
          console.error(`[RSYNC Cron] [${client.slug}] Synchronization failed:`);
          console.error(err.stdout || err.message);
        } finally {
          if (fs.existsSync(keyPath)) {
            try { fs.unlinkSync(keyPath); } catch (e) {}
          }
        }
      });

      activeTasks[client.id] = task;
    });
  } catch (error) {
    console.error("[RSYNC Cron] Error reloading tasks:", error);
  }
}

console.log("[RSYNC Cron] Starting background scheduler engine...");
// Reload tasks immediately and then every minute to catch updates from the Database UI
reloadTasks();
setInterval(reloadTasks, 60000);
