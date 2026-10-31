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

/** The locale an Accept-Language / navigator.languages tag means, if any. */
export function matchLocale(tag: string): Locale | undefined {
    const t = tag.trim().toLowerCase();
    return LOCALES.find((l) =>
        [l.code, ...l.aliases].some((name) => {
            const n = name.toLowerCase();
            return t === n || t.startsWith(n + "-");
        }),
    );
}
