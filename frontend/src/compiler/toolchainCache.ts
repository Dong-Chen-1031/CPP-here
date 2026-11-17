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

// PCHs the compile worker makes of the headers a source starts with (see
// compile.worker.ts) are kept here too, so that a returning visitor's first
// build has one. They are named by what they were made from and belong to this
// toolchain only: deleteOldToolchains() drops them with it.
const INCLUDES_PCH_DIR = "includes/";
// About 13 MB each (libc++'s <iostream> alone is most of that).
const MAX_STORED_INCLUDES_PCHS = 3;

/** Where the PCH of `key` is stored; undefined without Cache Storage. */
async function includesPchUrl(base: string, key: string) {
    // Insecure origins have neither Cache Storage nor crypto.subtle.
    if (!toolchainCacheSupported() || !globalThis.crypto?.subtle) return;
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(key),
    );
    const name = Array.from(new Uint8Array(digest).subarray(0, 16), (byte) =>
        byte.toString(16).padStart(2, "0"),
    ).join("");
    return base + INCLUDES_PCH_DIR + name + ".pch";
}

export async function readIncludesPch(
    base: string,
    key: string,
): Promise<Uint8Array<ArrayBuffer> | null> {
    try {
        const url = await includesPchUrl(base, key);
        const hit = url && (await (await openToolchainCache())?.match(url));
        return hit ? new Uint8Array(await hit.arrayBuffer()) : null;
    } catch {
        return null;
    }
}

/** Stores a PCH, dropping the oldest ones over the limit. Never rejects. */
export async function storeIncludesPch(
    base: string,
    key: string,
    bytes: Uint8Array<ArrayBuffer>,
) {
    try {
        const url = await includesPchUrl(base, key);
        const cache = url && (await openToolchainCache());
        if (!cache) return;
        await cache.put(
            url,
            new Response(new Blob([bytes]), {
                headers: { "Content-Type": "application/octet-stream" },
            }),
        );
        // keys() lists entries in the order they were stored.
        const stored = (await cache.keys()).filter((request) =>
            request.url.startsWith(base + INCLUDES_PCH_DIR),
        );
        for (const request of stored.slice(0, -MAX_STORED_INCLUDES_PCHS))
            await cache.delete(request);
    } catch {
        // Out of quota, or storage was cleared: the PCH is made again.
    }
}

export async function deleteIncludesPch(base: string, key: string) {
    try {
        const url = await includesPchUrl(base, key);
        if (url) await (await openToolchainCache())?.delete(url);
    } catch {}
}
