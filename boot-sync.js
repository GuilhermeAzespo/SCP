const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Use the correct generated Prisma client path and adapter
const { PrismaClient } = require('./src/generated/prisma/client/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');

const dbPath = process.env.DATABASE_URL || 'file:/app/data/dev.db';
const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });

/**
 * Sets up the chroot environment for SCP/SFTP access.
 *
 * Since sshd_config uses "ForceCommand internal-sftp", the sshd built-in
 * SFTP server handles all transfers — no binaries or libs needed inside chroot.
 *
 * OpenSSH ChrootDirectory requirements:
 * 1. The chroot directory AND all parents must be owned by root, not writable by others.
 * 2. The user needs a writable subdirectory for their files.
 */
function setupChrootEnv(slug, homeDir) {
  // homeDir = /app/data/uploads/<slug>  (this IS the ChrootDirectory)
  const filesDir = `${homeDir}/files`;

  // Ensure directories exist
  if (!fs.existsSync(homeDir)) fs.mkdirSync(homeDir, { recursive: true });
  if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });

  // ChrootDirectory MUST be owned by root (OpenSSH strict requirement)
  execSync(`chown root:root ${homeDir}`);
  execSync(`chmod 755 ${homeDir}`);

  // The writable /files subfolder is owned by the client user
  execSync(`chown ${slug}:client ${filesDir}`);
  execSync(`chmod 770 ${filesDir}`);

  // Create a minimal /etc/passwd inside the chroot so 'ls -l' shows correct username
  const chrootEtcDir = `${homeDir}/etc`;
  if (!fs.existsSync(chrootEtcDir)) fs.mkdirSync(chrootEtcDir, { recursive: true });
  const passwdContent = `root:x:0:0:root:/root:/bin/sh\n${slug}:x:1000:1000:,,,:/ :/bin/sh\n`;
  fs.writeFileSync(`${homeDir}/etc/passwd`, passwdContent);
  execSync(`chmod 644 ${homeDir}/etc/passwd`);
}

async function run() {
  console.log("[Boot Sync] Starting standalone SSH user synchronization...");
  try {
    // Only run in Linux environments (Docker)
    if (!fs.existsSync("/etc/passwd")) {
      console.log("[Boot Sync] Not a Linux environment, skipping SSH sync.");
      return;
    }

    const clients = await prisma.client.findMany();
    console.log(`[Boot Sync] Found ${clients.length} clients in database.`);

    // Ensure the 'client' group exists (required by sshd_config Match Group client)
    const groupFile = fs.readFileSync("/etc/group", "utf-8");
    if (!groupFile.includes("client:")) {
      execSync(`addgroup client`);
      console.log(`[Boot Sync] Created 'client' group`);
    }

    let syncCount = 0;
    for (const client of clients) {
      const { slug, sshPasswordHash } = client;
      console.log(`[Boot Sync] Syncing user: ${slug}, has SSH hash: ${!!sshPasswordHash}`);
      
      const passwdFile = fs.readFileSync("/etc/passwd", "utf-8");
      const userExists = passwdFile.split("\n").some(line => line.startsWith(`${slug}:`));
      const homeDir = `/app/data/uploads/${slug}`;

      if (!userExists) {
        // -H: don't create/chown a separate home dir; -G client: add to client group
        // Home is set to /files so the user lands in the right folder on login
        execSync(`adduser -D -H -G client -h /files -s /bin/sh ${slug}`);
        console.log(`[Boot Sync] Created Linux user: ${slug}`);
      } else {
        // Ensure existing user is in the client group
        try { execSync(`adduser ${slug} client`); } catch(e) {}
        console.log(`[Boot Sync] Linux user already exists: ${slug}`);
      }

      if (sshPasswordHash) {
        // Direct injection into /etc/shadow using the SHA-512 hash (Alpine-compatible)
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
        console.log(`[Boot Sync] Injected SHA-512 password hash for: ${slug}`);
      } else {
        console.log(`[Boot Sync] No SSH hash found for ${slug} - account locked.`);
        try { execSync(`passwd -l ${slug}`); } catch(e) {}
      }

      // Setup chroot environment (permissions + /files dir + fake /etc/passwd)
      setupChrootEnv(slug, homeDir);

      syncCount++;
    }
    console.log(`[Boot Sync] Successfully synchronized ${syncCount} users.`);
  } catch (e) {
    console.error("[Boot Sync] Critical Error during sync:", e.message);
    console.error(e.stack);
  } finally {
    await prisma.$disconnect();
  }
}

run();