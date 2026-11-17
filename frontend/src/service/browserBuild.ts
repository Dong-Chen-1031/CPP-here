import { atom, getDefaultStore } from "jotai";
import i18next from "i18next";
import { LOCAL_WORKER_MARKER, TOOLCHAIN_ID } from "../compiler/config";
import { leadingIncludes, startsWithStdcxx } from "../compiler/pchRule";
import {
    TOOLCHAIN_FILES,
    cacheToolchainFile,
    deleteOldToolchains,
    isToolchainCached,
    isToolchainFileCached,
    openToolchainCache,
    toolchainCacheSupported,
} from "../compiler/toolchainCache";
import type { BuildResult } from "./build";
import { createBuildCache } from "./buildCache";
import { failedBuild as failed } from "./buildResult";
import { reportBuild } from "./statsReport";

export const NOT_DOWNLOADED = -1;
export const DOWNLOADED = 101;

/**
 * In-browser compiler download progress: NOT_DOWNLOADED (-1), 0–100 while
 * downloading, DOWNLOADED (101) once every file is stored.
 */
export const browserCompilerProgressStore = atom(NOT_DOWNLOADED);

const store = getDefaultStore();

let worker: Worker | undefined;
// What the worker has ready: "toolchain" once it has compiled something,
// "pch:<std>" once it has loaded that standard's PCH.
let ready = new Set<string>();
// A warm-up finished in this worker, reported with each build.
let warmed = false;
let queue = Promise.resolve();
// Builds waiting in the queue; a warm-up then skips its practice compile.
let waitingBuilds = 0;
// Counts cancelBrowserBuild() calls: a build still queued behind a warm-up
// when the user stops it is skipped.
let stops = 0;
let download: Promise<boolean> | undefined;

const pchDownloads = new Map<string, Promise<boolean>>();
let nextJobId = 0;
// Ends the compile running in the worker, if any.
let stopJob: (() => void) | undefined;
const cache = createBuildCache();

/** What started a download, reported to PostHog. */
export type DownloadTrigger = "build" | "background" | "settings";

function capture(event: string, properties: Record<string, unknown>) {
    if (typeof window !== "undefined")
        window.posthog?.capture(event, properties);
}

function toolchainBase() {
    return new URL(
        import.meta.env.BASE_URL + "toolchain/" + TOOLCHAIN_ID + "/",
        location.origin,
    ).href;
}

export function browserCompilerSupported(): boolean {
    return (
        typeof Worker === "function" &&
        typeof WebAssembly === "object" &&
        typeof DecompressionStream === "function"
    );
}

export async function isBrowserCompilerDownloaded(): Promise<boolean> {
    const progress = store.get(browserCompilerProgressStore);
    if (progress === DOWNLOADED) return true;
    if (progress !== NOT_DOWNLOADED) return false;
    const cached = await isToolchainCached(toolchainBase()).catch(() => false);
    // A download may have started in the meantime.
    if (cached && store.get(browserCompilerProgressStore) === NOT_DOWNLOADED)
        store.set(browserCompilerProgressStore, DOWNLOADED);
    return cached;
}

