# ============================================
# Cloud Run Dockerfile — AI English Platform
# Multi-stage build: Next.js standalone output
# ============================================

# ---- Stage 1: Build ----
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies (sharp needs compilation)
RUN apk add --no-cache python3 make g++

# Copy dependency manifests + prisma schema first
COPY package*.json ./
COPY prisma/ ./prisma/

# Install dependencies (skip postinstall — prisma generate needs prisma/ folder we just copied)
RUN npm ci --ignore-scripts

# Generate Prisma client (postinstall normally does this, but we skipped it)
RUN npx prisma generate

# Copy all remaining source files
COPY . .

# Build-time placeholder secrets (only used during `next build` page collection)
# Real secrets are injected by Cloud Run at runtime via environment variables
ENV NEXT_TELEMETRY_DISABLED=1
ENV JWT_SECRET=build-placeholder-not-used-at-runtime-32chars!!
ENV AUTH_SECRET=build-placeholder-not-used-at-runtime-32chars!!
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
ENV AUTH_GOOGLE_ID=build-placeholder.apps.googleusercontent.com
ENV AUTH_GOOGLE_SECRET=GOCSPX-build-placeholder-not-real
ENV GOOGLE_APPLICATION_CREDENTIALS=/app/materials/gcp-service-account.json

RUN npm run build

# ---- Stage 2: Production Runtime ----
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
# ⚠️ 不設 HOSTNAME — Next.js 會用它生成 redirect URL（設 0.0.0.0 會導致 redirect 到錯誤網址）

# Install runtime dependencies only
RUN apk add --no-cache tzdata
RUN ln -sf /usr/share/zoneinfo/Asia/Hong_Kong /etc/localtime

# Copy standalone output from builder
COPY --from=builder /app/.next/standalone ./

# Copy static assets (public + .next/static)
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma client (generated in builder)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

# GCP 憑證說明：gcloud 預設 exclude credential JSON files
# 請在 Cloud Run 執行階段透過環境變數注入：
#   GCP_SERVICE_ACCOUNT_JSON=<service-account-json-content>
# 或
#   GOOGLE_APPLICATION_CREDENTIALS=/path/to/mounted/secret

# Run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
USER nextjs

EXPOSE 8080

# Start Next.js server
CMD ["node", "server.js"]
