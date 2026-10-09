import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
);
// Bundle this tiny pure function for Node, with the same Vite transformer.
import { transformWithEsbuild } from "vite";
const text = await fs.readFile(
    path.join(root, "frontend/src/compiler/pchRule.ts"),
    "utf8",
);
const { code } = await transformWithEsbuild(text, "pchRule.ts");
const { startsWithStdcxx } = await import(
    "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);
const builder = await fs.readFile(
    path.join(root, "builder/docker/cpp-here-build"),
    "utf8",
);
// The function sits between these two lines; if either moves, fail here
// rather than run a wrong slice of the script.
const start = builder.indexOf("starts_with_stdcxx()");
const end = builder.indexOf("# Use the precompiled");
assert.ok(
    start !== -1 && end > start,
    "starts_with_stdcxx() not found in cpp-here-build",
);
const fn = builder.slice(start, end);
let count = 0;
for (const dir of ["cases", "pch_rule"])
    for (const name of await fs.readdir(
        path.join(root, "builder/test/regression", dir),
    )) {
        if (!name.endsWith(".cpp")) continue;
        const file = path.join(root, "builder/test/regression", dir, name);
        const result =
            execFileSync(
                "bash",
                [
                    "-c",
                    fn +
                        '\nif starts_with_stdcxx "$1"; then echo yes; else echo no; fi',
                    "_",
                    file,
                ],
                { encoding: "utf8" },
            ).trim() === "yes";
        assert.equal(
            startsWithStdcxx(await fs.readFile(file, "utf8")),
            result,
            name,
        );
        count++;
    }
console.log(count + " PCH eligibility cases match the builder rule");
