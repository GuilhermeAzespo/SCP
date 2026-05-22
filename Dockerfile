FROM node:22-alpine

# Install build tools for native C++ packages (required for better-sqlite3 compilation) and OpenSSH for SCP server
RUN apk add --no-cache python3 make g++ gcc libc6-compat openssh shadow

WORKDIR /app

# Copy dependency configs
COPY package.json package-lock.json ./

# Install clean dependencies
RUN npm ci

# Copy application files
COPY . .

# Copy custom SSH configuration
COPY sshd_config /etc/ssh/sshd_config

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL="file:/app/data/dev.db"
ENV DATA_DIR="/app/data"
ENV NEXT_TELEMETRY_DISABLED=1

# Generate Prisma Client
RUN npx prisma generate

# Build Next.js application
RUN npm run build

# Ensure persistent data folder exists
RUN mkdir -p /app/data

# Make entrypoint executable
RUN chmod +x entrypoint.sh

# Expose Next.js server port and SCP server port
EXPOSE 3000 22

# Mount persistent storage for sqlite and uploads
VOLUME ["/app/data"]

# Execute entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]
