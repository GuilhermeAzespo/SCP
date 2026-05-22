const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const { execSync } = require('child_process');

const prisma = new PrismaClient();

async function run() {
  console.log("[Boot Sync] Starting standalone SSH user synchronization...");
  try {
    const clients = await prisma.client.findMany();
    
    // Only run in Linux environments (Docker)
    if (!fs.existsSync("/etc/passwd")) {
      console.log("[Boot Sync] Not a Linux environment, skipping SSH sync.");
      return;
    }

    let syncCount = 0;
    for (const client of clients) {
      const { slug, passwordHash } = client;
      
      const passwdFile = fs.readFileSync("/etc/passwd", "utf-8");
      const userExists = passwdFile.split("\n").some(line => line.startsWith(`${slug}:`));
      const homeDir = `/app/data/uploads/${slug}`;

      if (!fs.existsSync(homeDir)) {
        fs.mkdirSync(homeDir, { recursive: true });
      }

      if (!userExists) {
        execSync(`adduser -D -h ${homeDir} -s /bin/sh ${slug}`);
        console.log(`[Boot Sync] Created Linux user: ${slug}`);
      }

      if (passwordHash) {
        // Direct injection into /etc/shadow
        const shadowFile = fs.readFileSync("/etc/shadow", "utf-8");
        const newShadow = shadowFile.split("\n").map(line => {
          if (line.startsWith(`${slug}:`)) {
            const parts = line.split(":");
            parts[1] = passwordHash;
            return parts.join(":");
          }
          return line;
        }).join("\n");
        fs.writeFileSync("/etc/shadow", newShadow);
        execSync("chmod 600 /etc/shadow");
      } else {
        try {
          execSync(`passwd -l ${slug}`);
        } catch(e) {}
      }

      execSync(`chown -R ${slug}:${slug} ${homeDir}`);
      syncCount++;
    }
    console.log(`[Boot Sync] Successfully synchronized ${syncCount} users.`);
  } catch (e) {
    console.error("[Boot Sync] Critical Error during sync:", e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
