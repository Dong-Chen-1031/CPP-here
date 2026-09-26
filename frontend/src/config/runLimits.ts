// Resource limits for running user code in the browser (CPP-8).

/**
 * Default wall-clock limit per run, in seconds; the worker is terminated when
 * it is reached. Users can change it in settings (timeLimitStore), where -1
 * means no limit.
 */
export const DEFAULT_TIME_LIMIT_S = 10;

/** timeLimitStore value that disables the time limit. */
export const NO_TIME_LIMIT = -1;

// Not a policy cap: setTimeout overflows past 2^31-1 ms (~24.8 days) and would
// fire immediately, reporting TLE the moment the program starts.
const MAX_TIMEOUT_S = Math.floor((2 ** 31 - 1) / 1000);

/**
 * Returns the value as a valid time limit (NO_TIME_LIMIT, or a positive whole
 * number of seconds), or null if it isn't one.
 */
export function parseTimeLimit(value: unknown): number | null {
    const n = typeof value === "string" ? Number(value.trim()) : value;
    if (typeof n !== "number" || !Number.isInteger(n)) return null;
    if (n === NO_TIME_LIMIT) return n;
    return n >= 1 && n <= MAX_TIMEOUT_S ? n : null;
}

/**
 * Hard cap on stdout + stderr per run. Enforced at the source by
 * docker/js_lib/stdout_lib.js in the safe-cpp2wasm image (keep the two in
 * sync); checked again here as a second line of defence.
 */
export const OUTPUT_LIMIT_BYTES = 32 * 1024 * 1024;

/**
 * wasm heap cap, only used in messages: the real limit is -sMAXIMUM_MEMORY in
 * backend/services/build.py.
 */
export const MEMORY_LIMIT_MIB = 512;

/** Beyond this, a case's output is kept in IndexedDB but not rendered. */
export const DISPLAY_LIMIT_CHARS = 2 * 1024 * 1024;
export const DISPLAY_LIMIT_LINES = 5000;

/** A longer line is cut in the display */
export const DISPLAY_LIMIT_LINE_CHARS = 10_000;

/** How often buffered output is written to IndexedDB. */
export const OUTPUT_FLUSH_INTERVAL_MS = 100;

/** Output kept per case when sharing. */
export const SHARE_OUTPUT_LIMIT_CHARS = 64 * 1024;
