import {
    COMPILE_FLAGS,
    LINK_FLAGS,
    STANDARDS,
    TOOLCHAIN_ASSETS,
    TOOLCHAIN_ID,
} from "./config";
import { startsWithStdcxx } from "./pchRule";
import { fetchToolchainFile } from "./toolchainCache";

const scope = globalThis as unknown as {
    onmessage: ((event: MessageEvent) => void) | null;
    postMessage: (data: unknown) => void;
};

type Tree = { [name: string]: Tree | string | Uint8Array };
interface YoWASP {
    runClang(
        args: string[],
        files: Tree,
        options: Record<string, unknown>,
    ): Promise<Tree>;
    runLLVM(
        args: null,
        files: Tree,
        options: Record<string, unknown>,
    ): Promise<unknown>;
    Exit: new (...args: never[]) => Error;
}
interface Toolchain {
    yowasp: YoWASP;
    header: string;
    memoryHelpers: Uint8Array;
    pchStandards: string[];
}

let toolchain: Promise<Toolchain> | undefined;
const pchs = new Map<string, Promise<Uint8Array | null>>();

const read = fetchToolchainFile;
async function compressed(url: string) {
    const response = await read(url + ".gz.bin");
    return new Response(
        response.body!.pipeThrough(new DecompressionStream("gzip")),
    );
}

// YoWASP's bundle fetches its wasm modules and sysroot next to itself. They are
// published gzip-compressed (Cloudflare's 25 MiB per-file cap), so serve those
// URLs from the .gz.bin files. The bundle keeps a reference to fetch when it is
// evaluated, so this must run before it is imported.
function serveCompressedAssets(base: string) {
    const fetchOriginal = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input, base);
        const name = url.href.startsWith(base)
            ? url.href.slice(base.length)
            : "";
        if (!TOOLCHAIN_ASSETS.includes(name)) return fetchOriginal(input, init);
        const response = await compressed(url.href);
        return new Response(response.body, {
            headers: {
                "Content-Type": name.endsWith(".wasm")
                    ? "application/wasm"
                    : "application/octet-stream",
            },
        });
    };
}

async function load(base: string): Promise<Toolchain> {
    serveCompressedAssets(base);
    const yowasp: YoWASP = await import(/* @vite-ignore */ base + "bundle.js");
    const [, header, manifest, memoryHelpers] = await Promise.all([
        // Downloads and compiles the toolchain once; later runs reuse it.
        yowasp.runLLVM(null, {}, { fetchProgress: () => {} }),
        read(base + "stdcxx.h").then((r) => r.text()),
        read(base + "manifest.json").then(
            (r) => r.json() as Promise<{ version: string; pch: string[] }>,
        ),
        read(base + "memory-helpers.o").then((r) => r.arrayBuffer()),
    ]);
    if (manifest.version !== TOOLCHAIN_ID)
        throw new Error(
            `Toolchain ${manifest.version} does not match ${TOOLCHAIN_ID}`,
        );
    return {
        yowasp,
        header,
        memoryHelpers: new Uint8Array(memoryHelpers),
        pchStandards: manifest.pch,
    };
}

scope.onmessage = async ({ data }) => {
    const { id, source, std, base } = data;
    let state: Toolchain;
    try {
        if (!STANDARDS.includes(std))
            throw new Error("Unsupported C++ standard: " + std);
        toolchain ??= load(base);
        state = await toolchain;
    } catch (error) {
        // A failed module import stays failed in this worker: ask for a new one.
        scope.postMessage({
            id,
            ok: false,
            errors: [String(error)],
            reset: true,
        });
        return;
    }
    try {
        const { yowasp, header, memoryHelpers, pchStandards } = state;
        let pch: Uint8Array | null = null;
        if (startsWithStdcxx(source) && pchStandards.includes(std)) {
            if (!pchs.has(std))
                pchs.set(
                    std,
                    compressed(base + std + ".pch")
                        .then((r) => r.arrayBuffer())
                        .then((b) => new Uint8Array(b))
                        .catch(() => null),
                );
            pch = await pchs.get(std)!;
        }
        // Same tree and flags as scripts/prepare-toolchain.mjs builds the PCHs
        // with; clang rejects a PCH whose header path or options differ.
        const files: Tree = {
            "main.cpp": source,
            inc: { bits: { "stdc++.h": header } },
            "memory-helpers.o": memoryHelpers,
        };
        if (pch) files["stdcxx.pch"] = pch;
        const args = [
            "clang++",
            "main.cpp",
            `-std=${std}`,
            "-isystem",
            "inc",
            ...COMPILE_FLAGS,
            ...(pch ? ["-include-pch", "stdcxx.pch"] : []),
            "memory-helpers.o",
            ...LINK_FLAGS,
            "-o",
            "main.wasm",
        ];
        let stderr = "";
        const decoder = new TextDecoder();
        const collect = (bytes: Uint8Array | null) => {
            if (bytes) stderr += decoder.decode(bytes, { stream: true });
        };
        let output: Tree;
        try {
            output = await yowasp.runClang(args, files, {
                stdout: collect,
                stderr: collect,
                decodeASCII: false,
            });
        } catch (error) {
            if (!(error instanceof yowasp.Exit)) throw error;
            scope.postMessage({ id, ok: false, errors: [stderr] });
            return;
        }
        const module = await WebAssembly.compile(
            output["main.wasm"] as Uint8Array<ArrayBuffer>,
        );
        scope.postMessage({
            id,
            ok: true,
            module,
            errors: [],
            diagnostics: stderr,
            usedPch: !!pch,
        });
    } catch (error) {
        scope.postMessage({ id, ok: false, errors: [String(error)] });
    }
};
