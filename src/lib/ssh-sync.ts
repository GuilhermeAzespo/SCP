import { execSync, spawnSync } from "child_process";
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

    // Create Linux user if it doesn't exist
    const passwdFile = fs.readFileSync("/etc/passwd", "utf-8");
    const userExists = passwdFile.split("\n").some(line => line.startsWith(`${slug}:`));

    if (!userExists) {
      execSync(`adduser -D -h ${homeDir} -s /bin/sh ${slug}`);
      console.log(`[SSH Sync] Created Linux user: ${slug}`);
    }

    if (plainPassword) {
      // Use spawnSync to pipe credentials directly to chpasswd, avoiding shell escaping issues
      const result = spawnSync("chpasswd", ["-c", "SHA512"], {
        input: `${slug}:${plainPassword}\n`,
        encoding: "utf8",
        timeout: 5000,
      });
      
      if (result.error) {
        console.error(`[SSH Sync] chpasswd spawn error for ${slug}:`, result.error.message);
      } else if (result.status !== 0) {
        console.error(`[SSH Sync] chpasswd failed for ${slug} (exit ${result.status}):`, result.stderr);
      } else {
        console.log(`[SSH Sync] Set password via chpasswd for: ${slug}`);
      }

      // Read back the generated SHA-512 hash from /etc/shadow for persistence
      const shadowFile = fs.readFileSync("/etc/shadow", "utf-8");
      const shadowLine = shadowFile.split("\n").find(line => line.startsWith(`${slug}:`));
      if (shadowLine) {
        const generatedHash = shadowLine.split(":")[1];
        console.log(`[SSH Sync] Captured SHA-512 hash for DB persistence: ${slug}`);
        execSync(`chown -R ${slug}:${slug} ${homeDir}`);
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
    } else {
      // No password: lock the account
      execSync(`passwd -l ${slug}`);
      console.log(`[SSH Sync] No password for ${slug}, account locked.`);
    }

    execSync(`chown -R ${slug}:${slug} ${homeDir}`);
  } catch (error) {
    console.error(`[SSH Sync] Error syncing user ${slug}:`, error);
  }

  return null;
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
