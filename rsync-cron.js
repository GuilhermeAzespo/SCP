/**
 * rsync-cron.js
 * Background CRON scheduler that executes RSYNC directly from SQLite.
 * Does NOT depend on the Next.js HTTP server being available.
 */
const cron = require('node-cron');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dbPath = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('file:', '')
  : '/app/data/dev.db';

const dataDir = process.env.DATA_DIR || '/app/data';

// ─── Logger ──────────────────────────────────────────────────────────────────
function logCron(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  try { fs.appendFileSync('/app/data/cron.log', line + '\n'); } catch (e) {}
}

function logRsync(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  try { fs.appendFileSync('/app/data/rsync.log', line + '\n'); } catch (e) {}
}

// ─── Sync disk files → SQLite (so web portal shows them) ────────────────────
function syncDatabaseWithDisk(db, clientId, slug, localPath) {
  try {
    if (!fs.existsSync(localPath)) return;

    const filesOnDisk = fs.readdirSync(localPath).filter(f => {
      try { return fs.statSync(path.join(localPath, f)).isFile(); } catch (e) { return false; }
    });

    const dbFiles = db.prepare('SELECT id, path, size FROM File WHERE clientId = ?').all(clientId);
    const dbFileMap = new Map(dbFiles.map(f => [path.basename(f.path), f]));

    // Remove DB entries for files no longer on disk
    for (const dbFile of dbFiles) {
      const name = path.basename(dbFile.path);
      if (!filesOnDisk.includes(name)) {
        db.prepare('DELETE FROM File WHERE id = ?').run(dbFile.id);
        logCron(`[DB Sync: ${slug}] Removed stale entry: ${name}`);
      }
    }

    // Add new files from disk that aren't in DB
    for (const diskFile of filesOnDisk) {
      const stats = fs.statSync(path.join(localPath, diskFile));
      const existing = dbFileMap.get(diskFile);
      if (!existing) {
        db.prepare(`INSERT INTO File (id, name, path, size, mimeType, clientId, createdAt, updatedAt)
          VALUES (lower(hex(randomblob(16))), ?, ?, ?, 'application/octet-stream', ?, datetime('now'), datetime('now'))`)
          .run(diskFile, `uploads/${slug}/files/${diskFile}`, stats.size, clientId);
        logCron(`[DB Sync: ${slug}] Added new file: ${diskFile}`);
      } else if (existing.size !== stats.size) {
        db.prepare('UPDATE File SET size = ?, updatedAt = datetime(\'now\') WHERE id = ?').run(stats.size, existing.id);
        logCron(`[DB Sync: ${slug}] Updated size for: ${diskFile}`);
      }
    }

    logCron(`[DB Sync: ${slug}] ✅ Synced ${filesOnDisk.length} file(s) to DB`);
  } catch (e) {
    logCron(`[DB Sync: ${slug}] ❌ Error: ${e.message}`);
  }
}

