import { execSync } from "child_process";
import fs from "fs";

/**
 * Creates or updates a Linux user for SSH/SCP access.
 * Uses chpasswd (Alpine-native) to set the password with SHA-512 hashing.
 * 
 * @returns The SHA-512 hash from /etc/shadow after setting the password, for persistence in DB.
 */
export function syncSshUser(
  slug: string,
  plainPassword: string | null,
  sshPasswordHash: string | null
): string | null {
  try {
    // Only run in Linux environments (Docker container)
    if (!fs.existsSync("/etc/passwd")) return null;

    const homeDir = `/app/data/uploads/${slug}`;

    // Ensure upload directory exists
    if (!fs.existsSync(homeDir)) {
      fs.mkdirSync(homeDir, { recursive: true });
    }

    // Ensure group client exists
    const groupFile = fs.readFileSync("/etc/group", "utf-8");
    if (!groupFile.includes("client:")) {
      execSync(`addgroup client`);
      console.log(`[SSH Sync] Created client group`);
    }

    // Create Linux user if it doesn't exist
    const passwdFile = fs.readFileSync("/etc/passwd", "utf-8");
    const userExists = passwdFile.split("\n").some(line => line.startsWith(`${slug}:`));

    if (!userExists) {
      // Use -H to prevent adduser from trying to create or chown the home directory.
      // Without -H, adduser -h / will execute `chown slug:client /`, which breaks OpenSSH chroot.
      execSync(`adduser -D -H -G client -h / -s /bin/sh ${slug}`);
      console.log(`[SSH Sync] Created Linux user: ${slug}`);
    }

    if (plainPassword) {
      // Use spawnSync to pass the password via stdin safely.
      // This avoids shell interpolation issues if the password contains $ or '.
      try {
        const { spawnSync } = require('child_process');
        const chpasswdResult = spawnSync('chpasswd', [], { 
          input: `${slug}:${plainPassword}\n`, 
          encoding: 'utf-8' 
        });
        
        if (chpasswdResult.status !== 0) {
          throw new Error(`chpasswd failed with status ${chpasswdResult.status}: ${chpasswdResult.stderr}`);
        }
        console.log(`[SSH Sync] Set password via chpasswd safely for: ${slug}`);
      } catch (e: any) {
        console.error(`[SSH Sync] chpasswd failed for ${slug}:`, e?.message || e);
        throw e; // throw to be caught by the outer catch block
      }

      // Read back the generated hash from /etc/shadow for persistence
      const shadowFile = fs.readFileSync("/etc/shadow", "utf-8");
      const shadowLine = shadowFile.split("\n").find(line => line.startsWith(`${slug}:`));
      if (shadowLine) {
        const generatedHash = shadowLine.split(":")[1];
        console.log(`[SSH Sync] Captured hash for DB persistence: ${slug}`);
        
        setupChrootEnv(slug, homeDir);
        return generatedHash; // Return for storage in DB
      }

    } else if (sshPasswordHash) {
      // Boot restore: inject stored SHA-512 hash directly into /etc/shadow
      const shadowFile = fs.readFileSync("/etc/shadow", "utf-8");
      const newShadow = shadowFile.split("\n").map(line => {
        if (line.startsWith(`${slug}:`)) {
          const parts = line.split(":");
          parts[1] = sshPasswordHash;
          return parts.join(":");
        }
        return line;
      }).join("\n");
      fs.writeFileSync("/etc/shadow", newShadow);
      execSync("chmod 640 /etc/shadow");
      console.log(`[SSH Sync] Restored SHA-512 hash from DB for: ${slug}`);
      
      setupChrootEnv(slug, homeDir);
    } else {
      // No password: lock the account
      execSync(`passwd -l ${slug}`);
      console.log(`[SSH Sync] No password for ${slug}, account locked.`);
      setupChrootEnv(slug, homeDir);
    }
  } catch (error) {
    console.error(`[SSH Sync] Error syncing user ${slug}:`, error);
  }

  return null;
}

