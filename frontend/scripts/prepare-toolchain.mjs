// Generates the static assets of the in-browser compiler (see LOCAL-COMPILER.md)
// into public/toolchain/<version>/:
//   - YoWASP Clang's bundle.js, and its wasm modules and sysroot as .gz.bin
//   - stdcxx.h (the project's bits/stdc++.h), memory-helpers.o, one PCH per -std
//   - manifest.json, license notices
//
//   node scripts/prepare-toolchain.mjs [--if-enabled] [--no-pch] [--force]
//
// --if-enabled does nothing unless PUBLIC_LOCAL_COMPILER=true (environment or
// .env), so the normal build stays fast while the feature is off.
import zlib from "node:zlib";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { WASI } from "node:wasi";
import { fileURLToPath } from "node:url";

const frontend = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
);
const root = path.resolve(frontend, "..");
const argv = process.argv.slice(2);

if (argv.includes("--if-enabled")) {
    try {
        process.loadEnvFile(path.join(frontend, ".env"));
    } catch {}
    if (process.env.PUBLIC_LOCAL_COMPILER !== "true") {
        console.log("Local compiler disabled; skipping toolchain preparation.");
        process.exit(0);
    }
}

const config = JSON.parse(
    await fs.readFile(
        path.join(frontend, "src/compiler/toolchain.json"),
        "utf8",
    ),
);
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

const out = path.join(frontend, "public/toolchain", config.version);
const original = await fs.readFile(
    path.join(root, "builder/docker/inner/bits/stdc++.h"),
    "utf8",
);
// WASI has no setjmp/longjmp or signals.
const header = original
    .split("\n")
    .filter((l) => !/^\s*#\s*include\s*<(csetjmp|csignal|cstdalign)>/.test(l))
    .join("\n");
const helperSource = await fs.readFile(
    path.join(frontend, "src/compiler/memory-helpers.cpp"),
    "utf8",
);
const standards = argv.includes("--no-pch") ? [] : config.standards;
const inputsHash = crypto
    .createHash("sha256")
    .update(
        JSON.stringify({
            config,
            standards,
            header,
            helperSource,
            script: await fs.readFile(fileURLToPath(import.meta.url), "utf8"),
        }),
    )
    .digest("hex");

const manifestPath = path.join(out, "manifest.json");
if (!argv.includes("--force")) {
    try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
        if (manifest.inputsHash === inputsHash) {
            console.log("Toolchain up to date:", out);
            process.exit(0);
        }
    } catch {}
}
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });

// The worker serves these URLs from .gz.bin files (see compile.worker.ts), so
// fail here rather than in the browser if the bundle loads anything else.
const bundle = await fs.readFile(path.join(gen, "bundle.js"), "utf8");
const referenced = [
    ...bundle.matchAll(/new URL\("\.\/([^"]+)", import\.meta\.url\)/g),
].map((m) => m[1]);
for (const name of new Set([...referenced, ...config.assets]))
    if (!referenced.includes(name) || !config.assets.includes(name))
        throw Error(`bundle.js and toolchain.json disagree about ${name}`);
await fs.writeFile(path.join(out, "bundle.js"), bundle);

// Cloudflare static assets have a 25 MiB per-file cap. Publish gzip bytes as
// .gz.bin and decompress explicitly, independent of HTTP encodings.
for (const name of config.assets) {
    const compressed = zlib.gzipSync(await fs.readFile(path.join(gen, name)), {
        level: 9,
    });
    if (compressed.length > 25 * 1024 * 1024)
        throw Error(name + " exceeds the static asset cap after gzip");
    await fs.writeFile(path.join(out, name + ".gz.bin"), compressed);
}

await fs.writeFile(path.join(out, "stdcxx.h"), header);
const { runClang } = await import(path.join(gen, "bundle.js"));
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

const helper = await clang(
    [
        "-c",
        "memory-helpers.cpp",
        "-std=c++17",
        "-O2",
        "-fno-exceptions",
        "-o",
        "memory-helpers.o",
    ],
    { "memory-helpers.cpp": helperSource },
);
await fs.writeFile(
    path.join(out, "memory-helpers.o"),
    helper["memory-helpers.o"],
);

// Same tree and flags as compile.worker.ts: clang rejects a PCH built from a
// different header path or with different language options.
const tree = (extra) => ({
    inc: { bits: { "stdc++.h": header } },
    "memory-helpers.o": helper["memory-helpers.o"],
    ...extra,
});
const smokeSource =
    '#include <bits/stdc++.h>\nint main(){std::vector<int> v{3,1,2};std::sort(v.begin(),v.end());std::cout<<v[0]<<v[2]<<"\\n";}';
for (const std of standards) {
    const flags = [`-std=${std}`, "-isystem", "inc", ...config.compileFlags];
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
    const source =
        std === "c++98"
            ? smokeSource.replace("v{3,1,2}", "v(3,3)")
            : smokeSource;
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
    const output = await runWasi(smoke["main.wasm"]);
    const expected = std === "c++98" ? "33\n" : "13\n";
    if (output !== expected)
        throw Error(
            `PCH smoke test for ${std} printed ${JSON.stringify(output)}`,
        );
    await fs.writeFile(
        path.join(out, std + ".pch.gz.bin"),
        zlib.gzipSync(pch, { level: 9 }),
    );
    console.log(std, "PCH", pch.length, "bytes");
}

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
            version: config.version,
            yowasp: config.yowasp,
            headerSha256: crypto
                .createHash("sha256")
                .update(header)
                .digest("hex"),
            pch: standards,
            inputsHash,
        },
        null,
        2,
    ),
);
console.log("Prepared:", out);

async function runWasi(bytes) {
    const file = path.join(out, ".smoke-stdout");
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
