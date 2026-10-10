import type { BuildResult } from "./build";

const LIMIT = 8;

/**
 * Remembers a compiler's last successful builds for this page load, by
 * standard and source. Failed builds stay out: compile errors are cheap to
 * repeat and an outage should be retried.
 */
export function createBuildCache() {
    const cache = new Map<string, BuildResult>();
    // No crypto.subtle or crypto.randomUUID here: insecure origins (the dev
    // server opened by LAN IP) lack both.
    const key = (source: string, std: string) => JSON.stringify([std, source]);
    return {
        get: (source: string, std: string) => cache.get(key(source, std)),
        set(source: string, std: string, result: BuildResult) {
            if (!result.ok) return;
            cache.set(key(source, std), result);
            if (cache.size > LIMIT) cache.delete(cache.keys().next().value!);
        },
    };
}
