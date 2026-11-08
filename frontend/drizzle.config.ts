import { defineConfig } from "drizzle-kit";

// Generates the SQL in ./migrations; wrangler applies it:
//   bunx drizzle-kit generate
//   bunx wrangler d1 migrations apply D1 --remote
export default defineConfig({
    dialect: "sqlite",
    schema: "./src/lib/server/db/schema.ts",
    out: "./migrations",
});
