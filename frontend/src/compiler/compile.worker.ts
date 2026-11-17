import {
    COMPILE_FLAGS,
    LINK_FLAGS,
    PCH_FLAGS,
    STANDARDS,
    TOOLCHAIN_ASSETS,
    TOOLCHAIN_ID,
} from "./config";
import { leadingIncludes, startsWithStdcxx } from "./pchRule";
import {
    deleteIncludesPch,
    fetchToolchainFile,
    readIncludesPch,
    storeIncludesPch,
} from "./toolchainCache";

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
        args: string[] | null,
        files: Tree,
        options: Record<string, unknown>,
    ): Promise<Tree>;
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

function loadPch(base: string, std: string) {
    if (!pchs.has(std))
        pchs.set(
            std,
            compressed(base + std + ".pch")
                .then((r) => r.arrayBuffer())
                .then((b) => new Uint8Array(b))
                .catch(() => null),
        );
    return pchs.get(std)!;
}

// What `clang++ <args>` runs: the compiler, then the linker. YoWASP's runClang
// asks the driver (`clang++ -###`) before every build, which starts clang once
// more; the answer only depends on the arguments, so it is asked once.
// null: not the list expected, and runClang is left to deal with it.
const driverCommands = new Map<string, string[][] | null>();

function parseDriverCommands(output: string): string[][] | null {
    // The same reading of `-###` as runClang's.
    const commands: string[][] = [];
    const lines = output.split("\n");
    let listing = false;
    for (const [index, line] of lines.entries()) {
        if (
            !listing &&
            /^(clang|Target:|Thread model:|InstalledDir:|Build config:)/.test(
                line,
            )
        )
            continue;
        listing = true;
        if (line === " (in-process)") continue;
        if (line === "")
            return index === lines.length - 1 && commands.length
                ? commands
                : null;
        if (!line.startsWith(' "')) return null;
        const command = Array.from(
            line.matchAll(/ (?:([^ "]+)|"((?:[^"\\$]|\\["\\$])+)")/g),
            (match) =>
                match[1] ?? match[2].replaceAll(/\\["$\\]/g, (m) => m[1]),
        );
        if (command[0] === "") command.shift();
        commands.push(command);
    }
    return null;
}

/** Runs clang++; without `files`, the code did not compile. */
async function clang(
    yowasp: YoWASP,
    args: string[],
    files: Tree,
): Promise<{ files?: Tree; stderr: string }> {
    let stderr = "";
    const decoder = new TextDecoder();
    const collect = (bytes: Uint8Array | null) => {
        if (bytes) stderr += decoder.decode(bytes, { stream: true });
    };
    const options = { stdout: collect, stderr: collect, decodeASCII: false };
    try {
        const key = args.join("\n");
        let commands = driverCommands.get(key);
        if (commands === undefined) {
            try {
                let listed = "";
                const list = (bytes: Uint8Array | null) => {
                    if (bytes) listed += decoder.decode(bytes);
                };
                await yowasp.runLLVM(
                    [args[0], "-###", ...args.slice(1)],
                    files,
                    { stdout: list, stderr: list, decodeASCII: false },
                );
                commands = parseDriverCommands(listed);
            } catch (error) {
                if (!(error instanceof yowasp.Exit)) throw error;
                commands = null;
            }
            driverCommands.set(key, commands);
        }
        if (!commands)
            return {
                files: await yowasp.runClang(args, files, options),
                stderr,
            };
        for (const command of commands)
            files = await yowasp.runLLVM(command, files, options);
        return { files, stderr };
    } catch (error) {
        if (!(error instanceof yowasp.Exit)) throw error;
        return { stderr };
    }
}

// A PCH of the headers a source starts with, when that is not bits/stdc++.h:
// parsing them is most of such a build (1.4 of the 1.5 seconds of an
// `#include <iostream>` hello world), and they change far less often than the
// code below them. Made here, on a warm-up (the page asks for the editor's
// code), kept in memory for the builds that follow and in Cache Storage for
// the next visit. A build never waits to make one: it uses the PCH if there is
// one and compiles without otherwise.
interface IncludesPch {
    /** What the PCH was made from; clang wants it next to the PCH. */
    header: string;
    bytes: Uint8Array<ArrayBuffer>;
    /** Made in this worker, or a build with it has succeeded. */
    trusted: boolean;
}
// By standard and headers; null when clang rejected the headers (a header
// that does not exist, for one), so that it is not tried again.
const includesPchs = new Map<string, IncludesPch | null>();
// Each is about 13 MB.
const MAX_INCLUDES_PCHS = 2;

const includesKey = (std: string, headers: string[]) =>
    std + "\n" + headers.join("\n");

function rememberIncludesPch(key: string, pch: IncludesPch | null) {
    includesPchs.delete(key);
    includesPchs.set(key, pch);
    if (includesPchs.size > MAX_INCLUDES_PCHS)
        includesPchs.delete(includesPchs.keys().next().value!);
}

/** The PCH of these headers; with `make`, made now if there is none. */
async function includesPch(
    state: Toolchain,
    base: string,
    std: string,
    headers: string[],
    make: boolean,
): Promise<IncludesPch | null> {
    const key = includesKey(std, headers);
    const known = includesPchs.get(key);
    if (known !== undefined) {
        rememberIncludesPch(key, known);
        return known;
    }
    const header = headers.map((name) => `#include <${name}>\n`).join("");
    const stored = await readIncludesPch(base, key);
    if (stored) {
        // Not trusted yet: see compile().
        const pch = { header, bytes: stored, trusted: false };
        rememberIncludesPch(key, pch);
        return pch;
    }
    if (!make) return null;
    const { files } = await clang(
        state.yowasp,
        [
            "clang++",
            "-x",
            "c++-header",
            "pch/includes.h",
            `-std=${std}`,
            "-isystem",
            "inc",
            ...COMPILE_FLAGS,
            ...PCH_FLAGS,
            "-o",
            "includes.pch",
        ],
        {
            inc: { bits: { "stdc++.h": state.header } },
            pch: { "includes.h": header },
        },
    );
    const bytes = files?.["includes.pch"] as
        Uint8Array<ArrayBuffer> | undefined;
    const pch = bytes ? { header, bytes, trusted: true } : null;
    rememberIncludesPch(key, pch);
    if (bytes) void storeIncludesPch(base, key, bytes);
    return pch;
}

type Result =
    | {
          ok: true;
          wasm: Uint8Array<ArrayBuffer>;
          usedPch: boolean;
          usedIncludesPch: boolean;
      }
    | { ok: false; errors: string[] };

async function compile(
    state: Toolchain,
    base: string,
    source: string,
    std: string,
): Promise<Result> {
    const { yowasp, header, memoryHelpers, pchStandards } = state;
    let pch: Uint8Array | null = null;
    let headers: string[] = [];
    let own: IncludesPch | null = null;
    if (startsWithStdcxx(source)) {
        if (pchStandards.includes(std)) pch = await loadPch(base, std);
    } else {
        headers = leadingIncludes(source);
        if (headers.length)
            own = await includesPch(state, base, std, headers, false);
    }
    const build = async (own: IncludesPch | null): Promise<Result> => {
        // Same tree and flags as the PCHs are built with, here and in
        // scripts/toolchain-worker.mjs; clang rejects a PCH whose header path
        // or options differ.
        const files: Tree = {
            "main.cpp": source,
            inc: { bits: { "stdc++.h": header } },
            "memory-helpers.o": memoryHelpers,
        };
        if (pch) files["stdcxx.pch"] = pch;
        if (own) {
            files.pch = { "includes.h": own.header };
            files["includes.pch"] = own.bytes;
        }
        const args = [
            "clang++",
            "main.cpp",
            `-std=${std}`,
            "-isystem",
            "inc",
            ...COMPILE_FLAGS,
            ...(pch ? ["-include-pch", "stdcxx.pch"] : []),
            ...(own ? ["-include-pch", "includes.pch"] : []),
            "memory-helpers.o",
            ...LINK_FLAGS,
            "-o",
            "main.wasm",
        ];
        const output = await clang(yowasp, args, files);
        if (!output.files) return { ok: false, errors: [output.stderr] };
        const wasm = output.files["main.wasm"] as Uint8Array<ArrayBuffer>;
        return { ok: true, wasm, usedPch: !!pch, usedIncludesPch: !!own };
    };
    if (!own || own.trusted) return build(own);
    // A PCH read from storage has not been seen to work yet. Should clang no
    // longer read it, every build with it would fail, so a failure is tried
    // again without: was it the code or the PCH?
    let result: Result | undefined;
    try {
        result = await build(own);
    } catch {
        // clang itself failed: on to the build without the PCH.
    }
    if (!result?.ok) {
        result = await build(null);
        if (result.ok) {
            includesPchs.delete(includesKey(std, headers));
            void deleteIncludesPch(base, includesKey(std, headers));
            return result;
        }
    }
    own.trusted = true;
    return result;
}

// Compiled for a warm-up: clang's code starts in V8's baseline tier and is
// optimized as it runs, so the first compile in a worker is about twice as
// slow as the next even with the toolchain loaded. The same headers as the
// user's code take the same paths through the compiler.
const WARM_UP_SOURCE = {
    pch: "#include <bits/stdc++.h>\nint main() { std::cout << 1; }\n",
    plain: "#include <iostream>\nint main() { std::cout << 1; }\n",
    // After the headers of the user's code, whatever they are.
    anyHeaders: `template <class T> struct CppHereWarmUp {
    T values[16];
    T sum() const {
        T total = 0;
        for (int i = 0; i < 16; i++) total += values[i] * (i + 1);
        return total;
    }
};
int main(int argc, char **) {
    CppHereWarmUp<long> a = {};
    CppHereWarmUp<double> b = {};
    for (int i = 0; i < 16; i++) {
        a.values[i] = argc + i;
        b.values[i] = argc * 0.5 + i;
    }
    return (int)(a.sum() % 7) + (int)b.sum() % 3;
}
`,
};

scope.onmessage = async ({ data }) => {
    const { id, source, std, base, warm } = data;
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
        if (warm) {
            // warm: { pch, prime, includes }. Loads what a build of that kind
            // needs, makes the PCH of `includes` (the headers the code starts
            // with) and, with prime, compiles a small program; nothing is
            // sent back but whether that worked.
            const usedPch = warm.pch && (await loadPch(base, std)) !== null;
            const own = warm.includes?.length
                ? await includesPch(state, base, std, warm.includes, true)
                : null;
            let ok = true;
            if (warm.prime) {
                const result = await compile(
                    state,
                    base,
                    warm.pch
                        ? WARM_UP_SOURCE.pch
                        : own
                          ? own.header + WARM_UP_SOURCE.anyHeaders
                          : WARM_UP_SOURCE.plain,
                    std,
                );
                // Headers the small program does not compile after are the
                // code's business, not a broken compiler.
                ok = result.ok || !!own;
            }
            scope.postMessage({
                id,
                ok,
                usedPch,
                usedIncludesPch: !!own,
                errors: [],
            });
            return;
        }
        const result = await compile(state, base, source, std);
        if (!result.ok) {
            scope.postMessage({ id, ok: false, errors: result.errors });
            return;
        }
        const module = await WebAssembly.compile(result.wasm);
        scope.postMessage({
            id,
            ok: true,
            module,
            wasmSizeBytes: result.wasm.byteLength,
            errors: [],
            usedPch: result.usedPch,
            usedIncludesPch: result.usedIncludesPch,
        });
    } catch (error) {
        // Not the code's fault (out of memory, a broken toolchain): the page
        // starts a new worker and may use the server instead.
        scope.postMessage({
            id,
            ok: false,
            errors: [String(error)],
            reset: true,
        });
    }
};
