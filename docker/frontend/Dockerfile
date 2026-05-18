FROM oven/bun:1 AS builder
WORKDIR /app
COPY . .

ENV SKIP_API_FETCH=true
RUN bun install --production

EXPOSE 4321

ENTRYPOINT []
CMD ["/bin/sh", "-c", "bun run build && bun astro preview --host"]
