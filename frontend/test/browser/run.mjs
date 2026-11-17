import { createServer } from "vite";
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toolchainId } from "../../scripts/toolchain-id.mjs";
import { testEnv } from "./test-env.mjs";
const frontend = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);
const root = path.resolve(frontend, "..");
const dir = path.join(root, "builder/test/regression/cases");
const resultsDir = path.join(frontend, "test/browser/results");
await fs.mkdir(resultsDir, { recursive: true });
const server = await createServer({
    configFile: false,
    // Pre-bundle the run worker's dependency too, or Vite finds it at the
    // first run and reloads the page mid-test.
    optimizeDeps: {
        entries: ["test/browser/index.html"],
        include: ["@bjorn3/browser_wasi_shim"],
    },
    root: frontend,
    publicDir: path.join(frontend, "public"),
    plugins: [toolchainId(), testEnv()],
    server: { host: "127.0.0.1", port: 5178 },
});
await server.listen();
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || undefined,
    args: ["--no-sandbox"],
});
try {
    const page = await browser.newPage();
    page.on("console", (msg) => {
        if (msg.type() === "error") console.error("browser:", msg.text());
    });
    page.on("pageerror", (e) => console.error("page:", e.message));
    await page.goto("http://127.0.0.1:5178/test/browser/index.html");
    await page.waitForFunction(() => !!window.compilerTest);
    const read = async (file) => fs.readFile(file, "utf8").catch(() => "");
    let pass = 0,
        fail = 0;
    const summary = [];
    const deadline = process.env.MAX_MS
        ? Date.now() + Number(process.env.MAX_MS)
        : Infinity;
    let last = "";
    // INCLUDES_PCH=1 runs every case with a PCH of its own includes, made by
    // a warm-up as in the editor, instead of the shipped PCH of
    // bits/stdc++.h: <bits/./stdc++.h> is the same header under a name the
    // shipped PCH's rule does not match. One standard after another, so that
    // each PCH is made once.
    const includesPch = process.env.INCLUDES_PCH === "1";
    let usedIncludesPch = 0;
    const files = (await fs.readdir(dir))
        .filter((f) => f.endsWith(".cpp"))
        .sort();
    const order = includesPch
        ? ["c++98", "c++11", "c++14", "c++17", "c++20", "c++23"].flatMap(
              (only) => files.map((name) => ({ name, only })),
          )
        : files.map((name) => ({ name, only: null }));
    cases: for (const { name, only } of order) {
        if (process.env.CASE && !name.includes(process.env.CASE)) continue;
        if (process.env.AFTER && name <= process.env.AFTER) continue;
        const original = await read(path.join(dir, name)),
            base = name.slice(0, -4);
        const source = includesPch
            ? original.replace(
                  /^([ \t]*#[ \t]*include[ \t]*<)bits\/stdc\+\+\.h>/m,
                  "$1bits/./stdc++.h>",
              )
            : original;
        const stds = (
            source.match(/@std:\s*(.*)/)?.[1] || "c++11 c++14 c++17 c++20 c++23"
        )
            .trim()
            .split(/\s+/);
        const expectation = source.match(/@expect:\s*(.*)/)?.[1] || "ok";
        const [kind, ...pattern] = expectation.split(" ");
        for (const std of stds) {
            if (only && std !== only) continue;
            const row = await page.evaluate(
                async ({ source, std, input, timeout, warm }) => {
                    if (warm)
                        await window.compilerTest.warm(std, source, false);
                    const t = performance.now();
                    const build = await window.compilerTest.compileLocal(
                        source,
                        std,
                    );
                    const compileMs = performance.now() - t;
                    if (!build.ok)
                        return {
                            ok: false,
                            error: build.errors.join("\n"),
                            compileMs,
                        };
                    return {
                        ok: true,
                        usedPch: build.usedPch,
                        usedIncludesPch: build.usedIncludesPch,
                        compileMs,
                        ...(await window.compilerTest.run(
                            build.wasmModule,
                            input,
                            timeout,
                        )),
                    };
                },
                {
                    source,
                    std,
                    input: await read(path.join(dir, base + ".in")),
                    timeout: kind === "tle" ? 3000 : 20_000,
                    warm: includesPch,
                },
            );
            let success = false;
            if (kind === "compile-error")
                success =
                    !row.ok &&
                    (!pattern.length ||
                        new RegExp(
                            pattern.join(" ").replace(name, "main.cpp"),
                        ).test(row.error));
            else if (kind === "ok")
                success =
                    row.ok &&
                    row.status === "exit" &&
                    row.stdout === (await read(path.join(dir, base + ".out")));
            else if (kind === "runtime-error")
                success = row.ok && row.status?.startsWith("error:");
            else if (kind === "tle")
                success =
                    row.status === "limit:time" &&
                    row.stdout ===
                        (await read(path.join(dir, base + ".out"))) &&
                    row.stderr === (await read(path.join(dir, base + ".err")));
            else success = row.status === "limit:" + kind.replace("limit-", "");
            success ? pass++ : fail++;
            if (row.usedIncludesPch) usedIncludesPch++;
            summary.push({ case: base, std, success, ...row });
            console.log(
                success ? "PASS" : "FAIL",
                base,
                std,
                Math.round(row.compileMs) + "ms",
                row.usedPch ? "PCH" : row.usedIncludesPch ? "includes PCH" : "",
                row.status ||
                    row.error?.split("\n").find((x) => x.includes("error")),
            );
            await fs.writeFile(
                path.join(
                    resultsDir,
                    (includesPch ? "includes-pch-" : "") +
                        (process.env.AFTER || "start") +
                        "-summary.json",
                ),
                JSON.stringify({ pass, fail, results: summary }, null, 2),
            );
            await page
                .locator("#results")
                .textContent()
                .then(() =>
                    page.evaluate(
                        (text) =>
                            (document.querySelector("#results").textContent =
                                text),
                        `${pass} passed, ${fail} failed\n` +
                            summary
                                .map(
                                    (x) =>
                                        `${x.success ? "PASS" : "FAIL"} ${x.case} ${x.std}`,
                                )
                                .join("\n"),
                    ),
                );
        }
        last = name;
        if (Date.now() > deadline) break cases;
    }
    console.log("Last file:", last);
    if (includesPch) {
        console.log(usedIncludesPch, "builds used a PCH of their includes");
        if (!usedIncludesPch) {
            console.error("FAIL no build used a PCH of its includes");
            fail++;
        }
    }
    // Cache hit: same source/std returns without another compiler job.
    const cache = await page.evaluate(async () => {
        const src = '#include <cstdio>\nint main(){puts("cache");}';
        await window.compilerTest.compileLocal(src, "c++17");
        const t = performance.now();
        const build = await window.compilerTest.compileLocal(src, "c++17");
        return { ok: build.ok, ms: performance.now() - t };
    });
    console.log("Cache hit", cache);
    // A real compile takes seconds; a hit is one message to the worker.
    if (!cache.ok || cache.ms > 500) {
        console.error("FAIL cache hit", cache);
        fail++;
    }
    await page.screenshot({
        path: path.join(resultsDir, "screenshot.png"),
        fullPage: true,
    });
    console.log({ pass, fail });
    if (fail) process.exitCode = 1;
} finally {
    await browser.close();
    await server.close();
}
