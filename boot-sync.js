const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Use the correct generated Prisma client path and adapter
const { PrismaClient } = require('./src/generated/prisma/client/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');

const dbPath = process.env.DATABASE_URL || 'file:/app/data/dev.db';
const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });

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

    let syncCount = 0;
    for (const client of clients) {
      const { slug, sshPasswordHash } = client;
      console.log(`[Boot Sync] Syncing user: ${slug}, has SSH hash: ${!!sshPasswordHash}`);
      
      const passwdFile = fs.readFileSync("/etc/passwd", "utf-8");
      const userExists = passwdFile.split("\n").some(line => line.startsWith(`${slug}:`));
      const homeDir = `/app/data/uploads/${slug}`;

      if (!fs.existsSync(homeDir)) {
        fs.mkdirSync(homeDir, { recursive: true });
      }

      if (!userExists) {
        execSync(`adduser -D -h ${homeDir} -s /bin/sh ${slug}`);
        console.log(`[Boot Sync] Created Linux user: ${slug}`);
      } else {
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
        execSync("chmod 600 /etc/shadow");
        console.log(`[Boot Sync] Injected SHA-512 password hash for: ${slug}`);
      } else {
        console.log(`[Boot Sync] No SSH hash found for ${slug} - account locked.`);
        try { execSync(`passwd -l ${slug}`); } catch(e) {}
      }

      execSync(`chown -R ${slug}:${slug} ${homeDir}`);
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
