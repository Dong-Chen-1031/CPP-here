FROM oven/bun:1 AS builder
WORKDIR /app
COPY . .

ENV SKIP_API_FETCH=true
RUN bun install --production

EXPOSE 80

CMD bun run build && bun run preview
