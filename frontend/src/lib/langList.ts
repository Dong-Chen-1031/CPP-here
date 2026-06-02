import fs from "node:fs";
import path from "node:path";

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
