# Only PUBLIC_SKIP_API_FETCH is baked into the image; every other variable the
# frontend reads is set per deployment in docker/frontend/docker-compose.yml.
# Last synced 2026-09-21 at commit 0f82c44
FROM oven/bun:1

RUN apt-get update && apt-get install -y caddy && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

# The site is built inside the image at container start, before any backend is
# reachable, so the landing-page stats fetch is skipped by default.
# Override it in compose once the backend is up at PUBLIC_BUILD_TIME_API_URL.
ENV PUBLIC_SKIP_API_FETCH=true
# No --production: the build needs root devDependencies such as shx.
RUN bun install

EXPOSE 4321

ENTRYPOINT []
# Built at startup so the PUBLIC_* environment variables from docker compose are inlined.
# The root scripts call `npm run`, which this image does not have, so run their steps directly.
# build:static drops the Cloudflare Worker: /api/* is served by the Python backend (PUBLIC_API_URL).
CMD ["/bin/sh", "-c", "bun run copy-i18n && bun run copy-docker && bun run logo && cd frontend && bun run build:static && caddy run --config /app/docker/frontend/Caddyfile --adapter caddyfile"]
