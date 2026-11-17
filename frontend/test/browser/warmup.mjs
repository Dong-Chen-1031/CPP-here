// Times the first in-browser build of a page with and without a warm-up
// (warmBrowserCompiler), and checks that a warm-up downloads nothing it was
// not allowed to. Run from `frontend` after `npm run toolchain`.
import { createServer } from "vite";
import { chromium } from "playwright";
import assert from "node:assert/strict";
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
                ms: Math.round(performance.now() - t),
            };
        },
        { source, std: STD },
    );

const warm = (page, pch, downloadPch) =>
    page.evaluate(
        async ({ std, pch, downloadPch }) => {
            const t = performance.now();
            const ok = await window.compilerTest.warm(std, pch, downloadPch);
            return { ok, ms: Math.round(performance.now() - t) };
        },
        { std: STD, pch, downloadPch },
    );

const median = (values) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

try {
    const context = await browser.newContext();

    // Nothing downloaded yet: a warm-up must not start the download.
    {
        const { page, toolchainRequests } = await openPage(context);
        const result = await warm(page, true, true);
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
        assert.equal((await warm(page, true, false)).ok, true);
        assert.ok(
            !toolchainRequests.some((name) => name.includes(".pch")),
            "warm-up downloaded a PCH: " + toolchainRequests,
        );
        assert.equal((await warm(page, true, true)).ok, true);
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

    const rows = [];
    for (const [kind, source, pch] of [
        ["iostream", plain, false],
        ["bits/stdc++.h", bits, true],
    ]) {
        const cold = [],
            warmed = [],
            warmUps = [];
        for (let round = 0; round < ROUNDS; round++) {
            // A new page is a new compile worker with nothing loaded.
            {
                const { page } = await openPage(context);
                const build = await compile(page, source(round + 1));
                assert.equal(build.ok, true, build.errors.join("\n"));
                cold.push(build.ms);
                await page.close();
            }
            {
                const { page, toolchainRequests } = await openPage(context);
                const result = await warm(page, pch, false);
                assert.equal(result.ok, true);
                warmUps.push(result.ms);
                const build = await compile(page, source(round + 100));
                assert.equal(build.ok, true, build.errors.join("\n"));
                warmed.push(build.ms);
                // Everything came from Cache Storage.
                assert.deepEqual(
                    toolchainRequests.filter((name) => name !== "bundle.js"),
                    [],
                );
                await page.close();
            }
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
