-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "passwordHash" TEXT,
    "sshPasswordHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "rsyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rsyncMode" TEXT NOT NULL DEFAULT 'push',
    "rsyncCron" TEXT,
    "rsyncHost" TEXT,
    "rsyncUser" TEXT,
    "rsyncPath" TEXT,
    "rsyncSshKey" TEXT
);
INSERT INTO "new_Client" ("createdAt", "id", "name", "passwordHash", "slug", "sshPasswordHash", "updatedAt") SELECT "createdAt", "id", "name", "passwordHash", "slug", "sshPasswordHash", "updatedAt" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE UNIQUE INDEX "Client_slug_key" ON "Client"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

