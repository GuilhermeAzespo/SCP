#!/bin/sh

# Force the database URL to point to our persistent volume inside the container
export DATABASE_URL="file:/app/data/dev.db"
export DATA_DIR="/app/data"

echo "Applying Prisma database migrations..."
npx prisma migrate deploy

echo "Starting OpenSSH daemon for SCP server..."
# Generate host keys if they don't exist
ssh-keygen -A
# Start sshd in the background
/usr/sbin/sshd

echo "Starting Next.js application..."
exec npm run start
