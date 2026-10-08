import { createServer } from "vite";
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toolchainId } from "../../scripts/toolchain-id.mjs";
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
    root: frontend,
    publicDir: path.join(frontend, "public"),
    plugins: [toolchainId()],
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
    cases: for (const name of (await fs.readdir(dir))
        .filter((f) => f.endsWith(".cpp"))
        .sort()) {
        if (process.env.CASE && !name.includes(process.env.CASE)) continue;
        if (process.env.AFTER && name <= process.env.AFTER) continue;
        const source = await read(path.join(dir, name)),
            base = name.slice(0, -4);
        const stds = (
            source.match(/@std:\s*(.*)/)?.[1] || "c++11 c++14 c++17 c++20 c++23"
        )
            .trim()
            .split(/\s+/);
        const expectation = source.match(/@expect:\s*(.*)/)?.[1] || "ok";
        const [kind, ...pattern] = expectation.split(" ");
        for (const std of stds) {
            const row = await page.evaluate(
                async ({ source, std, input, timeout }) => {
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
            summary.push({ case: base, std, success, ...row });
            console.log(
                success ? "PASS" : "FAIL",
                base,
                std,
                Math.round(row.compileMs) + "ms",
                row.usedPch ? "PCH" : "",
                row.status ||
                    row.error?.split("\n").find((x) => x.includes("error")),
            );
            await fs.writeFile(
                path.join(
                    resultsDir,
                    (process.env.AFTER || "start") + "-summary.json",
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
    // Cache hit: same source/std returns without another compiler job.
    const cache = await page.evaluate(async () => {
        const src = '#include <cstdio>\nint main(){puts("cache");}';
        await window.compilerTest.compileLocal(src, "c++17");
        const t = performance.now();
        const build = await window.compilerTest.compileLocal(src, "c++17");
        return { ok: build.ok, ms: performance.now() - t };
    });
    console.log("Cache hit", cache);
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
