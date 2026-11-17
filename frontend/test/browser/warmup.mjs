// Times the first in-browser build of a page with and without a warm-up
// (warmBrowserCompiler), and checks that a warm-up downloads nothing it was
// not allowed to. Run from `frontend` after `npm run toolchain`.
import { createServer } from "vite";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    readToolchainInputs,
    toolchainId,
} from "../../scripts/toolchain-id.mjs";
import { testEnv } from "./test-env.mjs";

const frontend = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);
const server = await createServer({
    configFile: false,
    optimizeDeps: {
        entries: ["test/browser/index.html"],
        include: ["@bjorn3/browser_wasi_shim"],
    },
    root: frontend,
    publicDir: path.join(frontend, "public"),
    plugins: [toolchainId(), testEnv()],
    server: { host: "127.0.0.1", port: 5182 },
});
await server.listen();
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || undefined,
    args: ["--no-sandbox"],
});
const STD = "c++17";
const pchSize = (
    await fs.stat(
        path.join(
            frontend,
            "public/toolchain",
            (await readToolchainInputs()).id,
            STD + ".pch.gz.bin",
        ),
    )
).size;
const ROUNDS = Number(process.env.ROUNDS || 3);
const plain = (n) =>
    `#include <iostream>\nint main() { int x = ${n}; std::cout << x * 2; }\n`;
const bits = (n) =>
    `#include <bits/stdc++.h>\nusing namespace std;\nint main() { vector<int> v(${n}); sort(v.begin(), v.end()); cout << v.size(); }\n`;

async function openPage(context) {
    const page = await context.newPage();
    const toolchainRequests = [];
    page.on("request", (request) => {
        if (request.url().includes("/toolchain/"))
            toolchainRequests.push(request.url().split("/").pop());
    });
    page.on("pageerror", (e) => console.error("page:", e.message));
    await page.goto("http://127.0.0.1:5182/test/browser/index.html");
    await page.waitForFunction(() => !!window.compilerTest);
    return { page, toolchainRequests };
}

const compile = (page, source) =>
    page.evaluate(
        async ({ source, std }) => {
            const t = performance.now();
            const result = await window.compilerTest.compileLocal(source, std);
            return {
                ok: result.ok,
                errors: result.errors,
                usedPch: !!result.usedPch,
                usedIncludesPch: !!result.usedIncludesPch,
                ms: Math.round(performance.now() - t),
            };
        },
        { source, std: STD },
    );

// Warms up for `source`, as the editor does for its code.
const warm = (page, source, downloadPch) =>
    page.evaluate(
        async ({ std, source, downloadPch }) => {
            const t = performance.now();
            const ok = await window.compilerTest.warm(std, source, downloadPch);
            return { ok, ms: Math.round(performance.now() - t) };
        },
        { std: STD, source, downloadPch },
    );

// Runs in the page: the URLs of the stored PCHs of a source's own includes.
const storedIncludesPchs = async () => {
    const urls = [];
    for (const cacheName of await caches.keys()) {
        const cache = await caches.open(cacheName);
        for (const request of await cache.keys())
            if (request.url.includes("/includes/")) urls.push(request.url);
    }
    return urls;
};

// The name the compile worker stores the PCH of these headers under
// (toolchainCache.ts): a hash of the standard and the headers.
const includesPchName = (headers) =>
    crypto
        .createHash("sha256")
        .update(STD + "\n" + headers.join("\n"))
        .digest("hex")
        .slice(0, 32) + ".pch";

// Warms up for `source` and waits until the PCH of its includes is stored:
// the worker does not wait for that write. Chrome shows an entry to the page
// that wrote it before the write is done, and closing that page right after
// can lose it, so another page of the same context must see it.
async function warmAndStore(page, source, headers) {
    assert.equal((await warm(page, source, false)).ok, true);
    const probe = await page.context().newPage();
    await probe.goto(page.url());
    await probe.waitForFunction(
        async (name) => {
            for (const cacheName of await caches.keys()) {
                const cache = await caches.open(cacheName);
                for (const request of await cache.keys())
                    if (request.url.endsWith("/includes/" + name)) {
                        const hit = await cache.match(request);
                        return (await hit.arrayBuffer()).byteLength > 0;
                    }
            }
            return false;
        },
        includesPchName(headers),
        { polling: 200 },
    );
    await probe.close();
}

const median = (values) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

