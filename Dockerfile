# Multi-stage build: compile the dashboard and the server, then ship a small
# runtime image with only what's needed to run.

# ---- build ----
FROM node:24-bookworm-slim AS build

# better-sqlite3 is a native module; these are here in case there's no prebuilt
# binary for this platform and it has to compile from source.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# install deps first so they stay cached until a lockfile actually changes
COPY web/package.json web/package-lock.json web/
RUN npm --prefix web ci
COPY server/package.json server/package-lock.json server/
RUN npm --prefix server ci

# then the source, and build both. vite outputs into ../server/web-dist, so the
# dashboard ends up right where the server expects to serve it from.
COPY web web
COPY server server
RUN npm --prefix web run build \
  && npm --prefix server run build \
  && npm --prefix server prune --omit=dev

# ---- runtime ----
FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    TALLY_DB=/data/tally.sqlite

WORKDIR /app/server

# copy the pruned node_modules (incl. the compiled better-sqlite3), the built
# server, the built dashboard and the tracker script
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/web-dist ./web-dist
COPY --from=build /app/server/public ./public
COPY --from=build /app/server/package.json ./package.json

# the sqlite file lives on a volume so data survives container rebuilds
RUN mkdir -p /data && chown -R node:node /data
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
