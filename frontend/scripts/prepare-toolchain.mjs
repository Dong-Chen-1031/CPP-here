// Generates the static assets of the in-browser compiler (see LOCAL-COMPILER.md)
// into public/toolchain/<id>/ (see toolchain-id.mjs):
//   - YoWASP Clang's bundle.js, and its wasm modules and sysroot as .gz.bin
//   - stdcxx.h (the project's bits/stdc++.h), memory-helpers.o, one PCH per -std
//   - manifest.json, license notices
//
//   node scripts/prepare-toolchain.mjs [--if-enabled] [--no-pch] [--force]
//
// --if-enabled does nothing when PUBLIC_LOCAL_COMPILER (environment or .env) is
// set to anything but "true", so the build stays fast while the feature is off.
import zlib from "node:zlib";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { promisify } from "node:util";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { readToolchainInputs } from "./toolchain-id.mjs";

const frontend = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
);
const argv = process.argv.slice(2);
const gzip = promisify(zlib.gzip);

if (argv.includes("--if-enabled")) {
    try {
        process.loadEnvFile(path.join(frontend, ".env"));
    } catch {}
    if ((process.env.PUBLIC_LOCAL_COMPILER ?? "true") !== "true") {
        console.log("Local compiler disabled; skipping toolchain preparation.");
        process.exit(0);
    }
}

const { config, header, helperSource, id } = await readToolchainInputs();
const gen = path.dirname(fileURLToPath(import.meta.resolve("@yowasp/clang")));
const yowaspPackage = JSON.parse(
    await fs.readFile(path.join(gen, "../package.json"), "utf8"),
);
// The version is pinned so that its npm provenance can be checked
// (`npm audit signatures`); later releases are not built on GitHub Actions.
if (yowaspPackage.version !== config.yowasp)
    throw Error(
        `@yowasp/clang ${yowaspPackage.version} installed, toolchain.json expects ${config.yowasp}`,
    );

const toolchains = path.join(frontend, "public/toolchain");
const out = path.join(toolchains, id);
// Older toolchains would only add to the deployed assets.
for (const name of await fs.readdir(toolchains).catch(() => []))
    if (name !== id)
        await fs.rm(path.join(toolchains, name), {
            recursive: true,
            force: true,
        });
// Not part of the id: a --no-pch build only lacks the PCHs, which the
// manifest lists.
const standards = argv.includes("--no-pch") ? [] : config.standards;

const manifestPath = path.join(out, "manifest.json");
if (!argv.includes("--force")) {
    try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
        if (
            manifest.version === id &&
            JSON.stringify(manifest.pch) === JSON.stringify(standards)
        ) {
            console.log("Toolchain up to date:", out);
            process.exit(0);
        }
    } catch {}
}

// Building the PCHs takes minutes with no output of clang's own, so say what's
// happening rather than look stuck.
const started = performance.now();
const log = (...message) =>
    console.log(
        `[toolchain ${((performance.now() - started) / 1000).toFixed(1)}s]`,
        ...message,
    );
console.log(
    `Preparing the in-browser compiler toolchain (${id}); this takes a few minutes and runs again only when the toolchain changes.`,
);
console.log(
    "To skip it, set PUBLIC_LOCAL_COMPILER=false in frontend/.env (the in-browser compiler is then disabled).",
);
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });

// The worker serves these URLs from .gz.bin files (see compile.worker.ts), so
// fail here rather than in the browser if the bundle loads anything else.
const bundle = patchWriteStream(
    await fs.readFile(path.join(gen, "bundle.js"), "utf8"),
);
const referenced = [
    ...bundle.matchAll(/new URL\("\.\/([^"]+)", import\.meta\.url\)/g),
].map((m) => m[1]);
for (const name of new Set([...referenced, ...config.assets]))
    if (!referenced.includes(name) || !config.assets.includes(name))
        throw Error(`bundle.js and toolchain.json disagree about ${name}`);
await fs.writeFile(path.join(out, "bundle.js"), bundle);

// Each Clang job runs in a worker thread (toolchain-worker.mjs) with its own
// Clang, so the PCHs build in parallel. One after another they took about 6
// minutes on Cloudflare's builders (c++20 and c++23 1.5 minutes each); on 4
// cores they now take as long as c++23 alone, plus some. TOOLCHAIN_JOBS caps
// the number of threads, and so does memory: all four together peaked at
// 1.8 GB.
const jobs = Math.max(
    1,
    Math.min(
        Number(process.env.TOOLCHAIN_JOBS) || os.availableParallelism(),
        Math.floor(os.totalmem() / 2 ** 30),
    ),
);
const shared = {
    bundle: path.join(gen, "bundle.js"),
    config,
    header,
};
function runWorker(data) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(
            new URL("./toolchain-worker.mjs", import.meta.url),
            { workerData: { ...shared, ...data } },
        );
        let result;
        worker.on("message", (message) => {
            if (message.log) log(...message.log);
            else result = message.result;
        });
        worker.on("error", reject);
        worker.on("exit", (code) =>
            code === 0
                ? resolve(result)
                : reject(Error(`toolchain worker exited with ${code}`)),
        );
    });
}

