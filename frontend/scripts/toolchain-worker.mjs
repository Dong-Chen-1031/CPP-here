// Runs one Clang job of prepare-toolchain.mjs in its own thread, so the PCHs of
// all standards build in parallel. Each thread loads its own Clang: YoWASP runs
// one command at a time on the thread that calls it.
//
//   { job: "helper", helperSource }      -> memory-helpers.o
//   { job: "pch", std, helper, out, ... } -> <out>/<std>.pch.gz.bin, smoke-tested
import zlib from "node:zlib";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { parentPort, workerData } from "node:worker_threads";

const gzip = promisify(zlib.gzip);
const { bundle, config, header } = workerData;
const log = (...message) => parentPort.postMessage({ log: message });

const { runClang } = await import(bundle);
let stderr = "";
const decoder = new TextDecoder();
const options = {
    stdout: (b) => b && (stderr += decoder.decode(b, { stream: true })),
    stderr: (b) => b && (stderr += decoder.decode(b, { stream: true })),
    decodeASCII: false,
    fetchProgress: () => {},
};
async function clang(args, files) {
    stderr = "";
    try {
        return await runClang(["clang++", ...args], files, options);
    } catch (error) {
        throw Error(`clang++ ${args.join(" ")}\n${stderr}`, { cause: error });
    }
}

if (workerData.job === "helper") {
    const output = await clang(
        [
            "-c",
            "memory-helpers.cpp",
            "-std=c++17",
            "-O2",
            "-fno-exceptions",
            "-o",
            "memory-helpers.o",
        ],
        { "memory-helpers.cpp": workerData.helperSource },
    );
    parentPort.postMessage({ result: output["memory-helpers.o"] });
} else {
    const { std, helper, out, step } = workerData;
    // Same tree and flags as compile.worker.ts: clang rejects a PCH built from
    // a different header path or with different language options.
    const tree = (extra) => ({
        inc: { bits: { "stdc++.h": header } },
        "memory-helpers.o": helper,
        ...extra,
    });
    const flags = [`-std=${std}`, "-isystem", "inc", ...config.compileFlags];
    log(step, "building PCH");
    const pch = (
        await clang(
            [
                "-x",
                "c++-header",
                "inc/bits/stdc++.h",
                ...flags,
                "-Xclang",
                "-fno-pch-timestamp",
                "-o",
                "stdcxx.pch",
            ],
            tree({}),
        )
    )["stdcxx.pch"];
    // A PCH that clang refuses would silently cost every build its speed-up.
    const smokeSource =
        '#include <bits/stdc++.h>\nint main(){std::vector<int> v{3,1,2};std::sort(v.begin(),v.end());std::cout<<v[0]<<v[2]<<"\\n";}';
    const source =
        std === "c++98"
            ? smokeSource.replace("v{3,1,2}", "v(3,3)")
            : smokeSource;
    log(step, "smoke-testing PCH");
    const smoke = await clang(
        [
            "main.cpp",
            ...flags,
            "-include-pch",
            "stdcxx.pch",
            "memory-helpers.o",
            ...config.linkFlags,
            "-o",
            "main.wasm",
        ],
        tree({ "main.cpp": source, "stdcxx.pch": pch }),
    );
    const output = await runWasi(smoke["main.wasm"], std);
    const expected = std === "c++98" ? "33\n" : "13\n";
    if (output !== expected)
        throw Error(
            `PCH smoke test for ${std} printed ${JSON.stringify(output)}`,
        );
    await fs.writeFile(
        path.join(out, std + ".pch.gz.bin"),
        await gzip(pch, { level: 9 }),
    );
    log(step, "PCH", pch.length, "bytes");
    parentPort.postMessage({ result: null });

    async function runWasi(bytes, std) {
        // One file per standard: the smoke tests run at the same time.
        const file = path.join(out, `.smoke-stdout-${std}`);
        // node:wasi warns that it is experimental once per thread; the main
        // thread used to print that once, not once per standard.
        const { emitWarning } = process;
        process.emitWarning = (warning, ...rest) =>
            /^WASI is an experimental/.test(warning)
                ? undefined
                : emitWarning.call(process, warning, ...rest);
        const { WASI } = await import("node:wasi");
        const handle = await fs.open(file, "w+");
        try {
            const wasi = new WASI({ version: "preview1", stdout: handle.fd });
            const { instance } = await WebAssembly.instantiate(bytes, {
                wasi_snapshot_preview1: wasi.wasiImport,
                env: {
                    memory_limit: () => {
                        throw Error("memory limit");
                    },
                },
            });
            wasi.start(instance);
        } finally {
            await handle.close();
        }
        const output = await fs.readFile(file, "utf8");
        await fs.rm(file);
        return output;
    }
}