/** Downloads the toolchain into Cache Storage. Resolves to false on failure. */
export function downloadBrowserCompiler(
    trigger: DownloadTrigger = "build",
): Promise<boolean> {
    download ??= (async () => {
        store.set(browserCompilerProgressStore, 0);
        const started = performance.now();
        let bytes = 0;
        let fileCount = 0;
        // One failed file ends the others, which would otherwise keep
        // reporting progress over the reset below.
        const abort = new AbortController();
        try {
            const base = toolchainBase();
            const cache = await openToolchainCache();
            await deleteOldToolchains();
            const pending = await Promise.all(
                TOOLCHAIN_FILES.map(async (name) => {
                    const url = base + name;
                    if (await cache?.match(url)) return null;
                    const response = await fetch(url, {
                        signal: abort.signal,
                    });
                    if (!response.ok || !response.body)
                        throw new Error(
                            `Toolchain download failed (${response.status}): ${url}`,
                        );
                    const size = Number(response.headers.get("Content-Length"));
                    return { url, response, size };
                }),
            );
            const files = pending.filter((file) => file !== null);
            fileCount = files.length;
            // Without every size, count finished files instead of bytes.
            const bySize = files.every((file) => file.size > 0);
            const total = bySize
                ? files.reduce((sum, file) => sum + file.size, 0)
                : files.length;
            let done = 0;
            const report = () =>
                !abort.signal.aborted &&
                store.set(
                    browserCompilerProgressStore,
                    total ? Math.min(100, Math.floor((done * 100) / total)) : 0,
                );
            await Promise.all(
                files.map(async ({ url, response }) => {
                    const chunks: Uint8Array<ArrayBuffer>[] = [];
                    const reader = response.body!.getReader();
                    for (;;) {
                        const { done: end, value } = await reader.read();
                        if (end) break;
                        chunks.push(value);
                        bytes += value.byteLength;
                        if (bySize) {
                            done += value.byteLength;
                            report();
                        }
                    }
                    if (!bySize) {
                        done++;
                        report();
                    }
                    await cache?.put(
                        url,
                        new Response(new Blob(chunks), {
                            headers: {
                                "Content-Type":
                                    response.headers.get("Content-Type") ??
                                    "application/octet-stream",
                            },
                        }),
                    );
                }),
            );
            store.set(browserCompilerProgressStore, DOWNLOADED);
            capture("browser_compiler_download", {
                success: true,
                trigger,
                duration_ms: Math.round(performance.now() - started),
                bytes,
                files: fileCount,
            });
            return true;
        } catch (error) {
            abort.abort();
            console.error("In-browser compiler download failed:", error);
            store.set(browserCompilerProgressStore, NOT_DOWNLOADED);
            capture("browser_compiler_download", {
                success: false,
                trigger,
                duration_ms: Math.round(performance.now() - started),
                bytes,
                files: fileCount,
                error: String(error).slice(0, 300),
            });
            return false;
        } finally {
            download = undefined;
        }
    })();
    return download;
}

const cancelledBuild = (): BuildResult => ({
    ...failed("", false),
    errors: [],
    cancelled: true,
});

/** Compiles in the browser, downloading the compiler first if needed. */
export function browserBuild(
    source: string,
    std: string,
): Promise<BuildResult> {
    if (!browserCompilerSupported())
        return Promise.resolve(
            failed(i18next.t("editor:compiler.browserUnsupported")),
        );
    waitingBuilds++;
    const stopsBefore = stops;
    // Never rejects: a thrown error would leave the UI building forever.
    const job = queue.then(() => {
        waitingBuilds--;
        if (stops !== stopsBefore) return cancelledBuild();
        return compile(source, std).catch((error) => {
            console.error("In-browser build failed:", error);
            capture("browser_compiler_build", {
                success: false,
                cpp_version: std,
                failure: "exception",
                error: String(error).slice(0, 300),
            });
            return failed(String(error));
        });
    });
    queue = job.then(() => {});
    return job;
}

/**
 * What a build of `source` loads besides the compiler: "pch" for the PCH of
 * bits/stdc++.h, otherwise the headers the source starts with, which the
 * compile worker makes a PCH of. A warm-up is due again when this changes.
 */
export function precompiledHeadersOf(source: string): "pch" | string[] {
    return startsWithStdcxx(source) ? "pch" : leadingIncludes(source);
}

/**
 * Loads the downloaded compiler into its worker and compiles a small program
 * there, so that the user's first build takes as long as later ones, and gets
 * the precompiled headers of `source` ready: the PCH of `std` for
 * bits/stdc++.h, fetched only when `downloadPch` allows, or one made of the
 * headers the source starts with. Never downloads the compiler itself.
 * Resolves to false when the compiler failed, true otherwise (also when there
 * was nothing to do).
 */
