FROM node:22-bookworm-slim AS base
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 1. Dependencies Stage
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund --legacy-peer-deps && npm cache clean --force

# 2. Builder Stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="file:/app/data/dev.db"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

# 3. Runner Stage
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOME=/app

RUN npm install -g prisma@5.22.0 && npm cache clean --force

COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# Ensure directories for SQLite persistent volume and uploads exist with permissions
RUN mkdir -p .next /app/data /app/public/uploads
COPY --from=builder /app/data/backup-latest.json /app/data/backup-latest.json

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_URL="file:/app/data/dev.db"

# Push DB schema directly to mounted persistent volume on startup without data loss, then start server
CMD ["/bin/sh", "-c", "prisma db push --skip-generate && node server.js"]
