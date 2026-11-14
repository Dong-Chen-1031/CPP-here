/**
 * Registers public/sw.js, which keeps the editor and its scripts cached so
 * that it opens and runs without a network; with the in-browser compiler
 * downloaded, code then compiles offline too. Only production builds use it:
 * in `astro dev` it would serve modules the dev server has since changed.
 */
export function registerServiceWorker() {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    const base = import.meta.env.BASE_URL.endsWith("/")
        ? import.meta.env.BASE_URL
        : import.meta.env.BASE_URL + "/";
    const register = () =>
        navigator.serviceWorker
            .register(base + "sw.js", { scope: base })
            .catch((error) =>
                console.warn("Service worker registration failed:", error),
            );
    // Its install fetches the editor's files: let the page load them first.
    if (document.readyState === "complete") register();
    else addEventListener("load", register, { once: true });
}

/** True only when the browser knows it has no network. */
export const isOffline = () =>
    typeof navigator !== "undefined" && navigator.onLine === false;
