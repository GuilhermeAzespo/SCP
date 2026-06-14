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
        const sshPassword = client.rsyncSshPassword;
        const port = client.rsyncSshPort || "22";
        const mode = client.rsyncMode || "push";
        const localDataDir = process.env.DATA_DIR || "/app/data";
        const localPath = path.join(localDataDir, "uploads", client.slug);

        if (!host || !user || !remotePath) {
          console.error(`[RSYNC Cron] Missing required RSYNC config for client ${client.slug}`);
          return;
        }

        let sshCommand = `ssh -p ${port} -o StrictHostKeyChecking=no`;
        let rsyncPrefix = "";
        const keyPath = `/tmp/rsync_id_rsa_cron_${client.id}`;

        if (sshKey && sshKey.trim() !== "") {
          fs.writeFileSync(keyPath, sshKey.replace(/\\n/g, "\n"), { encoding: "utf-8", mode: 0o600 });
          sshCommand += ` -i ${keyPath} -o PasswordAuthentication=no`;
        } else if (sshPassword) {
          const escapedPassword = sshPassword.replace(/'/g, "'\\''");
          rsyncPrefix = `sshpass -p '${escapedPassword}' `;
          sshCommand += ` -o PasswordAuthentication=yes`;
        }

        const syncDatabaseWithDisk = async () => {
          if (!fs.existsSync(localPath)) return;
          const filesOnDisk = fs.readdirSync(localPath).filter(f => fs.statSync(path.join(localPath, f)).isFile());
          const existingDbFiles = await prisma.file.findMany({ where: { clientId: client.id } });
          
          for (const dbFile of existingDbFiles) {
            const physicalName = path.basename(dbFile.path);
            if (!filesOnDisk.includes(physicalName)) {
              await prisma.file.delete({ where: { id: dbFile.id } });
            }
          }

          for (const diskFile of filesOnDisk) {
            const exists = existingDbFiles.find(f => path.basename(f.path) === diskFile);
            const stats = fs.statSync(path.join(localPath, diskFile));
            if (!exists) {
              await prisma.file.create({
                data: {
                  name: diskFile,
                  path: `uploads/${client.slug}/${diskFile}`,
                  size: stats.size,
                  mimeType: "application/octet-stream",
                  clientId: client.id
                }
              });
            } else if (exists.size !== stats.size) {
              await prisma.file.update({
                where: { id: exists.id },
                data: { size: stats.size }
              });
            }
          }
        };

        try {
          if (port === "21") {
            const escapedPassword = sshPassword ? sshPassword.replace(/'/g, "'\\''") : "";
            const auth = `-u '${user}','${escapedPassword}'`;
            if (mode === "push" || mode === "both") {
              console.log(`[RSYNC Cron] [${client.slug}] Running FTP PUSH via lftp...`);
              const cmd = `lftp -c "set ssl:verify-certificate no; open -u '${user}','${escapedPassword}' -p ${port} ftp://${host}; mirror -R --delete --verbose '${localPath}/' '${remotePath}'"`;
              execSync(cmd, { encoding: 'utf-8' });
            }
            if (mode === "pull" || mode === "both") {
              console.log(`[RSYNC Cron] [${client.slug}] Running FTP PULL via lftp...`);
              const cmd = `lftp -c "set ssl:verify-certificate no; open -u '${user}','${escapedPassword}' -p ${port} ftp://${host}; mirror --delete --verbose '${remotePath}' '${localPath}/'"`;
              execSync(cmd, { encoding: 'utf-8' });
            }
          } else {
            if (mode === "push" || mode === "both") {
              console.log(`[RSYNC Cron] [${client.slug}] Running SSH PUSH via rsync...`);
              const cmd = `${rsyncPrefix}rsync -avz --delete -e "${sshCommand}" ${localPath}/ ${user}@${host}:${remotePath}/`;
              execSync(cmd, { encoding: 'utf-8' });
            }
            if (mode === "pull" || mode === "both") {
              console.log(`[RSYNC Cron] [${client.slug}] Running SSH PULL via rsync...`);
              const cmd = `${rsyncPrefix}rsync -avz --delete -e "${sshCommand}" ${user}@${host}:${remotePath}/ ${localPath}/`;
              execSync(cmd, { encoding: 'utf-8' });
            }
          }
          if (mode === "pull" || mode === "both") {
            // Need an async wrapper to call syncDatabaseWithDisk since cron handler is synchronous
            (async () => {
              try {
                await syncDatabaseWithDisk();
                console.log(`[RSYNC Cron] [${client.slug}] Database synced successfully.`);
              } catch (dbErr) {
                console.error(`[RSYNC Cron] [${client.slug}] Database sync failed:`, dbErr);
              }
            })();
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
