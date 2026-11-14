// Fills in the manifest of public/sw.js once `astro build` is done:
//   - pages: the editor, fetched again by every new version of the worker
//   - precache: every script, stylesheet and wasm module the editor can load,
//     found by following references from its HTML (workers included, which
//     the bundles name by URL)
//   - assets: every file of the build's assets directory, whose cached copies
//     the next version keeps
//   - version: a hash of the above, so a deploy that changes any asset installs
//     a new worker and drops what is no longer served
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLACEHOLDER = '"__CPP_HERE_OFFLINE_MANIFEST__"';
const PAGES = ["editor"];
// Fonts and images are cached as they are used: every subset of every font
// would cost more than the editor itself.
const PRECACHED = /\.(?:js|mjs|css|wasm)$/;

async function listFiles(dir, prefix = "") {
    const files = [];
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const name = prefix + entry.name;
        if (entry.isDirectory())
            files.push(
                ...(await listFiles(path.join(dir, entry.name), name + "/")),
            );
        else files.push(name);
    }
    return files;
}

async function readPage(client, page) {
    for (const file of [`${page}/index.html`, `${page}.html`])
        try {
            return await fs.readFile(path.join(client, file), "utf8");
        } catch {}
    throw new Error(`Offline support: no built page for ${page}`);
}

export function serviceWorker() {
    let config;
    return {
        name: "cpp-here-service-worker",
        hooks: {
            "astro:config:done": (params) => {
                config = params.config;
            },
            "astro:build:done": async ({ logger }) => {
                const client = fileURLToPath(config.build.client);
                const workerPath = path.join(client, "sw.js");
                const source = await fs.readFile(workerPath, "utf8");
                if (!source.includes(PLACEHOLDER))
                    throw new Error(`No manifest placeholder in ${workerPath}`);

                const base = config.base.endsWith("/")
                    ? config.base
                    : config.base + "/";
                const assetsDir = config.build.assets;
                const files = await listFiles(path.join(client, assetsDir));
                const fileSet = new Set(files);
                // "/_astro/x.js", "_astro/x.js" (Vite's preload lists) or
                // "./x.js" next to the referencing file.
                const absolute = new RegExp(
                    `${assetsDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/([\\w.@~-]+(?:/[\\w.@~-]+)*)`,
                    "g",
                );
                const relative = /["'`]\.\/([\w.@~-]+)["'`]/g;

                const found = new Set();
                const queue = [];
                const visit = (text, dir) => {
                    const names = [
                        ...[...text.matchAll(absolute)].map((m) => m[1]),
                        ...[...text.matchAll(relative)].map((m) => dir + m[1]),
                    ];
                    for (const name of names)
                        if (
                            fileSet.has(name) &&
                            PRECACHED.test(name) &&
                            !found.has(name)
                        ) {
                            found.add(name);
                            queue.push(name);
                        }
                };
                for (const page of PAGES)
                    visit(await readPage(client, page), "");
                while (queue.length) {
                    const name = queue.shift();
                    if (name.endsWith(".wasm")) continue;
                    const dir = name.includes("/")
                        ? name.slice(0, name.lastIndexOf("/") + 1)
                        : "";
                    visit(
                        await fs.readFile(
                            path.join(client, assetsDir, name),
                            "utf8",
                        ),
                        dir,
                    );
                }

                const toUrl = (name) => `${base}${assetsDir}/${name}`;
                const manifest = {
                    assetsDir,
                    pages: PAGES.map((page) => base + page),
                    precache: [...found].sort().map(toUrl),
                    assets: files.sort().map(toUrl),
                };
                manifest.version = crypto
                    .createHash("sha256")
                    .update(JSON.stringify(manifest))
                    .digest("hex")
                    .slice(0, 12);
                await fs.writeFile(
                    workerPath,
                    source.replace(PLACEHOLDER, JSON.stringify(manifest)),
                );
                const bytes = (
                    await Promise.all(
                        [...found].map((name) =>
                            fs.stat(path.join(client, assetsDir, name)),
                        ),
                    )
                ).reduce((sum, stat) => sum + stat.size, 0);
                logger.info(
                    `Offline manifest ${manifest.version}: ${found.size} files (${Math.round(bytes / 1024)} KiB) precached for ${PAGES.join(", ")}.`,
                );
            },
        },
    };
}
