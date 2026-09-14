#!/bin/sh

# Force the database URL to point to our persistent volume inside the container
export DATABASE_URL="file:/app/data/dev.db"
export DATA_DIR="/app/data"

# CRITICAL: Force chpasswd to use SHA-512 (algorithm $6$) instead of the
# Alpine default yescrypt ($y$). OpenSSH with UsePAM=no reads /etc/shadow
# directly and uses libcrypt for hash verification. Alpine's libcrypt may
# not support yescrypt, causing silent authentication failures.
# SHA-512 is universally supported and recommended for compatibility.
if [ -f /etc/login.defs ]; then
  # Remove any existing ENCRYPT_METHOD line and add SHA512
  sed -i '/^ENCRYPT_METHOD/d' /etc/login.defs
  echo "ENCRYPT_METHOD SHA512" >> /etc/login.defs
  # Also ensure SHA_CRYPT_MIN_ROUNDS is reasonable
  sed -i '/^SHA_CRYPT_MIN_ROUNDS/d' /etc/login.defs
  echo "SHA_CRYPT_MIN_ROUNDS 5000" >> /etc/login.defs
  echo "[Entrypoint] Set ENCRYPT_METHOD to SHA512 in /etc/login.defs"
else
  # If login.defs doesn't exist, create it with the minimum needed
  echo "ENCRYPT_METHOD SHA512" > /etc/login.defs
  echo "SHA_CRYPT_MIN_ROUNDS 5000" >> /etc/login.defs
  echo "[Entrypoint] Created /etc/login.defs with SHA512"
fi

echo "Applying Prisma database migrations..."
npx prisma migrate deploy

# Safety: ensure sshPasswordHash column exists (handles upgrades from older installs)
sqlite3 /app/data/dev.db "ALTER TABLE Client ADD COLUMN sshPasswordHash TEXT;" 2>/dev/null || true

# Safety: ensure rsyncSshPassword column exists
sqlite3 /app/data/dev.db "ALTER TABLE Client ADD COLUMN rsyncSshPassword TEXT;" 2>/dev/null || true

# Safety: ensure rsyncSshPort column exists
sqlite3 /app/data/dev.db "ALTER TABLE Client ADD COLUMN rsyncSshPort TEXT;" 2>/dev/null || true

# Safety: ensure rsyncProtocol column exists
sqlite3 /app/data/dev.db "ALTER TABLE Client ADD COLUMN rsyncProtocol TEXT DEFAULT 'rsync';" 2>/dev/null || true

# CRITICAL: OpenSSH ChrootDirectory requires ALL parent directories to be
# owned by root and NOT writable by group or others (no 'w' in group/other bits).
# Docker volumes are often mounted with 777 permissions by EasyPanel/Portainer.
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