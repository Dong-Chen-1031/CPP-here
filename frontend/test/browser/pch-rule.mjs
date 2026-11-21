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
const { startsWithStdcxx, leadingIncludes } = await import(
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

// The headers the in-browser compiler makes a PCH of (it has no counterpart
// on the server): only what a source includes before anything else.
for (const [source, headers] of [
    ["#include <iostream>\nint main() {}", ["iostream"]],
    [
        "// a\n\n#include <iostream>\r\n  #  include <vector> // b\n/* c\n*/ #include <map>\nusing namespace std;\n#include <set>\n",
        ["iostream", "vector", "map"],
    ],
    ['#pragma GCC optimize("O3")\n#include <cstdio>\n', ["cstdio"]],
    [
        "#include <bits/stdc++.h>\n#include <ext/pb_ds/assoc_container.hpp>\n",
        ["bits/stdc++.h", "ext/pb_ds/assoc_container.hpp"],
    ],
    // Anything first that could change what a header declares: none.
    ["#define NDEBUG\n#include <cassert>\n", []],
    ["#if 1\n#include <iostream>\n#endif\n", []],
    ["/* #include <iostream> */\nint main() {}", []],
    ["// \\\n#include <iostream>\nint main() {}", []],
    ['#include "iostream"\n', []],
    ["#include <iostream> int x;\n", []],
    ["int main() {}\n#include <iostream>\n", []],
    ["", []],
])
    assert.deepEqual(leadingIncludes(source), headers, source);
console.log("leadingIncludes: ok");