function setupChrootEnv(slug: string, homeDir: string) {
  try {
    // 1. Root must own the chroot directory for ChrootDirectory to work
    execSync(`chown root:root ${homeDir}`);
    execSync(`chmod 755 ${homeDir}`);

    // 2. Create the writable "files" directory for the user
    const filesDir = `${homeDir}/files`;
    if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir);
    execSync(`chown ${slug}:client ${filesDir}`);
    execSync(`chmod 770 ${filesDir}`);

    // 3. Build minimal chroot environment (binaries and libs)
    const dirs = ['bin', 'usr/bin', 'lib', 'usr/lib', 'etc'];
    for (const d of dirs) {
      if (!fs.existsSync(`${homeDir}/${d}`)) {
        fs.mkdirSync(`${homeDir}/${d}`, { recursive: true });
      }
    }

    // Copy binaries
    const binaries = ['/bin/sh', '/usr/bin/scp', '/usr/bin/rsync'];
    for (const bin of binaries) {
      if (fs.existsSync(bin)) {
        fs.copyFileSync(bin, `${homeDir}${bin}`);
        execSync(`chmod +x ${homeDir}${bin}`);
        
        // Find and copy dependencies using ldd (Alpine uses musl libc)
        try {
          const lddOut = execSync(`ldd ${bin} 2>/dev/null || true`, { encoding: 'utf-8' });
          const lines = lddOut.split('\n');
          for (const line of lines) {
            const match = line.match(/=>\s+(.*?)\s+\(/) || line.match(/^\s+(.*?)\s+\(/) || line.match(/([/\w.-]+\.so[\d.]*)/);
            if (match && match[1]) {
              const lib = match[1].trim();
              if (lib && fs.existsSync(lib) && !lib.startsWith('linux-vdso')) {
                const libDest = `${homeDir}${lib}`;
                if (!fs.existsSync(libDest)) {
                  fs.mkdirSync(libDest.substring(0, libDest.lastIndexOf('/')), { recursive: true });
                  fs.copyFileSync(lib, libDest);
                }
              }
            }
          }
        } catch (e) {}
      }
    }

    // 4. Create fake /etc/passwd inside chroot so `ls -l` shows correct username
    const passwdContent = `root:x:0:0:root:/root:/bin/sh\n${slug}:x:1000:1000:,,,:/files:/bin/sh\n`;
    fs.writeFileSync(`${homeDir}/etc/passwd`, passwdContent);
    execSync(`chmod 644 ${homeDir}/etc/passwd`);

  } catch (err: any) {
    console.error(`[SSH Sync] Error setting up chroot env for ${slug}:`, err.message);
  }
}

/**
 * Removes a Linux user when the client is deleted from the web panel.
 */
export function deleteSshUser(slug: string) {
  try {
    if (!fs.existsSync("/etc/passwd")) return;

    const passwdFile = fs.readFileSync("/etc/passwd", "utf-8");
    const userExists = passwdFile.split("\n").some(line => line.startsWith(`${slug}:`));

    if (userExists) {
      execSync(`deluser ${slug}`);
      console.log(`[SSH Sync] Deleted Linux user: ${slug}`);
    }
  } catch (error) {
    console.error(`[SSH Sync] Error deleting user ${slug}:`, error);
  }
}

/**
 * Boot restore: re-syncs all persisted clients from DB back to Linux users.
 * Uses stored SHA-512 hashes since plaintext is not available at boot.
 */
export async function syncAllSshUsers(clients: { slug: string, passwordHash: string | null }[]) {
  console.log("[SSH Sync] Starting full synchronization of database clients to Linux users...");
  let syncCount = 0;
  for (const client of clients) {
    syncSshUser(client.slug, null, client.passwordHash); // passwordHash here is already sshPasswordHash
    syncCount++;
  }
  console.log(`[SSH Sync] Successfully synchronized ${syncCount} users.`);
}
