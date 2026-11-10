import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { common, editor } from "virtual:locales";
import { LOCALES, matchLocale } from "@/lib/locales";
import { LANG_COOKIE } from "@/lib/langCookie";

// Picks the language the same way the redirect from "/" does
// (lib/preferredLang.ts): the one picked by hand, then the browser's.
const detector = new LanguageDetector();
detector.addDetector({
    name: "siteNavigator",
    lookup: () =>
        typeof navigator === "undefined"
            ? undefined
            : navigator.languages.map(matchLocale).find(Boolean)?.code,
});

i18n.use(detector)
    .use(initReactI18next)
    .init({
        fallbackLng: "en",
        supportedLngs: LOCALES.map((l) => l.code),

        ns: ["common", "editor"],
        defaultNS: "common",

        detection: {
            // localStorage only for settings saved before the cookie existed.
            order: ["cookie", "localStorage", "siteNavigator"],
            lookupCookie: LANG_COOKIE,
            // The cookie is written only when the language is picked by hand
            // (lib/langCookie.ts), so a detected one never overrides
            // Accept-Language on the server.
            caches: [],
        },

        // Every listed locale is bundled: none of them is fetched later.
        resources: Object.fromEntries(
            LOCALES.map((l) => [
                l.code,
                { common: common[l.code], editor: editor[l.code] },
            ]),
        ),

        interpolation: {
            escapeValue: false,
        },
    });

// Keep <html lang> in sync with the detected language: the editor page is
// served as one static document, so its language is only known client-side.
if (typeof document !== "undefined") {
    const syncHtmlLang = () => {
        document.documentElement.lang = i18n.resolvedLanguage ?? "en";
    };
    i18n.on("languageChanged", syncHtmlLang);
    syncHtmlLang();
}

export default i18n;
