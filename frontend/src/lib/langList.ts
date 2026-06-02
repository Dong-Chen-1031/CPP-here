import fs from "node:fs";
import path from "node:path";
import i18next from "i18next";
import enCommon from "../../../i18n/en/common.json";
import enEditor from "../../../i18n/en/editor.json";
import enLanding from "../../../i18n/en/landing.json";
import twCommon from "../../../i18n/zh-TW/common.json";
import twEditor from "../../../i18n/zh-TW/editor.json";
import twLanding from "../../../i18n/zh-TW/landing.json";

// Initialize i18next for SSR
if (!i18next.isInitialized) {
    i18next.init({
        fallbackLng: "en",
        supportedLngs: ["en", "zh-TW"],
        ns: ["common", "editor", "landing"],
        defaultNS: "common",
        resources: {
            en: {
                common: enCommon,
                editor: enEditor,
                landing: enLanding,
            },
            "zh-TW": {
                common: twCommon,
                editor: twEditor,
                landing: twLanding,
            },
        },
        interpolation: {
            escapeValue: false,
        },
    });
}

export function getLanguageCodes(): readonly string[] {
    const i18nDir = path.resolve("./public/i18n");

    if (!fs.existsSync(i18nDir)) return [];

    return fs
        .readdirSync(i18nDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);
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
    return getLanguageCodes()
        .map((lang) => ({ params: { lang: lang.toLowerCase() } }))
        .concat([{ params: { lang: undefined as any } }]);
}

export function getTranslation(
    lang: string | undefined,
    namespace: string = "common",
): Record<string, any> {
    const langCode =
        lang?.toUpperCase() === "ZH-TW" || lang === "zh-TW" ? "zh-TW" : "en";
    return i18next.getResourceBundle(langCode, namespace) || {};
}
