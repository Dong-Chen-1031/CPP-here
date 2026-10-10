// The toolchain id names public/toolchain/<id>/ and the Cache Storage entry
// browsers keep it in. It hashes every input of prepare-toolchain.mjs, so any
// change to them, such as the shared bits/stdc++.h, moves the toolchain to a
// new URL: browsers then download it again instead of mixing cached files of
// the old toolchain with code expecting the new one.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontend = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
);
const root = path.resolve(frontend, "..");
const read = (file) => fs.readFile(file, "utf8");

export async function readToolchainInputs() {
    const config = JSON.parse(
        await read(path.join(frontend, "src/compiler/toolchain.json")),
    );
    // WASI has no setjmp/longjmp or signals.
    const header = (
        await read(path.join(root, "builder/docker/inner/bits/stdc++.h"))
    )
        .split("\n")
        .filter(
            (l) => !/^\s*#\s*include\s*<(csetjmp|csignal|cstdalign)>/.test(l),
        )
        .join("\n");
    const helperSource = await read(
        path.join(frontend, "src/compiler/memory-helpers.cpp"),
    );
    const scripts = await Promise.all(
        ["prepare-toolchain.mjs", "toolchain-id.mjs"].map((name) =>
            read(path.join(frontend, "scripts", name)),
        ),
    );
    const hash = crypto
        .createHash("sha256")
        .update(JSON.stringify({ config, header, helperSource, scripts }))
        .digest("hex");
    return {
        config,
        header,
        helperSource,
        id: `${config.version}-${hash.slice(0, 12)}`,
    };
}

/**
 * Vite plugin defining `__TOOLCHAIN_ID__` (see src/compiler/config.ts).
 * @returns {import("vite").Plugin}
 */
export function toolchainId() {
    return {
        name: "toolchain-id",
        async config() {
            const { id } = await readToolchainInputs();
            return { define: { __TOOLCHAIN_ID__: JSON.stringify(id) } };
        },
    };
}
