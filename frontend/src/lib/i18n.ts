import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import Backend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";
import enCommon from "../../../i18n/en/common.json";
import enEditor from "../../../i18n/en/editor.json";

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: ["en", "zh-TW"],

    ns: ["common", "editor"],
    defaultNS: "common",

    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },

    resources: {
      en: {
        common: enCommon,
        editor: enEditor,
      },
    },

    partialBundledLanguages: true,

    backend: {
      loadPath: "../i18n/{{lng}}/{{ns}}.json",
    },

    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
