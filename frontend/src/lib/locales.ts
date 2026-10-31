// Which languages the site has, and how they map to URLs and to the tags
// browsers send. Safe for the client: it bundles the locale list only, no
// messages. The list comes from scripts/locales.mjs.
import { LOCALES, type Locale } from "virtual:locales";

export { LOCALES, type Locale };

/** English, the source language and the fallback for everything else. */
export const DEFAULT_LOCALE = LOCALES[0];

/** The locale a route segment ("zh-tw") or code ("zh-TW") names, else English. */
export function findLocale(lang?: string): Locale {
    const key = lang?.toLowerCase();
    return LOCALES.find((l) => l.path === key) ?? DEFAULT_LOCALE;
}

/** A site path in a language: localePath("zh-TW", "/blog/") is "/zh-tw/blog/". */
export function localePath(lang: string | undefined, path: string): string {
    return `/${findLocale(lang).path}${path}`;
}

/**
 * The locale an Accept-Language / navigator.languages tag means, if any. The
 * most specific name wins: "en-GB" means en-GB over en, were both there.
 */
export function matchLocale(tag: string): Locale | undefined {
    const t = tag.trim().toLowerCase();
    let best: { locale: Locale; length: number } | undefined;
    for (const locale of LOCALES)
        for (const name of [locale.code, ...locale.aliases]) {
            const n = name.toLowerCase();
            if (
                (t === n || t.startsWith(n + "-")) &&
                n.length > (best?.length ?? 0)
            )
                best = { locale, length: n.length };
        }
    return best?.locale;
}
