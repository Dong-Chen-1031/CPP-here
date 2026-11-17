import { TOOLCHAIN_ASSETS, TOOLCHAIN_ID } from "./config";

// The toolchain is kept in Cache Storage so it survives reloads and whether it
// is downloaded can be checked without the network. Both the page and the
// compile worker use it. Insecure origins have no Cache Storage: files then
// come from the network (and the HTTP cache) every time.
const CACHE_PREFIX = "cpp-here-toolchain:";
const CACHE_NAME = CACHE_PREFIX + TOOLCHAIN_ID;

/** Every file a build needs, except the per-standard PCHs (fetched on use). */
export const TOOLCHAIN_FILES = [
    // Imported by the compile worker, which the service worker (public/sw.js)
    // answers from this cache, so that it loads offline too.
    "bundle.js",
    ...TOOLCHAIN_ASSETS.map((name) => name + ".gz.bin"),
    "stdcxx.h",
    "manifest.json",
    "memory-helpers.o",
];

export const toolchainCacheSupported = () => typeof caches !== "undefined";

export function openToolchainCache(): Promise<Cache | undefined> {
    if (!toolchainCacheSupported()) return Promise.resolve(undefined);
    return caches.open(CACHE_NAME).catch(() => undefined);
}

export async function isToolchainCached(base: string): Promise<boolean> {
    const cache = await openToolchainCache();
    if (!cache) return false;
    const hits = await Promise.all(
        TOOLCHAIN_FILES.map((name) => cache.match(base + name)),
    );
    return hits.every(Boolean);
}

export async function isToolchainFileCached(url: string): Promise<boolean> {
    const cache = await openToolchainCache();
    return !!(await cache?.match(url));
}

/** Drops toolchains of other versions. */
export async function deleteOldToolchains() {
    if (!toolchainCacheSupported()) return;
    for (const name of await caches.keys())
        if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            await caches.delete(name);
}

/** Fetches a toolchain file from the cache, storing it there on a miss. */
export async function fetchToolchainFile(url: string): Promise<Response> {
    const cache = await openToolchainCache();
    const hit = await cache?.match(url);
    if (hit) return hit;
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(
            `Toolchain download failed (${response.status}): ${url}`,
        );
    if (!cache) return response;
    // Stored from a Blob: putting a clone of the streamed response took Chrome
    // seconds to commit after the body was read, and closing the page before
    // that dropped the file (a PCH was then downloaded again on every visit).
    const init = {
        headers: {
            "Content-Type":
                response.headers.get("Content-Type") ??
                "application/octet-stream",
        },
    };
    const body = await response.blob();
    cache.put(url, new Response(body, init)).catch(() => {});
    return new Response(body, init);
}
