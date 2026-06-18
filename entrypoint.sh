#!/bin/sh

# Force the database URL to point to our persistent volume inside the container
export DATABASE_URL="file:/app/data/dev.db"
export DATA_DIR="/app/data"

echo "Applying Prisma database migrations..."
npx prisma migrate deploy

# Safety: ensure sshPasswordHash column exists (handles upgrades from older installs)
# This is idempotent - if the column already exists, the command fails silently
sqlite3 /app/data/dev.db "ALTER TABLE Client ADD COLUMN sshPasswordHash TEXT;" 2>/dev/null || true

# Safety: ensure rsyncSshPassword column exists (handles upgrades from older installs)
sqlite3 /app/data/dev.db "ALTER TABLE Client ADD COLUMN rsyncSshPassword TEXT;" 2>/dev/null || true

# Safety: ensure rsyncSshPort column exists (handles upgrades from older installs)
sqlite3 /app/data/dev.db "ALTER TABLE Client ADD COLUMN rsyncSshPort TEXT;" 2>/dev/null || true

# Safety: ensure rsyncProtocol column exists (handles upgrades from older installs)
sqlite3 /app/data/dev.db "ALTER TABLE Client ADD COLUMN rsyncProtocol TEXT DEFAULT 'rsync';" 2>/dev/null || true

echo "Starting OpenSSH daemon for SCP server..."
# Generate host keys if they don't exist
ssh-keygen -A
# Start sshd in the background (foreground mode + stderr so we see its logs)
/usr/sbin/sshd -D -e &

echo "Starting RSYNC background cron service..."
node rsync-cron.js &

echo "Starting Next.js application..."
exec npm run start