try {
    const context = await browser.newContext();

    // Nothing downloaded yet: a warm-up must not start the download.
    {
        const { page, toolchainRequests } = await openPage(context);
        const result = await warm(page, bits(0), true);
        assert.equal(result.ok, true);
        assert.deepEqual(toolchainRequests, [], "warm-up downloaded files");
        // Downloads the compiler (not the PCH) for the cases below.
        assert.equal((await compile(page, plain(0))).ok, true);
        await page.close();
    }

    // The PCH has never been used: a warm-up that may not download it
    // leaves it alone; one that may fetches it.
    {
        const { page, toolchainRequests } = await openPage(context);
        assert.equal((await warm(page, bits(0), false)).ok, true);
        assert.ok(
            !toolchainRequests.some((name) => name.includes(".pch")),
            "warm-up downloaded a PCH: " + toolchainRequests,
        );
        assert.equal((await warm(page, bits(0), true)).ok, true);
        assert.ok(
            toolchainRequests.includes(STD + ".pch.gz.bin"),
            "warm-up did not fetch the PCH",
        );
        const build = await compile(page, bits(1));
        assert.equal(build.ok, true, build.errors.join("\n"));
        assert.equal(build.usedPch, true);
        // The worker stores the PCH in Cache Storage as it reads it; closing
        // the page before that write ends would drop it.
        await page.waitForFunction(
            async ({ name, size }) => {
                for (const cacheName of await caches.keys()) {
                    const cache = await caches.open(cacheName);
                    for (const request of await cache.keys())
                        if (request.url.endsWith("/" + name)) {
                            const response = await cache.match(request);
                            const body = await response.arrayBuffer();
                            return body.byteLength === size;
                        }
                }
                return false;
            },
            { name: STD + ".pch.gz.bin", size: pchSize },
            { polling: 500 },
        );
        await page.close();
    }

    // A PCH of the code's own includes: made by a warm-up, used by the builds
    // that follow, and stored for the next page.
    {
        const { page, toolchainRequests } = await openPage(context);
        await warmAndStore(page, plain(0), ["iostream"]);
        const build = await compile(page, plain(1));
        assert.equal(build.ok, true, build.errors.join("\n"));
        assert.equal(build.usedIncludesPch, true);
        assert.equal(build.usedPch, false);
        assert.deepEqual(
            toolchainRequests.filter((name) => name !== "bundle.js"),
            [],
        );
        // Not for code that starts with something else, whose headers could
        // mean something different: it compiles without, as before.
        const defined = await compile(page, "#define NDEBUG\n" + plain(2));
        assert.equal(defined.ok, true, defined.errors.join("\n"));
        assert.equal(defined.usedIncludesPch, false);
        // A header that does not exist is clang's to report, on its line.
        const missing = "#include <iostream>\n#include <no_such_header>\n";
        assert.equal((await warm(page, missing, false)).ok, true);
        const failed = await compile(page, missing + "int main() {}\n");
        assert.equal(failed.ok, false);
        assert.match(
            failed.errors.join("\n"),
            /main\.cpp:2:10: fatal error: 'no_such_header' file not found/,
        );
        // An error below the includes reads the same with the PCH.
        const wrong = await compile(
            page,
            "#include <iostream>\nint main() { undeclared = 1; }\n",
        );
        assert.equal(wrong.ok, false);
        assert.match(
            wrong.errors.join("\n"),
            /main\.cpp:2:14: error: use of undeclared identifier 'undeclared'/,
        );
        await page.close();
    }
    // The next page builds with the stored PCH, without a warm-up.
    {
        const { page } = await openPage(context);
        const build = await compile(page, plain(3));
        assert.equal(build.ok, true, build.errors.join("\n"));
        assert.equal(build.usedIncludesPch, true);
        // A stored PCH that clang cannot read must not fail the build: the
        // code compiles without it, and the PCH is deleted.
        await page.evaluate(async () => {
            for (const cacheName of await caches.keys()) {
                const cache = await caches.open(cacheName);
                for (const request of await cache.keys())
                    if (request.url.includes("/includes/"))
                        await cache.put(
                            request,
                            new Response(new Blob([new Uint8Array(1 << 20)])),
                        );
            }
        });
        await page.close();
    }
    {
        const { page } = await openPage(context);
        // Code with an error first: it fails without the PCH too, but not
        // with the same errors, so the PCH must not be trusted from then on.
        const wrong = await compile(
            page,
            "#include <iostream>\nint main() { undeclared = 1; }\n",
        );
        assert.equal(wrong.ok, false);
        assert.match(wrong.errors.join("\n"), /undeclared identifier/);
        assert.doesNotMatch(wrong.errors.join("\n"), /precompiled|PCH/i);
        // The code fixed: it builds, without the PCH, which is deleted.
        const build = await compile(page, plain(4));
        assert.equal(build.ok, true, build.errors.join("\n"));
        assert.equal(build.usedIncludesPch, false);
        await page.waitForFunction(
            `(${storedIncludesPchs})().then((urls) => urls.length === 0)`,
            null,
            { polling: 200 },
        );
        await page.close();
    }

    // A stopped build discards the worker, and what it had loaded with it:
    // the next warm-up loads the compiler into a new worker again.
    {
        const { page } = await openPage(context);
        let workers = 0;
        page.on("worker", (worker) => {
            if (worker.url().includes("compile.worker")) workers++;
        });
        assert.equal((await warm(page, bits(0), false)).ok, true);
        assert.equal(workers, 1);
        const stopped = await page.evaluate(
            async ({ source, std }) => {
                const build = window.compilerTest.compileLocal(source, std);
                setTimeout(() => window.compilerTest.cancel(), 50);
                return !!(await build).cancelled;
            },
            { source: bits(7), std: STD },
        );
        assert.equal(stopped, true);
        assert.equal((await warm(page, bits(0), false)).ok, true);
        assert.equal(workers, 2, "no warm-up after a stopped build");
        const build = await compile(page, bits(8));
        assert.equal(build.ok, true, build.errors.join("\n"));
        assert.equal(build.usedPch, true);
        await page.close();
    }

    // Small headers that make a set of includes no page has precompiled.
    const SMALL_HEADERS = ["cstddef", "climits", "cctype", "cstdint", "cfloat"];
    let unseen = 0;
    const neverPrecompiled = (n) =>
        `#include <${SMALL_HEADERS[unseen % SMALL_HEADERS.length]}>\n` +
        plain(n);
    const rows = [];
    // What the first build of a page uses without a warm-up.
    for (const [kind, source, coldUses, prepare] of [
        ["iostream, includes not precompiled before", neverPrecompiled, null],
        [
            "iostream, includes precompiled on an earlier visit",
            plain,
            "usedIncludesPch",
            async () => {
                const { page } = await openPage(context);
                await warmAndStore(page, plain(0), ["iostream"]);
                await page.close();
            },
        ],
        ["bits/stdc++.h", bits, "usedPch"],
    ]) {
        await prepare?.();
        const cold = [],
            warmed = [],
            warmUps = [];
        for (let round = 0; round < ROUNDS; round++) {
            // A new page is a new compile worker with nothing loaded.
            {
                const { page } = await openPage(context);
                const build = await compile(page, source(round + 1));
                assert.equal(build.ok, true, build.errors.join("\n"));
                const uses = `${kind}, round ${round}: ${JSON.stringify(build)}`;
                assert.equal(build.usedPch, coldUses === "usedPch", uses);
                assert.equal(
                    build.usedIncludesPch,
                    coldUses === "usedIncludesPch",
                    uses,
                );
                cold.push(build.ms);
                await page.close();
            }
            {
                const { page, toolchainRequests } = await openPage(context);
                const result = await warm(page, source(0), false);
                assert.equal(result.ok, true);
                warmUps.push(result.ms);
                const build = await compile(page, source(round + 100));
                assert.equal(build.ok, true, build.errors.join("\n"));
                assert.equal(build.usedPch || build.usedIncludesPch, true);
                warmed.push(build.ms);
                // Everything came from Cache Storage.
                assert.deepEqual(
                    toolchainRequests.filter((name) => name !== "bundle.js"),
                    [],
                );
                await page.close();
            }
            unseen++;
        }
        rows.push({
            code: kind,
            "first build (ms)": median(cold),
            "warm-up (ms)": median(warmUps),
            "first build after warm-up (ms)": median(warmed),
        });
        assert.ok(
            median(warmed) < median(cold),
            `${kind}: warmed ${warmed} not faster than cold ${cold}`,
        );
    }
    console.table(rows);
    console.log("warm-up: ok");
} finally {
    await browser.close();
    await server.close();
}
