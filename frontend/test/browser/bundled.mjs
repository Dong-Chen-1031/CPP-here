import { preview } from "vite";
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);
const server = await preview({
    configFile: false,
    root,
    preview: { host: "127.0.0.1", port: 5179 },
    build: { outDir: "test/browser/results/dist" },
});
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || undefined,
    args: ["--no-sandbox"],
});
try {
    const page = await browser.newPage();
    page.on("requestfailed", (r) =>
        console.log("FAILED REQUEST", r.url(), r.failure()),
    );
    page.on("console", (m) => console.log("CONSOLE", m.text()));
    page.on("pageerror", (e) => console.log("PAGEERROR", e));
    await page.goto("http://127.0.0.1:5179/test/browser/index.html");
    await page.waitForFunction(() => !!window.compilerTest);
    const result = await page.evaluate(async () => {
        const build = await window.compilerTest.compileLocal(
            '#include <bits/stdc++.h>\nint main(){std::cout<<"production bundle\\n";}',
            "c++20",
        );
        if (!build.ok) return build;
        return {
            usedPch: build.usedPch,
            ...(await window.compilerTest.run(build.wasmModule, "")),
        };
    });
    console.log(result);
    if (
        result.stdout !== "production bundle\n" ||
        result.status !== "exit" ||
        !result.usedPch
    )
        throw Error("Bundled smoke failed");
    await page
        .locator("#results")
        .evaluate(
            (node, result) =>
                (node.textContent = JSON.stringify(result, null, 2)),
            result,
        );
    await page.screenshot({
        path: path.join(root, "test/browser/results/bundled.png"),
        fullPage: true,
    });
} finally {
    await browser.close();
    await new Promise((r) => server.httpServer.close(r));
}
