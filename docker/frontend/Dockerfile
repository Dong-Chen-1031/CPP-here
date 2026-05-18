FROM oven/bun:1

RUN apt-get update && apt-get install -y caddy && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

ENV SKIP_API_FETCH=true
RUN bun install --production

EXPOSE 4321

ENTRYPOINT []
CMD ["/bin/sh", "-c", "bun run build && caddy file-server --root dist --listen :4321"]