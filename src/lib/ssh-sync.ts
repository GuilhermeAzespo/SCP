import { execSync } from "child_process";
import fs from "fs";

/**
 * Ensures a Linux user exists and has the correct password hash in /etc/shadow.
 * This allows IP phones to authenticate via SCP using the exact same credentials
 * configured in the web panel.
 */
export function syncSshUser(slug: string, passwordHash: string | null) {
  try {
    // Only run in Linux environments (Docker)
    if (!fs.existsSync("/etc/passwd")) return;

    const passwdFile = fs.readFileSync("/etc/passwd", "utf-8");
    const userExists = passwdFile.split("\n").some(line => line.startsWith(`${slug}:`));
    const homeDir = `/app/data/uploads/${slug}`;

    // Ensure upload directory exists before creating user
    if (!fs.existsSync(homeDir)) {
      fs.mkdirSync(homeDir, { recursive: true });
    }

    if (!userExists) {
      // Create user
      // -D: don't assign a password yet
      // -h: set home directory
      // -s: set shell to /bin/sh (so they can run scp)
      execSync(`adduser -D -h ${homeDir} -s /bin/sh ${slug}`);
      console.log(`[SSH Sync] Created Linux user: ${slug}`);
    }

    if (passwordHash) {
      // Update the password in /etc/shadow directly using chpasswd -e (encrypted)
      // Alpine's musl libc supports $2a$ (bcrypt) hashes natively!
      execSync(`echo "${slug}:${passwordHash}" | chpasswd -e`);
    } else {
      // Lock the account if there is no password to prevent unauthorized SSH access
      execSync(`passwd -l ${slug}`);
    }

    // Ensure the home directory is owned by the user so they can upload files via SCP
    execSync(`chown -R ${slug}:${slug} ${homeDir}`);
    
  } catch (error) {
    console.error(`[SSH Sync] Error syncing user ${slug}:`, error);
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
      // Delete the user
      execSync(`deluser ${slug}`);
      console.log(`[SSH Sync] Deleted Linux user: ${slug}`);
    }
  } catch (error) {
    console.error(`[SSH Sync] Error deleting user ${slug}:`, error);
  }
}

/**
 * Performs a full synchronization of all clients from the database.
 * Used during container boot to ensure the volatile /etc/passwd matches the persistent SQLite database.
 */
export async function syncAllSshUsers(clients: { slug: string, passwordHash: string | null }[]) {
  console.log("[SSH Sync] Starting full synchronization of database clients to Linux users...");
  let syncCount = 0;
  for (const client of clients) {
    syncSshUser(client.slug, client.passwordHash);
    syncCount++;
  }
  console.log(`[SSH Sync] Successfully synchronized ${syncCount} users.`);
}
