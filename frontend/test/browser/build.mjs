import { build } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);
await build({
    configFile: false,
    root,
    worker: { format: "es" },
    build: {
        outDir: "test/browser/results/dist",
        rollupOptions: { input: path.join(root, "test/browser/index.html") },
    },
});
