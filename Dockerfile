# Multi-Stage Production Dockerfile for FROSE Street Backend
FROM node:20-alpine AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate

# Copy package manifests
COPY package.json pnpm-lock.yaml tsconfig.json ./

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY server/ ./server/
COPY shared/ ./shared/

# Build TypeScript
RUN pnpm build

# --- Production Runner Stage ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3100
ENV HOST=0.0.0.0

RUN corepack enable && corepack prepare pnpm@11.24.0 --activate

# Copy production manifests & install production dependencies only
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist
COPY client/ ./client/

# Expose port
EXPOSE 3100

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3100/health || exit 1

# Run server
CMD ["node", "dist/server/src/index.js"]
