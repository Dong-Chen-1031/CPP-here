FROM oven/bun:1 AS builder
WORKDIR /app
COPY . .

ENV SKIP_API_FETCH=true
RUN bun install --production

EXPOSE 4321

CMD ["/bin/sh", "-c", "bun run build 2>&1 && bun astro preview --host 2>&1"]