export function warmBrowserCompiler(
    std: string,
    source: string,
    downloadPch: boolean,
): Promise<boolean> {
    if (!browserCompilerSupported()) return Promise.resolve(true);
    const pch = preparePch(std, source, downloadPch).catch(() => false);
    return pch.then((pch) => {
        const job = queue.then(() =>
            warmUp(std, source, pch).catch((error) => {
                console.warn("In-browser compiler warm-up failed:", error);
                return false;
            }),
        );
        queue = job.then(() => {});
        return job;
    });
}

const pchUrl = (std: string) => toolchainBase() + std + ".pch.gz.bin";

async function preparePch(std: string, source: string, downloadPch: boolean) {
    if (!startsWithStdcxx(source)) return false;
    if (!toolchainCacheSupported()) return downloadPch;
    if (!(await isBrowserCompilerDownloaded())) return false;
    const url = pchUrl(std);
    const pending = pchDownloads.get(url);
    if (pending) return pending;
    if (await isToolchainFileCached(url).catch(() => false)) return true;
    if (!downloadPch) return false;
    const job = cacheToolchainFile(url)
        .catch((error) => {
            console.warn("In-browser compiler PCH download failed:", error);
            return false;
        })
        .finally(() => pchDownloads.delete(url));
    pchDownloads.set(url, job);
    return job;
}

async function warmUp(std: string, source: string, pch: boolean) {
    if (!(await isBrowserCompilerDownloaded())) return true;
    const headers = precompiledHeadersOf(source);
    // A build that waits behind this wants the worker now: it only loads
    // files then, and the next warm-up, after that build, does the rest.
    const idle = waitingBuilds === 0;
    const prime = !ready.has("toolchain") && idle;
    const loadPch = pch && !ready.has("pch:" + std);
    // The worker keeps few PCHs of includes, and answers at once when it has
    // this one.
    const includes =
        headers !== "pch" && headers.length > 0 && idle ? headers : undefined;
    if (!prime && !loadPch && !includes) return true;
    const reply = await ask({
        std,
        base: toolchainBase(),
        warm: { pch: loadPch, prime, includes },
    });
    if (!reply.data?.ok) {
        console.warn(
            "In-browser compiler warm-up failed:",
            reply.data?.errors?.join("\n") ?? reply.error,
        );
        return false;
    }
    if (prime) ready.add("toolchain");
    if (reply.data.usedPch) ready.add("pch:" + std);
    warmed = true;
    return true;
}

async function compile(source: string, std: string): Promise<BuildResult> {
    if (!(await isBrowserCompilerDownloaded()))
        if (!(await downloadBrowserCompiler()))
            return failed(i18next.t("editor:compiler.downloadFailed"));
    const hit = cache.get(source, std);
    if (hit) {
        capture("browser_compiler_build", {
            success: true,
            cpp_version: std,
            cached: true,
            duration_ms: 0,
        });
        reportBuild(source, hit, 0);
        return { ...hit, durationMs: 0 };
    }
    if (startsWithStdcxx(source))
        await pchDownloads.get(pchUrl(std))?.catch(() => {});
    // The first job in a worker also loads the toolchain into it.
    const cold = !worker;
    const warm = !!worker && warmed;
    const started = performance.now();
    const result = await compileInWorker(source, std);
    const durationMs = Math.round(performance.now() - started);
    if (!result.unavailable && !result.cancelled) {
        ready.add("toolchain");
        if (result.usedPch) ready.add("pch:" + std);
    }
    // Compile errors stay out: they quote the user's code.
    capture("browser_compiler_build", {
        success: result.ok,
        cpp_version: std,
        cached: false,
        cold,
        warmed: warm,
        used_pch: !!result.usedPch,
        used_includes_pch: !!result.usedIncludesPch,
        duration_ms: durationMs,
        failure: result.ok
            ? undefined
            : result.cancelled
              ? "cancelled"
              : result.unavailable
                ? "unavailable"
                : "compile_error",
        error: result.unavailable
            ? result.errors.join("\n").slice(0, 300)
            : undefined,
    });
    cache.set(source, std, result);
    reportBuild(source, result, durationMs);
    return { ...result, durationMs };
}

