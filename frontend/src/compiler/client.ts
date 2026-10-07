import { TOOLCHAIN_VERSION, LOCAL_WORKER_MARKER } from "./config";
export interface LocalBuild {
    ok: boolean;
    success?: boolean;
    js_code: string;
    wasm_url: string;
    errors: string[];
    wasmModule?: WebAssembly.Module;
    usedPch?: boolean;
}
let worker: Worker | undefined;
let queue = Promise.resolve();
const cache = new Map<string, LocalBuild>();

const failed = (text: string): LocalBuild => ({
    ok: false,
    js_code: "",
    wasm_url: "",
    errors: [text],
});

export function localCompilerSupported(): boolean {
    return (
        typeof Worker === "function" &&
        typeof WebAssembly === "object" &&
        typeof DecompressionStream === "function"
    );
}

export function compileLocal(source: string, std: string): Promise<LocalBuild> {
    if (!localCompilerSupported())
        return Promise.resolve(
            failed(
                "This browser cannot run the local compiler. Please update it to a recent version.",
            ),
        );
    const job = queue.then(async () => {
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
        // The worker keeps the downloaded and compiled toolchain between jobs;
        // every clang/wasm-ld run gets a fresh instance, so no heap carries over.
        worker ??= new Worker(new URL("./compile.worker.ts", import.meta.url), {
            type: "module",
        });
        const current = worker;
        const id = crypto.randomUUID();
        const result = await new Promise<LocalBuild>((resolve) => {
            const finish = (result: LocalBuild) => {
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
                if (data.reset) discard();
                finish({
                    ...data,
                    wasmModule: data.module,
                    js_code: data.ok ? LOCAL_WORKER_MARKER : "",
                    wasm_url: "",
                });
            };
            const error = (event: ErrorEvent) => {
                discard();
                finish(failed(event.message || "Local compiler worker failed"));
            };
            // Cold downloads can be slow. A dead compiler must not strand the UI.
            const timer = setTimeout(() => {
                discard();
                finish(
                    failed("Local compilation timed out after 180 seconds."),
                );
            }, 180_000);
            current.addEventListener("message", message);
            current.addEventListener("error", error);
            current.postMessage({
                id,
                source,
                std,
                base: new URL(
                    import.meta.env.BASE_URL +
                        "toolchain/" +
                        TOOLCHAIN_VERSION +
                        "/",
                    location.origin,
                ).href,
            });
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