log("Compiling memory-helpers.o");
const helperJob = runWorker({ job: "helper", helperSource });

// Cloudflare static assets have a 25 MiB per-file cap. Publish gzip bytes as
// .gz.bin and decompress explicitly, independent of HTTP encodings. zlib's
// async API compresses on libuv's thread pool, alongside the Clang thread.
await Promise.all(
    config.assets.map(async (name) => {
        const compressed = await gzip(await fs.readFile(path.join(gen, name)), {
            level: 9,
        });
        if (compressed.length > 25 * 1024 * 1024)
            throw Error(name + " exceeds the static asset cap after gzip");
        await fs.writeFile(path.join(out, name + ".gz.bin"), compressed);
    }),
);
log("Compressed", config.assets.join(", "));

await fs.writeFile(path.join(out, "stdcxx.h"), header);
const helper = await helperJob;
await fs.writeFile(path.join(out, "memory-helpers.o"), helper);

// Newer standards take longest (c++23 about 15 times c++98), so start them
// first: the short ones then fill the threads while the long ones finish.
log(`Building ${standards.length} PCHs, ${jobs} at a time`);
const queue = standards
    .map((std, i) => ({
        std,
        step: `[${i + 1}/${standards.length}] ${std}:`,
    }))
    .reverse();
await Promise.all(
    Array.from({ length: Math.min(jobs, queue.length) }, async () => {
        for (let task; (task = queue.shift());)
            await runWorker({ job: "pch", helper, out, ...task });
    }),
);

const wasiShim = path.dirname(
    fileURLToPath(import.meta.resolve("@bjorn3/browser_wasi_shim")),
);
for (const [name, from] of [
    [
        "LLVM-LICENSE.txt",
        path.join(frontend, "scripts/licenses/LLVM-LICENSE.txt"),
    ],
    [
        "wasi-libc-LICENSE.txt",
        path.join(frontend, "scripts/licenses/wasi-libc-LICENSE.txt"),
    ],
    ["browser_wasi_shim-LICENSE-MIT", path.join(wasiShim, "../LICENSE-MIT")],
    [
        "browser_wasi_shim-LICENSE-APACHE",
        path.join(wasiShim, "../LICENSE-APACHE"),
    ],
])
    await fs.copyFile(from, path.join(out, name));
await fs.writeFile(
    path.join(out, "NOTICE.txt"),
    `Clang/LLD ${config.yowasp} built for WebAssembly by YoWASP (ISC),
https://www.npmjs.com/package/@yowasp/clang/v/${config.yowasp}
Source: https://codeberg.org/YoWASP/clang (formerly https://github.com/YoWASP/clang)

LLVM, Clang, LLD, libc++, libc++abi and compiler-rt: Apache License v2.0 with
LLVM Exceptions, see LLVM-LICENSE.txt. wasi-libc: see wasi-libc-LICENSE.txt.
`,
);

await fs.writeFile(
    manifestPath,
    JSON.stringify(
        {
            version: id,
            yowasp: config.yowasp,
            headerSha256: crypto
                .createHash("sha256")
                .update(header)
                .digest("hex"),
            pch: standards,
        },
        null,
        2,
    ),
);
log("Prepared:", out);

// YoWASP's virtual filesystem copies the whole file on every write, so writing
// an n-byte file costs O(n²): an object file with `int a[8000000];` (32 MB of
// zeros) took 30 to 70 seconds to write. Grow a backing buffer by doubling
// instead. `data` stays the file's exact contents (a view of the buffer), so
// the rest of the bundle is unaffected; a buffer replaced elsewhere (open with
// truncate, setSize growing it, an input file) is never written into. The
// output is the same: the same main.wasm bytes for the same source.
function patchWriteStream(bundle) {
    const original = `  write(contents) {
    const offset = Number(this.offset);
    const newData = new Uint8Array(Math.max(this.file.data.length, offset + contents.length));
    newData.set(this.file.data);
    newData.subarray(offset).set(contents);
    this.file.data = newData;
    this.offset += BigInt(contents.length);
  }`;
    const patched = `  write(contents) {
    const offset = Number(this.offset);
    const file = this.file;
    const length = file.data.length;
    const end = Math.max(length, offset + contents.length);
    let buffer = file.cppHereBuffer;
    if (buffer && (file.data.buffer !== buffer.buffer || file.data.byteOffset !== 0))
      buffer = undefined;
    if (!buffer || buffer.length < end) {
      const grown = new Uint8Array(Math.max(end, 2 * (buffer ? buffer.length : length), 4096));
      grown.set(file.data);
      buffer = grown;
    } else if (offset > length) {
      buffer.fill(0, length, offset);
    }
    buffer.set(contents, offset);
    file.cppHereBuffer = buffer;
    file.data = buffer.subarray(0, end);
    this.offset += BigInt(contents.length);
  }`;
    // Fail rather than ship the slow writer when an update changes the code.
    if (bundle.split(original).length !== 2)
        throw Error(
            "@yowasp/clang bundle.js: WriteStream.write is not the expected code; update patchWriteStream in prepare-toolchain.mjs",
        );
    return bundle.replace(original, patched);
}
