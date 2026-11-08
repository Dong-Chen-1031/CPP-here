import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { buildStats } from "./db/schema";

const STATS_ID = 1;

export interface BuildRecord {
    lines: number;
    wasmSizeBytes: number;
    durationSeconds: number;
    browser: boolean;
}

/** Adds one build to the totals in a single atomic upsert. */
export async function recordBuild({
    lines,
    wasmSizeBytes,
    durationSeconds,
    browser,
}: BuildRecord) {
    const browserCount = browser ? 1 : 0;
    await db
        .insert(buildStats)
        .values({
            id: STATS_ID,
            totalCount: 1,
            totalLines: lines,
            totalWasmSizeBytes: wasmSizeBytes,
            totalDurationSeconds: durationSeconds,
            browserCount,
        })
        .onConflictDoUpdate({
            target: buildStats.id,
            set: {
                totalCount: sql`${buildStats.totalCount} + 1`,
                totalLines: sql`${buildStats.totalLines} + ${lines}`,
                totalWasmSizeBytes: sql`${buildStats.totalWasmSizeBytes} + ${wasmSizeBytes}`,
                totalDurationSeconds: sql`${buildStats.totalDurationSeconds} + ${durationSeconds}`,
                browserCount: sql`${buildStats.browserCount} + ${browserCount}`,
            },
        });
}

/** Adds started programs to the totals. */
export async function recordRuns(runs: number) {
    await db
        .insert(buildStats)
        .values({ id: STATS_ID, totalRunCount: runs })
        .onConflictDoUpdate({
            target: buildStats.id,
            set: {
                totalRunCount: sql`${buildStats.totalRunCount} + ${runs}`,
            },
        });
}

/** Same shape as the builder node's /api/status, plus the browser-only totals. */
export async function getBuildStats() {
    const row = await db
        .select()
        .from(buildStats)
        .where(eq(buildStats.id, STATS_ID))
        .get();
    return {
        total_count: row?.totalCount ?? 0,
        total_lines: row?.totalLines ?? 0,
        total_wasm_size_bytes: row?.totalWasmSizeBytes ?? 0,
        total_duration_seconds: row?.totalDurationSeconds ?? 0,
        browser_count: row?.browserCount ?? 0,
        total_run_count: row?.totalRunCount ?? 0,
    };
}

/** Lines the way the builder node counts them (Python's str.splitlines). */
export function countLines(code: string): number {
    const lines = code.split(/\r\n|\r|\n/);
    if (lines.at(-1) === "") lines.pop();
    return lines.length;
}
