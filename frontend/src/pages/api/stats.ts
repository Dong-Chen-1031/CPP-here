import * as z from "zod";
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { makeAPI } from "@/lib/server/api";
import { getBuildStats, recordBuild, recordRuns } from "@/lib/server/stats";

export const prerender = false;

// Browser builds and program runs report themselves here without a token
// (they never needed Turnstile), so anyone can post. Keep each report plausible and rate limit
// by IP; the totals are only shown on the landing page.
const MAX_LINES = 20_000;
const MAX_WASM_SIZE_BYTES = 64 * 1024 * 1024;
// The in-browser compile times out after 180 seconds.
const MAX_DURATION_MS = 180_000;
// Runs come in batches (see statsReport.ts).
const MAX_RUNS = 1_000;

const BuildReportSchema = z.object({
    lines: z.number().int().min(0).max(MAX_LINES),
    wasmSizeBytes: z.number().int().min(0).max(MAX_WASM_SIZE_BYTES),
    durationMs: z.number().min(0).max(MAX_DURATION_MS),
});
const RunReportSchema = z.object({
    runs: z.number().int().min(1).max(MAX_RUNS),
});

const statsAPI = makeAPI({
    url: "/api/stats",
    payloadSchema: z.union([BuildReportSchema, RunReportSchema]),
    responseSchema: z.object({}),

    handler: async ({ clientAddress, locals }, report, reply) => {
        const { success } = await env.STATS_RATE_LIMITER.limit({
            key: clientAddress,
        });
        if (!success) return reply({}, { status: 429, success: false });

        const write =
            "runs" in report
                ? recordRuns(report.runs)
                : recordBuild({
                      lines: report.lines,
                      wasmSizeBytes: report.wasmSizeBytes,
                      durationSeconds: report.durationMs / 1000,
                      browser: true,
                  });
        locals.cfContext.waitUntil(
            write.catch((error) =>
                console.error("Failed to record build stats:", error),
            ),
        );
        return reply({});
    },
});

export const POST = statsAPI.POST;
export type statsAPI = typeof statsAPI;

// The totals, read when the landing page is built (PRIVATE_BUILD_TIME_STATUS_URL).
export const GET: APIRoute = async () =>
    Response.json(await getBuildStats(), {
        headers: { "Cache-Control": "public, max-age=60" },
    });
