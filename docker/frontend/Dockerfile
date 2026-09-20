FROM oven/bun:1

RUN apt-get update && apt-get install -y caddy && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

ENV PUBLIC_SKIP_API_FETCH=true
# No --production: the build needs root devDependencies such as shx.
RUN bun install

EXPOSE 4321

ENTRYPOINT []
# Built at startup so the PUBLIC_* environment variables from docker compose are inlined.
# The root scripts call `npm run`, which this image does not have, so run their steps directly.
# build:static drops the Cloudflare Worker: /api/* is served by the Python backend (PUBLIC_API_URL).
CMD ["/bin/sh", "-c", "bun run copy-i18n && bun run copy-docker && bun run logo && cd frontend && bun run build:static && caddy run --config /app/docker/frontend/Caddyfile --adapter caddyfile"]
