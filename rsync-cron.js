const cron = require('node-cron');
const { execSync } = require('child_process');
const fs = require('fs');

const enabled = process.env.RSYNC_ENABLED === 'true';
const schedule = process.env.RSYNC_CRON || '0 3 * * *'; // Default 3 AM

if (!enabled) {
  console.log('[RSYNC Cron] RSYNC is disabled (RSYNC_ENABLED != true).');
  process.exit(0);
}

console.log(`[RSYNC Cron] Starting RSYNC background scheduler with cron expression: "${schedule}"`);

cron.schedule(schedule, () => {
  console.log('[RSYNC Cron] Triggering scheduled RSYNC synchronization...');
  
  // To avoid duplicating the complex logic, we can just fetch the local API route
  // However, the API route might require auth.
  // Instead, we will replicate the execution here in JS
  
  const host = process.env.RSYNC_HOST;
  const user = process.env.RSYNC_USER;
  const remotePath = process.env.RSYNC_PATH;
  const sshKey = process.env.RSYNC_SSH_KEY;
  const port = process.env.RSYNC_PORT || "22";
  const mode = process.env.RSYNC_MODE || "push";
  const localPath = process.env.DATA_DIR || "/app/data";

  if (!host || !user || !remotePath) {
    console.error("[RSYNC Cron] Missing required RSYNC environment variables.");
    return;
  }

  let sshCommand = `ssh -p ${port} -o StrictHostKeyChecking=no`;
  const keyPath = "/tmp/rsync_id_rsa_cron";

  if (sshKey) {
    fs.writeFileSync(keyPath, sshKey.replace(/\\n/g, "\n"), { encoding: "utf-8", mode: 0o600 });
    sshCommand += ` -i ${keyPath}`;
  }

  try {
    if (mode === "push" || mode === "both") {
      console.log("[RSYNC Cron] Running PUSH...");
      const cmd = `rsync -avz --delete -e "${sshCommand}" ${localPath}/ ${user}@${host}:${remotePath}/`;
      const out = execSync(cmd, { encoding: 'utf-8' });
      console.log(out);
    }
    if (mode === "pull" || mode === "both") {
      console.log("[RSYNC Cron] Running PULL...");
      const cmd = `rsync -avz --delete -e "${sshCommand}" ${user}@${host}:${remotePath}/ ${localPath}/`;
      const out = execSync(cmd, { encoding: 'utf-8' });
      console.log(out);
    }
    console.log("[RSYNC Cron] Synchronization completed successfully.");
  } catch (err) {
    console.error("[RSYNC Cron] Synchronization failed:");
    console.error(err.stdout || err.message);
  } finally {
    if (fs.existsSync(keyPath)) {
      try { fs.unlinkSync(keyPath); } catch (e) {}
    }
  }
});
