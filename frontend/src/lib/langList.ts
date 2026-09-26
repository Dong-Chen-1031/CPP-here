import enLanding from "../../../i18n/en/landing.json";
import twLanding from "../../../i18n/zh-TW/landing.json";

export function getLanguageCodes(): readonly string[] {
    const files = import.meta.glob("/public/i18n/*/common.json");
    const codes = Object.keys(files).map((file) => file.split("/")[3]);
    if (codes.length === 0) {
        throw new Error("No language codes found");
    }
    return codes;
}

export function getLanguages(): Record<string, string> {
    return Object.fromEntries(
        getLanguageCodes().map((code) => [
            new Intl.DisplayNames([code], { type: "language" }).of(code),
            code,
        ]),
    );
}

export function getStaticLangPaths() {
    // return getLanguageCodes()
    //     .map((lang) => ({ params: { lang: lang.toLowerCase() } }))
    //     .concat([{ params: { lang: undefined as any } }]);
    return [
        { params: { lang: undefined } },
        { params: { lang: "en" } },
        { params: { lang: "zh-tw" } },
    ];
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
    return lang === "zh-tw" ? withFallback(enLanding, twLanding) : enLanding;
}
