import { atom, getDefaultStore } from "jotai";
import i18next from "i18next";
import { LOCAL_WORKER_MARKER, TOOLCHAIN_ID } from "../compiler/config";
import {
    TOOLCHAIN_FILES,
    deleteOldToolchains,
    isToolchainCached,
    openToolchainCache,
} from "../compiler/toolchainCache";
import type { BuildResult } from "./build";
import { createBuildCache } from "./buildCache";
import { failedBuild as failed } from "./buildResult";

export const NOT_DOWNLOADED = -1;
export const DOWNLOADED = 101;

/**
 * In-browser compiler download progress: NOT_DOWNLOADED (-1), 0–100 while
 * downloading, DOWNLOADED (101) once every file is stored.
 */
export const browserCompilerProgressStore = atom(NOT_DOWNLOADED);

const store = getDefaultStore();

let worker: Worker | undefined;
let queue = Promise.resolve();
let download: Promise<boolean> | undefined;
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

/** Compiles in the browser, downloading the compiler first if needed. */
export function browserBuild(
    source: string,
    std: string,
): Promise<BuildResult> {
    if (!browserCompilerSupported())
        return Promise.resolve(
            failed(i18next.t("editor:compiler.browserUnsupported")),
        );
    // Never rejects: a thrown error would leave the UI building forever.
    const job = queue.then(() =>
        compile(source, std).catch((error) => {
            console.error("In-browser build failed:", error);
            capture("browser_compiler_build", {
                success: false,
                cpp_version: std,
                failure: "exception",
                error: String(error).slice(0, 300),
            });
            return failed(String(error));
        }),
    );
    queue = job.then(() => {});
    return job;
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
        return { ...hit, durationMs: 0 };
    }
    // The first job in a worker also loads the toolchain into it.
    const cold = !worker;
    const started = performance.now();
    const result = await compileInWorker(source, std);
    const durationMs = Math.round(performance.now() - started);
    // Compile errors stay out: they quote the user's code.
    capture("browser_compiler_build", {
        success: result.ok,
        cpp_version: std,
        cached: false,
        cold,
        used_pch: !!result.usedPch,
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
    return { ...result, durationMs };
}

function compileInWorker(source: string, std: string): Promise<BuildResult> {
    // The worker keeps the loaded and compiled toolchain between jobs;
    // every clang/wasm-ld run gets a fresh instance, so no heap carries over.
    worker ??= new Worker(
        new URL("../compiler/compile.worker.ts", import.meta.url),
        { type: "module" },
    );
    const current = worker;
    const id = nextJobId++;
    return new Promise<BuildResult>((resolve) => {
        const finish = (result: BuildResult) => {
            if (stopJob === stop) stopJob = undefined;
            clearTimeout(timer);
            current.removeEventListener("message", message);
            current.removeEventListener("error", error);
            resolve(result);
        };
        const discard = () => {
            current.terminate();
            if (worker === current) worker = undefined;
        };
        const message = ({ data }: MessageEvent) => {
            if (data.id !== id) return;
            // reset: the compiler itself failed, not the code to compile
            if (data.reset) discard();
            finish({
                ok: data.ok,
                errors: data.errors,
                unavailable: !!data.reset,
                usedPch: data.usedPch,
                wasmModule: data.module,
                js_code: data.ok ? LOCAL_WORKER_MARKER : "",
                wasm_url: "",
            });
        };
        const error = (event: ErrorEvent) => {
            discard();
            finish(failed(event.message || "Local compiler worker failed"));
        };
        // A dead compiler must not strand the UI.
        const timer = setTimeout(() => {
            discard();
            finish(failed(i18next.t("editor:compiler.timedOut")));
        }, 180_000);
        current.addEventListener("message", message);
        current.addEventListener("error", error);
        // The worker cannot be interrupted mid-compile, only discarded; the
        // next compile loads the toolchain again (from Cache Storage).
        const stop = () => {
            discard();
            finish({ ...failed("", false), errors: [], cancelled: true });
        };
        stopJob = stop;
        current.postMessage({ id, source, std, base: toolchainBase() });
    });
}

/** Stops the compile in progress; its build resolves as cancelled. */
export function cancelBrowserBuild() {
    stopJob?.();
}
