# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# QROAD Influencer Outreach Assistant — production image
# Multi-stage build producing a minimal, non-root Next.js standalone server.
# ---------------------------------------------------------------------------

FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# --- Dependencies ----------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# `npm ci` runs the postinstall `prisma generate`, which needs the schema above.
RUN npm ci --ignore-scripts=false

# --- Build -----------------------------------------------------------------
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL is only needed at runtime; the build never reaches the database
# because every data-backed route is marked dynamic.
RUN npx prisma generate && npm run build

# --- Runtime ---------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV STORAGE_DIR=/data/storage

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /data/storage \
  && chown -R nextjs:nodejs /data/storage

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Migrations, schema and seed are shipped so an operator can run
# `npx prisma migrate deploy` against the running container.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

USER nextjs
EXPOSE 3000
VOLUME ["/data/storage"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
