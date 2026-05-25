import { exec } from "child_process";
import fs from "fs";
import path from "path";
import util from "util";

const execAsync = util.promisify(exec);

export type SyncMode = "push" | "pull" | "both";

export interface SyncResult {
  mode: SyncMode;
  success: boolean;
  logs: string;
  error?: string;
}

export async function runRsync(modeOverride?: SyncMode): Promise<SyncResult[]> {
  const enabled = process.env.RSYNC_ENABLED === "true";
  if (!enabled) {
    return [{ mode: modeOverride || "push", success: false, error: "RSYNC is not enabled (RSYNC_ENABLED != 'true')", logs: "" }];
  }

  const host = process.env.RSYNC_HOST;
  const user = process.env.RSYNC_USER;
  const remotePath = process.env.RSYNC_PATH;
  const sshKey = process.env.RSYNC_SSH_KEY;
  const port = process.env.RSYNC_PORT || "22";
  const mode: SyncMode = modeOverride || (process.env.RSYNC_MODE as SyncMode) || "push";

  if (!host || !user || !remotePath) {
    return [{ mode, success: false, error: "Missing required RSYNC environment variables (HOST, USER, PATH)", logs: "" }];
  }

  const results: SyncResult[] = [];
  const localPath = process.env.DATA_DIR || "/app/data";

  // Prepare SSH Key
  let sshCommand = `ssh -p ${port} -o StrictHostKeyChecking=no`;
  const keyPath = "/tmp/rsync_id_rsa";

  if (sshKey) {
    // Write key and set correct permissions
    fs.writeFileSync(keyPath, sshKey.replace(/\\n/g, "\n"), { encoding: "utf-8", mode: 0o600 });
    sshCommand += ` -i ${keyPath}`;
  }

  const executeSync = async (currentMode: "push" | "pull"): Promise<SyncResult> => {
    try {
      let rsyncCmd = "";
      if (currentMode === "push") {
        // Local to Remote
        // Use trailing slash on localPath to sync contents, not the folder itself if we want
        // But for /app/data, we probably want the contents of /app/data to go inside the remote path
        rsyncCmd = `rsync -avz --delete -e "${sshCommand}" ${localPath}/ ${user}@${host}:${remotePath}/`;
      } else {
        // Remote to Local
        rsyncCmd = `rsync -avz --delete -e "${sshCommand}" ${user}@${host}:${remotePath}/ ${localPath}/`;
      }

      const { stdout, stderr } = await execAsync(rsyncCmd);
      return { mode: currentMode, success: true, logs: stdout + (stderr ? `\nErrors:\n${stderr}` : "") };
    } catch (err: any) {
      return { mode: currentMode, success: false, logs: err.stdout || "", error: err.message || err.toString() };
    }
  };

  if (mode === "push" || mode === "both") {
    results.push(await executeSync("push"));
  }
  
  if (mode === "pull" || mode === "both") {
    results.push(await executeSync("pull"));
  }

  // Cleanup key
  if (fs.existsSync(keyPath)) {
    try { fs.unlinkSync(keyPath); } catch (e) {}
  }

  return results;
}
