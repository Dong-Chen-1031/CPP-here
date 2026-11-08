import { PUBLIC_API_URL } from "astro:env/client";
import type { BuildResult } from "./build";

// Runs are sent in batches: running every test case starts many programs at
// once, which would otherwise hit the endpoint's per-IP rate limit.
const RUN_FLUSH_DELAY_MS = 5_000;

let pendingRuns = 0;
let flushTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Sends a report to the landing page totals. Only numbers are sent, never the
 * code. A beacon outlives the page. The Worker serves /api/stats on the
 * page's own origin; a static build's backend has no such route, so the
 * report is dropped there.
 */
function send(report: Record<string, number>) {
    try {
        navigator.sendBeacon(
            `${PUBLIC_API_URL}/api/stats`,
            new Blob([JSON.stringify(report)], { type: "text/plain" }),
        );
    } catch (error) {
        console.warn("Failed to report stats:", error);
    }
}

/** Adds a finished in-browser build, as the server does for its own builds. */
export function reportBuild(
    source: string,
    result: BuildResult,
    durationMs: number,
) {
    if (result.cancelled || result.unavailable) return;
    const lines = source.split(/\r\n|\r|\n/);
    if (lines.at(-1) === "") lines.pop();
    send({
        lines: lines.length,
        wasmSizeBytes: result.wasmSizeBytes ?? 0,
        durationMs,
    });
}

function flushRuns() {
    clearTimeout(flushTimer);
    flushTimer = undefined;
    if (!pendingRuns) return;
    send({ runs: pendingRuns });
    pendingRuns = 0;
}

/** Counts one started program, whichever compiler built it. */
export function reportRun() {
    pendingRuns++;
    flushTimer ??= setTimeout(flushRuns, RUN_FLUSH_DELAY_MS);
}

if (typeof window !== "undefined")
    // The last batch would otherwise be lost when the tab is closed.
    window.addEventListener("pagehide", flushRuns);
