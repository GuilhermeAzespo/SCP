import { execSync, spawnSync } from "child_process";
import fs from "fs";

/**
 * Creates or updates a Linux user for SSH/SCP access.
 *
 * IMPORTANT - Password hashing strategy:
 * Alpine Linux shadow 4.18+ uses yescrypt ($y$) as default algorithm in chpasswd.
 * However, musl libc (used by Alpine) does NOT support yescrypt in libcrypt.
 * OpenSSH with UsePAM=no uses libcrypt to verify passwords from /etc/shadow.
 * Result: yescrypt hashes cause silent authentication failure even with correct password.
 *
 * FIX: We generate a SHA-512 ($6$) hash directly using `openssl passwd -6`
 * and inject it into /etc/shadow, bypassing chpasswd entirely.
 * SHA-512 is supported by musl libcrypt and all OpenSSH versions.
 *
 * @returns The SHA-512 hash stored in /etc/shadow, for persistence in DB.
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
      execSync(`adduser -D -H -G client -h /files -s /bin/sh ${slug}`);
      console.log(`[SSH Sync] Created Linux user: ${slug}`);
    }

    if (plainPassword) {
      // Generate SHA-512 hash using openssl passwd -6 (explicit SHA-512, musl-compatible)
      // This bypasses chpasswd and its dependency on /etc/login.defs ENCRYPT_METHOD,
      // which defaults to yescrypt ($y$) on Alpine shadow 4.18+ — unsupported by musl libcrypt.
      let sha512Hash: string | null = null;
      try {
        const result = spawnSync('openssl', ['passwd', '-6', '-stdin'], {
          input: plainPassword,
          encoding: 'utf-8'
        });
        if (result.status === 0 && result.stdout) {
          sha512Hash = result.stdout.trim();
          console.log(`[SSH Sync] Generated SHA-512 hash via openssl for: ${slug}`);
        } else {
          throw new Error(`openssl passwd -6 failed: ${result.stderr}`);
        }
      } catch (e: any) {
        console.error(`[SSH Sync] openssl passwd failed for ${slug}:`, e?.message || e);
        // Fallback: try chpasswd
        try {
          const chpasswdResult = spawnSync('chpasswd', [], {
            input: `${slug}:${plainPassword}\n`,
            encoding: 'utf-8'
          });
          if (chpasswdResult.status !== 0) {
            throw new Error(`chpasswd also failed: ${chpasswdResult.stderr}`);
          }
          console.log(`[SSH Sync] Set password via chpasswd fallback for: ${slug}`);
        } catch (e2: any) {
          console.error(`[SSH Sync] Both openssl and chpasswd failed for ${slug}:`, e2?.message || e2);
          throw e2;
        }
      }

      if (sha512Hash) {
        // Inject the SHA-512 hash directly into /etc/shadow
        injectHashIntoShadow(slug, sha512Hash);
        setupChrootEnv(slug, homeDir);
        return sha512Hash;
      } else {
        // Fallback: read back whatever chpasswd wrote
        const shadowFile = fs.readFileSync("/etc/shadow", "utf-8");
        const shadowLine = shadowFile.split("\n").find(line => line.startsWith(`${slug}:`));
        if (shadowLine) {
          const generatedHash = shadowLine.split(":")[1];
          console.log(`[SSH Sync] Captured hash from shadow for: ${slug}`);
          setupChrootEnv(slug, homeDir);
          return generatedHash;
        }
      }

    } else if (sshPasswordHash) {
      // Boot restore: inject stored SHA-512 hash directly into /etc/shadow
      injectHashIntoShadow(slug, sshPasswordHash);
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

/**
 * Injects a password hash directly into /etc/shadow for the given user.
 * More reliable than chpasswd because it bypasses /etc/login.defs algorithm settings.
 */
function injectHashIntoShadow(slug: string, hash: string) {
  const shadowFile = fs.readFileSync("/etc/shadow", "utf-8");
  const newShadow = shadowFile.split("\n").map(line => {
    if (line.startsWith(`${slug}:`)) {
      const parts = line.split(":");
      parts[1] = hash;
      return parts.join(":");
    }
    return line;
  }).join("\n");
  fs.writeFileSync("/etc/shadow", newShadow);
  execSync("chmod 640 /etc/shadow");
  console.log(`[SSH Sync] Injected SHA-512 hash into /etc/shadow for: ${slug}`);
}

/**
 * Sets up the chroot environment for a client user.
 *
 * Since sshd_config uses "ForceCommand internal-sftp", the sshd built-in
 * SFTP server handles all transfers — no binaries or libs needed in chroot.
 *
 * OpenSSH ChrootDirectory requirements:
 * 1. The directory and ALL parents must be owned by root, not writable by others.
 * 2. A writable subdirectory for the user's files.
 */
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

    // 3. Create a fake /etc/passwd inside the chroot so `ls -l` shows correct username
    const chrootEtcDir = `${homeDir}/etc`;
    if (!fs.existsSync(chrootEtcDir)) fs.mkdirSync(chrootEtcDir, { recursive: true });
    const passwdContent = `root:x:0:0:root:/root:/bin/sh\n${slug}:x:1000:1000:,,,:/ :/bin/sh\n`;
    fs.writeFileSync(`${homeDir}/etc/passwd`, passwdContent);
    execSync(`chmod 644 ${homeDir}/etc/passwd`);

    console.log(`[SSH Sync] Chroot environment ready for: ${slug}`);
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
 */
export async function syncAllSshUsers(clients: { slug: string, passwordHash: string | null }[]) {
  console.log("[SSH Sync] Starting full synchronization of database clients to Linux users...");
  let syncCount = 0;
  for (const client of clients) {
    syncSshUser(client.slug, null, client.passwordHash);
    syncCount++;
  }
  console.log(`[SSH Sync] Successfully synchronized ${syncCount} users.`);
}