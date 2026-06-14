import { exec } from "child_process";
import fs from "fs";
import path from "path";
import util from "util";
import { db } from "./db";

const execAsync = util.promisify(exec);

export type SyncMode = "push" | "pull" | "both";

export interface SyncResult {
  mode: SyncMode;
  success: boolean;
  logs: string;
  error?: string;
  clientId?: string;
  clientSlug?: string;
}

export async function runRsync(clientId?: string, modeOverride?: SyncMode): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  const localDataDir = process.env.DATA_DIR || "/app/data";

  // Fetch clients to sync
  const clients = clientId 
    ? await db.client.findMany({ where: { id: clientId, rsyncEnabled: true } })
    : await db.client.findMany({ where: { rsyncEnabled: true } });

  if (clients.length === 0) {
    return [{ mode: modeOverride || "push", success: false, error: "Nenhum cliente habilitado para RSYNC encontrado.", logs: "" }];
  }

  for (const client of clients) {
    const host = client.rsyncHost;
    const user = client.rsyncUser;
    const remotePath = client.rsyncPath;
    const sshKey = client.rsyncSshKey;
    const sshPassword = client.rsyncSshPassword;
    const port = client.rsyncSshPort || "22";
    const mode: SyncMode = modeOverride || (client.rsyncMode as SyncMode) || "push";
    const clientSlug = client.slug;
    
    // Each client's data is isolated in /uploads/<slug>
    const localPath = path.join(localDataDir, "uploads", clientSlug);

    if (!host || !user || !remotePath) {
      results.push({ clientId: client.id, clientSlug, mode, success: false, error: "Missing required RSYNC database configuration (Host, User, Path)", logs: "" });
      continue;
    }

    // Ensure local directory exists
    if (!fs.existsSync(localPath)) {
      fs.mkdirSync(localPath, { recursive: true });
    }

    // --- Auth method priority: RSA Key > SSH Password > None ---
    let sshCommand = `ssh -p ${port} -o StrictHostKeyChecking=no`;
    let rsyncPrefix = "";
    const keyPath = `/tmp/rsync_id_rsa_${client.id}`;

    if (sshKey && sshKey.trim() !== "") {
      // Priority 1: RSA private key (most secure)
      fs.writeFileSync(keyPath, sshKey.replace(/\\n/g, "\n"), { encoding: "utf-8", mode: 0o600 });
      sshCommand += ` -i ${keyPath} -o PasswordAuthentication=no`;
    } else if (sshPassword) {
      // Priority 2: SSH password via sshpass
      // Escape single quotes in password to prevent shell injection
      const escapedPassword = sshPassword.replace(/'/g, "'\\''");
      rsyncPrefix = `sshpass -p '${escapedPassword}' `;
      sshCommand += ` -o PasswordAuthentication=yes`;
    }

    const executeSync = async (currentMode: "push" | "pull"): Promise<SyncResult> => {
      try {
        let syncCmd = "";

        if (port === "21") {
          // FTP mode via lftp
          const escapedPassword = sshPassword ? sshPassword.replace(/'/g, "'\\''") : "";
          const auth = `-u '${user}','${escapedPassword}'`;
          
          if (currentMode === "push") {
            syncCmd = `lftp -c "set ssl:verify-certificate no; open -u '${user}','${escapedPassword}' -p ${port} ftp://${host}; mirror -R --delete --verbose '${localPath}/' '${remotePath}'"`;
          } else {
            syncCmd = `lftp -c "set ssl:verify-certificate no; open -u '${user}','${escapedPassword}' -p ${port} ftp://${host}; mirror --delete --verbose '${remotePath}' '${localPath}/'"`;
          }
        } else {
          // SSH/RSYNC mode
          if (currentMode === "push") {
            syncCmd = `${rsyncPrefix}rsync -avz --delete -e "${sshCommand}" ${localPath}/ ${user}@${host}:${remotePath}/`;
          } else {
            syncCmd = `${rsyncPrefix}rsync -avz --delete -e "${sshCommand}" ${user}@${host}:${remotePath}/ ${localPath}/`;
          }
        }

        const { stdout, stderr } = await execAsync(syncCmd);
        return { clientId: client.id, clientSlug, mode: currentMode, success: true, logs: stdout + (stderr ? `\nErrors:\n${stderr}` : "") };
      } catch (err: any) {
        // Sanitize error message to avoid leaking passwords
        const errorMsg = (err.message || err.toString()).replace(sshPassword ? sshPassword : "", "***");
        return { clientId: client.id, clientSlug, mode: currentMode, success: false, logs: err.stdout || "", error: errorMsg };
      }
    };

    if (mode === "push" || mode === "both") {
      results.push(await executeSync("push"));
    }
    
    if (mode === "pull" || mode === "both") {
      results.push(await executeSync("pull"));
    }

    if (fs.existsSync(keyPath)) {
      try { fs.unlinkSync(keyPath); } catch (e) {}
    }
  }

  return results;
}
