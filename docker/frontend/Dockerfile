# Only PUBLIC_SKIP_API_FETCH is baked into the image (plus NODE_OPTIONS, which is
# for the build tooling, not the app); every other variable the frontend reads is
# set per deployment in docker/frontend/docker-compose.yml.
# The in-browser compiler's toolchain is prebuilt into the image, so setting
# PUBLIC_LOCAL_COMPILER=true in compose costs nothing extra at container start.
# Last synced 2026-10-07 at commit ecbfd4f+dirty

FROM node:24-slim AS node

# Generates frontend/public/toolchain/ (see frontend/LOCAL-COMPILER.md). Only the
# script's inputs are copied, so this ~3 minute step stays cached until they change.
FROM oven/bun:1 AS toolchain
# The script needs real Node: Bun's node:wasi ignores the stdout fd, so the PCH
# smoke test would read back nothing and fail.
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY package.json bun.lock ./
COPY frontend/package.json frontend/
COPY extensions/package.json extensions/
RUN bun install --ignore-scripts
COPY builder/docker/inner/bits builder/docker/inner/bits
COPY frontend/scripts frontend/scripts
COPY frontend/src/compiler/toolchain.json frontend/src/compiler/memory-helpers.cpp frontend/src/compiler/
RUN cd frontend && node scripts/prepare-toolchain.mjs

FROM oven/bun:1

RUN apt-get update && apt-get install -y caddy && rm -rf /var/lib/apt/lists/*
# With a real `node` on PATH, `bun run` executes astro and the other node-shebang
# tools with Node. Without it they run on Bun, where the Cloudflare adapter's
# prerender step fails with "Cannot use disposed instance".
COPY --from=node /usr/local/bin/node /usr/local/bin/node

WORKDIR /app
COPY . .
# Same inputs as the stage above, so the build's `prepare-toolchain --if-enabled`
# finds it up to date instead of spending ~3 minutes on every container start.
COPY --from=toolchain /app/frontend/public/toolchain frontend/public/toolchain

# The site is built inside the image at container start, before any backend is
# reachable, so the landing-page stats fetch is skipped by default.
# Override it in compose once the backend is up at PRIVATE_BUILD_TIME_STATUS_URL.
ENV PUBLIC_SKIP_API_FETCH=true
# The Cloudflare adapter prerenders through a preview server bound to "localhost".
# Inside Docker, Node resolves that to ::1 first, the request lands on the wrong
# address family and the build fails with "fetch failed ... ECONNREFUSED 127.0.0.1".
ENV NODE_OPTIONS=--dns-result-order=ipv4first
# No --production: the build needs root devDependencies such as shx.
RUN bun install

EXPOSE 4321

ENTRYPOINT []
# Built at startup so the build-time environment variables from docker compose are inlined.
# The root scripts call `npm run`, which this image does not have, so run their steps directly.
# build:static drops the Cloudflare Worker: /api/* is served by the Python backend (PUBLIC_API_URL).
CMD ["/bin/sh", "-c", "bun run copy-i18n && bun run copy-docker && bun run logo && cd frontend && bun run build:static && caddy run --config /app/docker/frontend/Caddyfile --adapter caddyfile"]
