# ── Build ────────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# better-sqlite3 bringt fertige Linux-Binaries mit; „nuxt prepare“ (postinstall) läuft erst beim Build
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# ── Laufzeit ─────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NUXT_DB_PATH=/data/db/planner.sqlite \
    NUXT_UPLOAD_DIR=/data/uploads \
    NUXT_MIGRATIONS_DIR=/app/migrations
COPY --from=build /app/.output ./.output
COPY --from=build /app/server/database/migrations ./migrations
RUN mkdir -p /data/db /data/uploads && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
