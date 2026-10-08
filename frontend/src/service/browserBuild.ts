import { atom, getDefaultStore } from "jotai";
import i18next from "i18next";
import { LOCAL_WORKER_MARKER, TOOLCHAIN_VERSION } from "../compiler/config";
import {
    TOOLCHAIN_FILES,
    deleteOldToolchains,
    isToolchainCached,
    openToolchainCache,
} from "../compiler/toolchainCache";
import type { BuildResult } from "./build";

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
const cache = new Map<string, BuildResult>();

const failed = (text: string, unavailable = true): BuildResult => ({
    ok: false,
    js_code: "",
    wasm_url: "",
    errors: [text],
    unavailable,
});

function toolchainBase() {
    return new URL(
        import.meta.env.BASE_URL + "toolchain/" + TOOLCHAIN_VERSION + "/",
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
    const cached = await isToolchainCached(toolchainBase());
    // A download may have started in the meantime.
    if (cached && store.get(browserCompilerProgressStore) === NOT_DOWNLOADED)
        store.set(browserCompilerProgressStore, DOWNLOADED);
    return cached;
}

/** Downloads the toolchain into Cache Storage. Resolves to false on failure. */
export function downloadBrowserCompiler(): Promise<boolean> {
    download ??= (async () => {
        store.set(browserCompilerProgressStore, 0);
        try {
            const base = toolchainBase();
            const cache = await openToolchainCache();
            await deleteOldToolchains();
            const pending = await Promise.all(
                TOOLCHAIN_FILES.map(async (name) => {
                    const url = base + name;
                    if (await cache?.match(url)) return null;
                    const response = await fetch(url);
                    if (!response.ok || !response.body)
                        throw new Error(
                            `Toolchain download failed (${response.status}): ${url}`,
                        );
                    const size = Number(response.headers.get("Content-Length"));
                    return { url, response, size };
                }),
            );
            const files = pending.filter((file) => file !== null);
            // Without every size, count finished files instead of bytes.
            const bySize = files.every((file) => file.size > 0);
            const total = bySize
                ? files.reduce((sum, file) => sum + file.size, 0)
                : files.length;
            let done = 0;
            const report = () =>
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
            return true;
        } catch (error) {
            console.error("In-browser compiler download failed:", error);
            store.set(browserCompilerProgressStore, NOT_DOWNLOADED);
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
    const job = queue.then(async () => {
        if (!(await isBrowserCompilerDownloaded()))
            if (!(await downloadBrowserCompiler()))
                return failed(i18next.t("editor:compiler.downloadFailed"));
        const digest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(
                JSON.stringify([TOOLCHAIN_VERSION, std, source]),
            ),
        );
        const key = Array.from(new Uint8Array(digest), (b) =>
            b.toString(16).padStart(2, "0"),
        ).join("");
        if (cache.has(key)) return cache.get(key)!;
        // The worker keeps the loaded and compiled toolchain between jobs;
        // every clang/wasm-ld run gets a fresh instance, so no heap carries over.
        worker ??= new Worker(
            new URL("../compiler/compile.worker.ts", import.meta.url),
            { type: "module" },
        );
        const current = worker;
        const id = crypto.randomUUID();
        const result = await new Promise<BuildResult>((resolve) => {
            const finish = (result: BuildResult) => {
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
                // reset: the toolchain failed to load, not the code to compile
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
            current.postMessage({ id, source, std, base: toolchainBase() });
        });
        if (result.ok) {
            cache.set(key, result);
            if (cache.size > 8) cache.delete(cache.keys().next().value!);
        }
        return result;
    });
    queue = job.then(
        () => {},
        () => {},
    );
    return job;
}
