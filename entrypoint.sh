#!/bin/sh

# Force the database URL to point to our persistent volume inside the container
export DATABASE_URL="file:/app/data/dev.db"
export DATA_DIR="/app/data"

echo "Applying Prisma database migrations..."
npx prisma migrate deploy

# Safety: ensure sshPasswordHash column exists (handles upgrades from older installs)
sqlite3 /app/data/dev.db "ALTER TABLE Client ADD COLUMN sshPasswordHash TEXT;" 2>/dev/null || true

# Safety: ensure rsyncSshPassword column exists (handles upgrades from older installs)
sqlite3 /app/data/dev.db "ALTER TABLE Client ADD COLUMN rsyncSshPassword TEXT;" 2>/dev/null || true

# Safety: ensure rsyncSshPort column exists (handles upgrades from older installs)
sqlite3 /app/data/dev.db "ALTER TABLE Client ADD COLUMN rsyncSshPort TEXT;" 2>/dev/null || true

# Safety: ensure rsyncProtocol column exists (handles upgrades from older installs)
sqlite3 /app/data/dev.db "ALTER TABLE Client ADD COLUMN rsyncProtocol TEXT DEFAULT 'rsync';" 2>/dev/null || true

# CRITICAL: OpenSSH ChrootDirectory requires ALL parent directories to be
# owned by root and NOT writable by group or others (no 'w' in group/other bits).
#
# Docker volumes are often mounted with 777 permissions by the host/orchestrator
# (e.g. EasyPanel, Portainer). This MUST be fixed at runtime after the volume is
# mounted, otherwise sshd will refuse ChrootDirectory with:
#   "bad ownership or modes for chroot directory"
#
# Fix order: root parents first, then uploads dir
chown root:root / /app /app/data /app/data/uploads 2>/dev/null || true
chmod 755 / /app /app/data /app/data/uploads 2>/dev/null || true

# Verify the permissions were applied (logged for debugging)
echo "[Entrypoint] Directory permissions after fix:"
ls -ld / /app /app/data /app/data/uploads 2>/dev/null || true

echo "Restoring SSH users and directory structure from database..."
node boot-sync.js

echo "Starting OpenSSH daemon for SCP server..."
# Generate host keys if they don't exist
ssh-keygen -A
# Start sshd in the background and log to a file we can read via API
/usr/sbin/sshd -D -e > /app/data/sshd.log 2>&1 &

echo "Starting RSYNC background cron service..."
node rsync-cron.js &

echo "Starting Next.js application..."
exec npm run start