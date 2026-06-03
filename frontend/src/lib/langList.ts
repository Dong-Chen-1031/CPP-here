import fs from "node:fs";
import path from "node:path";
import i18next from "i18next";
import enCommon from "../../../i18n/en/common.json";
import enEditor from "../../../i18n/en/editor.json";
import enLanding from "../../../i18n/en/landing.json";
import twCommon from "../../../i18n/zh-TW/common.json";
import twEditor from "../../../i18n/zh-TW/editor.json";
import twLanding from "../../../i18n/zh-TW/landing.json";

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
    // return getLanguageCodes()
    //     .map((lang) => ({ params: { lang: lang.toLowerCase() } }))
    //     .concat([{ params: { lang: undefined as any } }]);
    return [
        { params: { lang: undefined } },
        { params: { lang: "en" } },
        { params: { lang: "zh-tw" } },
    ];
}

export function getTranslation(lang: string) {
    return lang === "zh-tw" ? twLanding : enLanding;
}