/** What compile.worker.ts sends back. */
interface WorkerMessage {
    id: number;
    ok: boolean;
    errors: string[];
    /** The compiler itself failed: the worker is discarded. */
    reset?: boolean;
    usedPch?: boolean;
    usedIncludesPch?: boolean;
    module?: WebAssembly.Module;
    wasmSizeBytes?: number;
}

interface Reply {
    data?: WorkerMessage;
    /** The worker failed or timed out and was discarded. */
    error?: string;
    cancelled?: boolean;
}

/**
 * Sends one job to the compile worker, starting it if needed. A job the
 * compiler itself failed (`reset`), a crashed worker, a timeout and, when
 * `stoppable`, cancelBrowserBuild() discard the worker.
 */
function ask(payload: Record<string, unknown>, stoppable = false) {
    // The worker keeps the loaded and compiled toolchain between jobs;
    // every clang/wasm-ld run gets a fresh instance, so no heap carries over.
    if (!worker) {
        worker = new Worker(
            new URL("../compiler/compile.worker.ts", import.meta.url),
            { type: "module" },
        );
        ready = new Set();
        warmed = false;
    }
    const current = worker;
    const id = nextJobId++;
    return new Promise<Reply>((resolve) => {
        const finish = (reply: Reply) => {
            if (stopJob === stop) stopJob = undefined;
            clearTimeout(timer);
            current.removeEventListener("message", message);
            current.removeEventListener("error", error);
            resolve(reply);
        };
        const discard = () => {
            current.terminate();
            if (worker !== current) return;
            worker = undefined;
            // What was loaded went with the worker: the next warm-up, such
            // as the one after a stopped build, starts over.
            ready = new Set();
            warmed = false;
        };
        const message = ({ data }: MessageEvent<WorkerMessage>) => {
            if (data.id !== id) return;
            // reset: the compiler itself failed, not the code to compile
            if (data.reset) discard();
            finish({ data });
        };
        const error = (event: ErrorEvent) => {
            discard();
            finish({ error: event.message || "Local compiler worker failed" });
        };
        // A dead compiler must not strand the UI.
        const timer = setTimeout(() => {
            discard();
            finish({ error: i18next.t("editor:compiler.timedOut") });
        }, 180_000);
        current.addEventListener("message", message);
        current.addEventListener("error", error);
        // The worker cannot be interrupted mid-compile, only discarded; the
        // next compile loads the toolchain again (from Cache Storage).
        const stop = () => {
            discard();
            finish({ cancelled: true });
        };
        if (stoppable) stopJob = stop;
        current.postMessage({ id, ...payload });
    });
}

async function compileInWorker(
    source: string,
    std: string,
): Promise<BuildResult> {
    const { data, error, cancelled } = await ask(
        { source, std, base: toolchainBase() },
        true,
    );
    if (cancelled) return cancelledBuild();
    if (!data) return failed(error!);
    return {
        ok: data.ok,
        errors: data.errors,
        unavailable: !!data.reset,
        usedPch: data.usedPch,
        usedIncludesPch: data.usedIncludesPch,
        wasmModule: data.module,
        wasmSizeBytes: data.wasmSizeBytes,
        js_code: data.ok ? LOCAL_WORKER_MARKER : "",
        wasm_url: "",
    };
}

/** Stops the compile in progress; its build resolves as cancelled. */
export function cancelBrowserBuild() {
    stops++;
    stopJob?.();
}
