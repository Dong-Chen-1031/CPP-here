// Lets the editor, and the in-browser compiler once it is downloaded, work
// without a network. Registered by src/lib/offline.ts.
//
// scripts/service-worker.mjs fills in MANIFEST after `astro build`: the editor
// page and every script and stylesheet it can load (precached on install), and
// every asset of the build (cached copies of those survive the next deploy).
// Unfilled, as in `astro dev`, nothing is precached.
const MANIFEST = "__CPP_HERE_OFFLINE_MANIFEST__";

const {
    version = "dev",
    assetsDir = "_astro",
    pages = [],
    precache = [],
    assets = [],
} = typeof MANIFEST === "object" ? MANIFEST : {};

const PREFIX = "cpp-here-offline:";
const CACHE = PREFIX + version;
const BASE = new URL("./", self.location.href).pathname;
const ASSETS = BASE + assetsDir + "/";
const TOOLCHAIN = BASE + "toolchain/";
const known = new Set(assets);
// How long a navigation waits for the network before a cached page is shown.
const NETWORK_TIMEOUT_MS = 4000;
// Files from public/ (icons, fonts) are cached as they are used.
const PUBLIC_FILES = new Set(["font", "image", "manifest", "style", "script"]);

/** One cache entry per page: no query, no trailing slash. */
function pageKey(url) {
    let path = new URL(url, self.location.origin).pathname;
    if (path.length > BASE.length && path.endsWith("/"))
        path = path.slice(0, -1);
    return self.location.origin + path;
}

// A redirected response cannot answer a navigation; a copy of it can.
function unredirected(response) {
    if (!response.redirected) return response;
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
}

const cacheable = (response) => response.ok && response.type === "basic";

self.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE);
            // Keep what an earlier version cached that this build still has,
            // such as fonts the editor loaded once.
            for (const name of await caches.keys()) {
                if (!name.startsWith(PREFIX) || name === CACHE) continue;
                const old = await caches.open(name);
                for (const request of await old.keys()) {
                    if (!known.has(new URL(request.url).pathname)) continue;
                    if (await cache.match(request)) continue;
                    const response = await old.match(request);
                    if (response) await cache.put(request, response);
                }
            }
            // Pages are fetched again, assets only when missing. One failure
            // fails the install: the previous version keeps serving.
            await Promise.all([
                ...pages.map(async (path) => {
                    const url = new URL(path, self.location.origin).href;
                    const response = await fetch(url, { cache: "no-cache" });
                    if (!cacheable(response))
                        throw new Error(`${response.status}: ${url}`);
                    await cache.put(pageKey(url), unredirected(response));
                }),
                ...precache.map(async (path) => {
                    const url = new URL(path, self.location.origin).href;
                    if (await cache.match(url)) return;
                    const response = await fetch(url);
                    if (!cacheable(response))
                        throw new Error(`${response.status}: ${url}`);
                    await cache.put(url, response);
                }),
            ]);
            await self.skipWaiting();
        })(),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            for (const name of await caches.keys())
                if (name.startsWith(PREFIX) && name !== CACHE)
                    await caches.delete(name);
            await self.clients.claim();
        })(),
    );
});

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET" || request.headers.has("range")) return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    const path = url.pathname;
    if (!path.startsWith(BASE)) return;
    const rest = path.slice(BASE.length);
    if (rest.startsWith("api/") || rest.startsWith("cdn-cgi/")) return;

    if (request.mode === "navigate")
        event.respondWith(fromPage(event, request));
    // Named by content hash: a cached copy is never out of date.
    else if (path.startsWith(ASSETS)) event.respondWith(fromAssets(request));
    // Named by toolchain id, and kept by the page in its own cache
    // (src/compiler/toolchainCache.ts).
    else if (path.startsWith(TOOLCHAIN))
        event.respondWith(
            caches
                .match(request, { ignoreVary: true })
                .then((hit) => hit ?? fetch(request)),
        );
    else if (PUBLIC_FILES.has(request.destination))
        event.respondWith(fromNetworkFirst(request));
});

/** The network, or the cached page when it fails or takes too long. */
async function fromPage(event, request) {
    const cache = await caches.open(CACHE);
    const key = pageKey(request.url);
    const network = fetch(request).then(async (response) => {
        if (
            cacheable(response) &&
            (response.headers.get("Content-Type") ?? "").includes("text/html")
        )
            await cache.put(key, response.clone());
        return response;
    });
    // Keeps updating the cached page after a timeout.
    event.waitUntil(network.catch(() => {}));
    let cached = await cache.match(key, { ignoreVary: true });
    // "/" redirects to a language on the server; offline, open the editor.
    if (!cached && key === self.location.origin + BASE)
        cached = await cache.match(pageKey(BASE + "editor"));
    if (!cached) return network;
    let timer;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS);
    });
    try {
        return await Promise.race([network.catch(() => cached), timeout]);
    } finally {
        clearTimeout(timer);
    }
}

async function fromAssets(request) {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request, { ignoreVary: true });
    if (hit) return hit;
    const response = await fetch(request);
    if (cacheable(response))
        await cache.put(request.url, response.clone()).catch(() => {});
    return response;
}

async function fromNetworkFirst(request) {
    const cache = await caches.open(CACHE);
    try {
        const response = await fetch(request);
        if (cacheable(response))
            await cache.put(request.url, response.clone()).catch(() => {});
        return response;
    } catch (error) {
        const hit = await cache.match(request.url, { ignoreVary: true });
        if (hit) return hit;
        throw error;
    }
}
