import enLanding from "../../../i18n/en/landing.json";
import twLanding from "../../../i18n/zh-TW/landing.json";

export function getLanguageCodes(): readonly string[] {
    const files = import.meta.glob("/public/i18n/*/common.json");
    return Object.keys(files).map((file) => file.split("/")[3]);
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

export function getTranslation(lang?: string) {
    return lang === "zh-tw" ? twLanding : enLanding;
}
