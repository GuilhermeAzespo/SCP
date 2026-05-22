#!/bin/sh

# Force the database URL to point to our persistent volume inside the container
export DATABASE_URL="file:/app/data/dev.db"
export DATA_DIR="/app/data"

echo "Applying Prisma database migrations..."
npx prisma migrate deploy

echo "Starting OpenSSH daemon for SCP server..."
# Generate host keys if they don't exist
ssh-keygen -A
# Sync users from DB to Linux
node boot-sync.js
# Start sshd in the background but do not detach (-D) so we can see its logs in stderr (-e)
/usr/sbin/sshd -D -e &

echo "Starting Next.js application..."
exec npm run start
