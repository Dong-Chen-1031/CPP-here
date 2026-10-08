import { createServer } from "vite";
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);
const server = await createServer({
    configFile: false,
    optimizeDeps: {
        entries: ["test/browser/integration.html"],
        include: ["@uiw/react-codemirror", "@bjorn3/browser_wasi_shim"],
    },
    root,
    resolve: { alias: { "@": path.join(root, "src") } },
    plugins: [
        {
            name: "test-env",
            resolveId(id) {
                if (id === "astro:env/client") return "\0test-env";
            },
            load(id) {
                if (id === "\0test-env")
                    return 'export const PUBLIC_LOCAL_COMPILER=true; export const PUBLIC_API_URL="";';
            },
        },
    ],
    server: { host: "127.0.0.1", port: 5180 },
});
await server.listen();
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || undefined,
    args: ["--no-sandbox"],
});
try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error(e.message));
    let requests = 0;
    page.on("request", (r) => {
        if (new URL(r.url()).pathname === "/api/build") requests++;
    });
    await page.goto("http://127.0.0.1:5180/test/browser/integration.html");
    await page.waitForFunction(() => !!window.integration);
    const result = await page.evaluate(() => window.integration());
    console.log(result, "backend build requests", requests);
    if (
        result.single !== "42\n" ||
        result.auto !== "10\n" ||
        result.a !== "4\n" ||
        result.b !== "6\n" ||
        result.all.some((x) => x.status !== "ac") ||
        requests
    )
        throw Error("Integration failed");
    await page
        .locator("#results")
        .evaluate(
            (el, result) => (el.textContent = JSON.stringify(result, null, 2)),
            result,
        );
    await page.screenshot({
        path: path.join(root, "test/browser/results/integration.png"),
        fullPage: true,
    });
} finally {
    await browser.close();
    await server.close();
}
