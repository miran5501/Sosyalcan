# SosyalCan web + API imajı. Kökteki docker-compose.yml ile kullanılır (`docker compose --profile app up -d --build`).
# Aşamalar: deps (paketler) → builder (derleme; aynı imaj açılışta migration/ilk Admin için de kullanılır) → runner (küçük çalışma imajı).

FROM node:22-bookworm-slim AS base
# Prisma motoru için OpenSSL
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# public klasörü boşsa git onu taşımaz; çalışma imajı kopyalayabilsin diye her durumda var olsun.
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1
# Ortam değişkenleri derlemede değil açılışta denetlenir (gizli anahtarlar imaja girmez); bu yüzden doğrudan next build.
RUN npx prisma generate && npx next build

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 STORAGE_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown -R node:node /data
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
