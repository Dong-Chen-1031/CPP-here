/**
 * Stands in for Astro's `astro:env/client` module, which only exists inside
 * Astro's own Vite config. The tests start Vite with `configFile: false`, so
 * any src module that reads a PUBLIC_ variable needs this plugin.
 */
export function testEnv() {
    const id = "\0test-env";
    return {
        name: "test-env",
        resolveId(source) {
            if (source === "astro:env/client") return id;
        },
        load(source) {
            if (source === id)
                return 'export const PUBLIC_LOCAL_COMPILER=true; export const PUBLIC_API_URL="";';
        },
    };
}
