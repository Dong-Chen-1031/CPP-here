import enLanding from "../../../i18n/en/landing.json";
import { landing } from "virtual:locales";
import { findLocale, LOCALES } from "@/lib/locales";

/** The editor's language setting: each language's own name → its code. */
export function getLanguages(): Record<string, string> {
    return Object.fromEntries(LOCALES.map((l) => [l.name, l.code]));
}

export function getStaticLangPaths() {
    // No unprefixed copy: "/" and other paths without a language redirect to
    // the visitor's preferred one (see lib/preferredLang.ts).
    return LOCALES.map((l) => ({ params: { lang: l.path } }));
}

// Fill keys missing from a locale (new strings not yet translated on Crowdin)
// with the English source, so the page never renders `undefined`.
function withFallback<T>(base: T, override: unknown): T {
    if (
        typeof base !== "object" ||
        base === null ||
        Array.isArray(base) ||
        typeof override !== "object" ||
        override === null
    ) {
        return (override ?? base) as T;
    }
    const merged: Record<string, unknown> = { ...(base as object) };
    for (const [key, value] of Object.entries(override)) {
        merged[key] = withFallback(
            (base as Record<string, unknown>)[key],
            value,
        );
    }
    return merged as T;
}

export function getTranslation(lang?: string) {
    const { code } = findLocale(lang);
    return withFallback(enLanding, landing[code]);
}