// ─── Execute RSYNC for a single client ───────────────────────────────────────
function runRsyncForClient(client) {
  const { id, slug, rsyncHost, rsyncUser, rsyncPath, rsyncMode, rsyncSshKey, rsyncSshPassword, rsyncSshPort, rsyncProtocol } = client;

  if (!rsyncHost || !rsyncUser || !rsyncPath) {
    logCron(`[Client: ${slug}] Skipping – missing host/user/path config.`);
    return;
  }

  const port = rsyncSshPort || '22';
  const mode = rsyncMode || 'push';
  const protocol = rsyncProtocol || 'rsync';
  const localPath = path.join(dataDir, 'uploads', slug, 'files');
  const keyPath = `/tmp/rsync_id_rsa_${id}`;
  const rPath = rsyncPath.endsWith('/') ? rsyncPath : rsyncPath + '/';

  // Ensure local dir exists
  if (!fs.existsSync(localPath)) {
    fs.mkdirSync(localPath, { recursive: true });
  }

  // Build SSH/auth prefix
  let sshCommand = `ssh -p ${port} -o StrictHostKeyChecking=no`;
  let rsyncPrefix = '';

  if (rsyncSshKey && rsyncSshKey.trim() !== '') {
    fs.writeFileSync(keyPath, rsyncSshKey.replace(/\\n/g, '\n'), { mode: 0o600 });
    sshCommand += ` -i ${keyPath} -o PasswordAuthentication=no`;
  } else if (rsyncSshPassword) {
    const escaped = rsyncSshPassword.replace(/'/g, "'\\''");
    rsyncPrefix = `sshpass -p '${escaped}' `;
    sshCommand += ` -o PasswordAuthentication=yes`;
  }

  const modes = mode === 'both' ? ['push', 'pull'] : [mode];

  // Open a writable DB connection for syncing
  let writeDb;
  try {
    writeDb = new Database(dbPath);
  } catch (e) {
    logCron(`[Client: ${slug}] Could not open writable DB: ${e.message}`);
    writeDb = null;
  }

  for (const currentMode of modes) {
    let cmd = '';

    if (port === '21') {
      // FTP via lftp
      const escapedPw = rsyncSshPassword ? rsyncSshPassword.replace(/'/g, "'\\''") : '';
      if (currentMode === 'push') {
        cmd = `lftp -c "set ssl:verify-certificate no; open -u '${rsyncUser}','${escapedPw}' -p ${port} ftp://${rsyncHost}; mirror -R --delete --verbose '${localPath}/' '${rPath}'"`;
      } else {
        cmd = `lftp -c "set ssl:verify-certificate no; open -u '${rsyncUser}','${escapedPw}' -p ${port} ftp://${rsyncHost}; mirror --delete --verbose '${rPath}' '${localPath}/'"`;
      }
    } else if (protocol === 'scp') {
      let scpBase = `scp -P ${port} -o StrictHostKeyChecking=no`;
      if (rsyncSshKey) scpBase += ` -i ${keyPath} -o PasswordAuthentication=no`;
      else if (rsyncSshPassword) scpBase += ` -o PasswordAuthentication=yes`;

      if (currentMode === 'push') {
        cmd = `${rsyncPrefix}${scpBase} -r ${localPath}/* ${rsyncUser}@${rsyncHost}:${rPath}`;
      } else {
        cmd = `${rsyncPrefix}${scpBase} -r ${rsyncUser}@${rsyncHost}:${rPath}* ${localPath}/`;
      }
    } else {
      // RSYNC over SSH
      if (currentMode === 'push') {
        cmd = `${rsyncPrefix}rsync -avz --delete -e "${sshCommand}" ${localPath}/ ${rsyncUser}@${rsyncHost}:${rPath}`;
      } else {
        cmd = `${rsyncPrefix}rsync -avz --delete -e "${sshCommand}" ${rsyncUser}@${rsyncHost}:${rPath} ${localPath}/`;
      }
    }

    logCron(`[Client: ${slug}] Executing [${currentMode.toUpperCase()}] sync...`);
    logRsync(`[Client: ${slug}] [${currentMode.toUpperCase()}] CMD: ${cmd.replace(rsyncSshPassword || '', '***')}`);

    try {
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
      logCron(`[Client: ${slug}] [${currentMode.toUpperCase()}] ✅ Success`);
      logRsync(`[Client: ${slug}] [${currentMode.toUpperCase()}] Output:\n${output}`);

      // After a successful PULL, sync the DB so files appear on the web portal
      if (currentMode === 'pull' && writeDb) {
        syncDatabaseWithDisk(writeDb, id, slug, localPath);
      }
    } catch (err) {
      const safeMsg = (err.stderr || err.message || '').replace(rsyncSshPassword || '', '***');
      logCron(`[Client: ${slug}] [${currentMode.toUpperCase()}] ❌ Error: ${safeMsg}`);
      logRsync(`[Client: ${slug}] [${currentMode.toUpperCase()}] Error: ${safeMsg}`);
    }
  }

  if (writeDb) writeDb.close();

  // Cleanup key file
  if (fs.existsSync(keyPath)) {
    try { fs.unlinkSync(keyPath); } catch (e) {}
  }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────
let activeTasks = {};

function reloadTasks() {
  let db;
  try {
    db = new Database(dbPath, { readonly: true });
    const clients = db.prepare(`
      SELECT id, slug, rsyncCron, rsyncHost, rsyncUser, rsyncPath, rsyncMode,
             rsyncSshKey, rsyncSshPassword, rsyncSshPort, rsyncProtocol
      FROM Client
      WHERE rsyncEnabled = 1
    `).all();
    db.close();

    const currentClientIds = new Set(clients.map(c => c.id));

    // Stop tasks for removed/disabled clients
    for (const taskId in activeTasks) {
      if (!currentClientIds.has(taskId)) {
        logCron(`Stopping task for disabled/removed client ${taskId}`);
        activeTasks[taskId].task.stop();
        delete activeTasks[taskId];
      }
    }

    for (const client of clients) {
      if (!client.rsyncCron || !cron.validate(client.rsyncCron)) {
        if (activeTasks[client.id]) {
          logCron(`Stopping invalid cron task for client ${client.slug}`);
          activeTasks[client.id].task.stop();
          delete activeTasks[client.id];
        }
        continue;
      }

      // Skip if schedule hasn't changed
      if (activeTasks[client.id] && activeTasks[client.id].cronStr === client.rsyncCron) {
        continue;
      }

      // Stop old task if schedule changed
      if (activeTasks[client.id]) {
        logCron(`Updating schedule for client ${client.slug} → ${client.rsyncCron}`);
        activeTasks[client.id].task.stop();
      } else {
        logCron(`Scheduling client ${client.slug}: ${client.rsyncCron}`);
      }

      const task = cron.schedule(client.rsyncCron, () => {
        logCron(`Firing RSYNC for client ${client.slug}...`);
        // Read fresh client data each time (passwords/config may have changed)
        let freshDb;
        try {
          freshDb = new Database(dbPath, { readonly: true });
          const freshClient = freshDb.prepare(`
            SELECT id, slug, rsyncHost, rsyncUser, rsyncPath, rsyncMode,
                   rsyncSshKey, rsyncSshPassword, rsyncSshPort, rsyncProtocol
            FROM Client WHERE id = ?
          `).get(client.id);
          freshDb.close();
          if (freshClient) runRsyncForClient(freshClient);
        } catch (e) {
          if (freshDb) freshDb.close();
          logCron(`Error reading DB for client ${client.slug}: ${e.message}`);
        }
      });

      activeTasks[client.id] = { task, cronStr: client.rsyncCron };
    }
  } catch (error) {
    if (db) db.close();
    logCron(`Error reloading tasks: ${error.message}`);
  }
}

logCron('===== RSYNC Cron scheduler starting (direct mode) =====');
reloadTasks();
setInterval(reloadTasks, 60000);
