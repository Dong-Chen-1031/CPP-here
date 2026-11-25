import path from "node:path";
import { fileURLToPath } from "node:url";

const src = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../src",
);

/**
 * Stands in for what Astro's own Vite config gives src modules: the
 * `astro:env/client` module and the `@/` alias from tsconfig.json. The tests
 * start Vite with `configFile: false`, so any src module that reads a PUBLIC_
 * variable or imports through `@/` needs this plugin.
 */
export function testEnv() {
    const id = "\0test-env";
    return {
        name: "test-env",
        config() {
            return { resolve: { alias: { "@": src } } };
        },
        resolveId(source) {
            if (source === "astro:env/client") return id;
        },
        load(source) {
            if (source === id)
                return 'export const PUBLIC_LOCAL_COMPILER=true; export const PUBLIC_API_URL="";';
        },
    };
}
