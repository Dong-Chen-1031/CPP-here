import { WASI, File, OpenFile, ConsoleStdout } from "@bjorn3/browser_wasi_shim";
import { OUTPUT_LIMIT_BYTES } from "../config/runLimits";
const scope = globalThis as unknown as {
    onmessage: ((event: MessageEvent) => void) | null;
    postMessage: (data: unknown) => void;
};
class OutputLimit extends Error {}
class MemoryLimit extends Error {}
let started = false;
scope.onmessage = async ({ data }) => {
    if (started) return;
    started = true;
    let total = 0;
    const decoders = { stdout: new TextDecoder(), stderr: new TextDecoder() };
    let pending = "";
    let pendingType: "stdout" | "stderr" = "stdout";
    let pendingBytes = 0;
    let first = true;
    const flushPending = () => {
        if (pending)
            scope.postMessage({
                type: pendingType,
                content: pending,
                byteLength: pendingBytes,
            });
        pending = "";
        pendingBytes = 0;
    };
    const emit = (type: "stdout" | "stderr", bytes: Uint8Array) => {
        if (total + bytes.length > OUTPUT_LIMIT_BYTES) {
            flushPending();
            scope.postMessage({ type: "limit", content: "output" });
            throw new OutputLimit();
        }
        if (!bytes.length) return;
        total += bytes.length;
        if (type !== pendingType) flushPending();
        pendingType = type;
        pending += decoders[type].decode(bytes, { stream: true });
        pendingBytes += bytes.length;
        // Bound the message queue when user code emits one character at a time.
        if (first || pending.includes("\n") || pendingBytes >= 16 * 1024) {
            first = false;
            flushPending();
        }
    };
    const flush = () => {
        flushPending();
        for (const type of ["stdout", "stderr"] as const) {
            const content = decoders[type].decode();
            if (content) scope.postMessage({ type, content, byteLength: 0 });
        }
    };
    try {
        const fds = [
            new OpenFile(new File(new TextEncoder().encode(data.inputData))),
            new ConsoleStdout((b) => emit("stdout", b)),
            new ConsoleStdout((b) => emit("stderr", b)),
        ];
        const wasi = new WASI(["main"], [], fds);
        const instance = await WebAssembly.instantiate(
            data.module_ as WebAssembly.Module,
            {
                wasi_snapshot_preview1: wasi.wasiImport,
                env: {
                    memory_limit: () => {
                        throw new MemoryLimit();
                    },
                },
            },
        );
        scope.postMessage({ type: "status", content: "Running" });
        const code = wasi.start(instance as Parameters<WASI["start"]>[0]);
        flush();
        if (code !== 0)
            scope.postMessage({
                type: "error",
                content: `Program exited with status ${code}`,
            });
        else scope.postMessage({ type: "status", content: "exit" });
    } catch (error) {
        if (error instanceof OutputLimit) return;
        if (error instanceof MemoryLimit) {
            flush();
            scope.postMessage({ type: "limit", content: "memory" });
            return;
        }
        flush();
        scope.postMessage({ type: "error", content: String(error) });
    }
};
