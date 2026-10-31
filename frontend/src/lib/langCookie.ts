import { findLocale } from "@/lib/locales";

/**
 * The language a visitor picked by hand (the editor's language setting, the
 * header's language menu). Paths without a language redirect to it ahead of
 * Accept-Language, see lib/preferredLang.ts.
 */
export const LANG_COOKIE = "lang";

export function rememberLang(lang: string) {
    document.cookie = `${LANG_COOKIE}=${findLocale(lang).path}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}
