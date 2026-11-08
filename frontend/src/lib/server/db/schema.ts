import { integer, real, sqliteTable } from "drizzle-orm/sqlite-core";

/**
 * Running totals for the landing page. A single row (id 1), bumped once per
 * build on either compiler and per batch of runs, so the numbers do not depend on the builder node.
 */
export const buildStats = sqliteTable("build_stats", {
    id: integer("id").primaryKey().default(1),
    totalCount: integer("total_count").notNull().default(0),
    totalLines: integer("total_lines").notNull().default(0),
    totalWasmSizeBytes: integer("total_wasm_size_bytes").notNull().default(0),
    totalDurationSeconds: real("total_duration_seconds").notNull().default(0),
    // How many of total_count were compiled in the browser.
    browserCount: integer("browser_count").notNull().default(0),
    // Programs run, on either compiler's output (every test case counts).
    totalRunCount: integer("total_run_count").notNull().default(0),
});
