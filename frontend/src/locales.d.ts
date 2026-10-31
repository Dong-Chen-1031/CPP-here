// Generated at build time by scripts/locales.mjs.
declare module "virtual:locales" {
    export interface Locale {
        /** As in i18n/ and Accept-Language: "en", "zh-TW". */
        code: string;
        /** The route segment: "en", "zh-tw". */
        path: string;
        /** In its own language: "中文（台灣）". */
        name: string;
        /** Other Accept-Language tags meaning this locale, e.g. "zh-HK". */
        aliases: string[];
    }
    /** English first, then every sufficiently translated locale. */
    export const LOCALES: Locale[];

    type Messages = Record<string, unknown>;
    /** Each namespace's messages by locale code, for the locales in LOCALES. */
    export const common: Record<string, Messages>;
    export const editor: Record<string, Messages>;
    export const landing: Record<string, Messages>;
}
