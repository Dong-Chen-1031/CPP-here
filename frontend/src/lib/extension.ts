export const CHROME_WEB_STORE_URL =
    "https://chromewebstore.google.com/detail/c++-here/fenaipecfjojcfjcbiiccdeicaihmlib";
export const FIREFOX_ADDONS_URL =
    "https://addons.mozilla.org/firefox/addon/cpp-here/";

export type ExtensionBrowser = "chrome" | "edge" | "firefox";

export function detectExtensionBrowser(
    nav: Navigator = navigator,
): ExtensionBrowser | undefined {
    const ua = nav.userAgent;
    const uaData = (
        nav as Navigator & {
            userAgentData?: { mobile: boolean };
        }
    ).userAgentData;
    if (uaData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return;
    // iPadOS reports itself as a Mac.
    if (/Macintosh/.test(ua) && nav.maxTouchPoints > 1) return;
    if (/Firefox\//.test(ua)) return "firefox";
    // Opera needs an add-on of its own to install from the Chrome Web Store.
    if (/OPR\/|Opera/.test(ua)) return;
    if (/Edg\//.test(ua)) return "edge";
    return /Chrome\//.test(ua) ? "chrome" : undefined;
}

export function extensionStoreUrl(
    browser: ExtensionBrowser | undefined,
): string | undefined {
    if (!browser) return;
    return (
        (browser === "firefox" ? FIREFOX_ADDONS_URL : CHROME_WEB_STORE_URL) ||
        undefined
    );
}
