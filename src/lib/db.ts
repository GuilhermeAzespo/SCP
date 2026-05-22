import { PrismaClient } from "@/generated/prisma/client/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";
import fs from "fs";

// Resolve database path dynamically to ensure consistency between prisma CLI and Next.js runtime
const getDatabaseUrl = () => {
  const envUrl = process.env.DATABASE_URL || "file:./data/dev.db";
  
  if (envUrl.startsWith("file:")) {
    const rawPath = envUrl.substring(5); // strip "file:"
    
    let absolutePath = path.resolve(rawPath);
    
    // If it points relative to prisma folder (e.g. "../data/dev.db")
    if (rawPath.startsWith("../") || rawPath.includes("prisma")) {
      // Resolve relative to cwd
      absolutePath = path.resolve(process.cwd(), "data", path.basename(rawPath));
    }
    
    // Ensure parent directory exists!
    const parentDir = path.dirname(absolutePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    
    return `file:${absolutePath}`;
  }
  
  return envUrl;
};

const dbUrl = getDatabaseUrl();

const adapter = new PrismaBetterSqlite3({ url: dbUrl });

import { initDatabase } from "./init";

// Prevent multiple instances of Prisma Client in development hot reloading
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

// Run database initialization asynchronously
initDatabase().catch((err) => {
  console.error("Failed to initialize database:", err);
});

