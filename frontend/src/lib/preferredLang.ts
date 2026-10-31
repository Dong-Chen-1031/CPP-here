import type { APIContext } from "astro";
import {
    DEFAULT_LOCALE,
    findLocale,
    localePath,
    matchLocale,
} from "@/lib/locales";
import { LANG_COOKIE } from "@/lib/langCookie";

/**
 * The site language (route segment) a request prefers: the one the visitor
 * picked by hand (the `lang` cookie), else the highest-weighted tag in its
 * Accept-Language header that the site has a locale for (matchLocale), else
 * English.
 */
export function preferredLang({ cookies, request }: APIContext): string {
    const picked = cookies.get(LANG_COOKIE)?.value;
    if (picked) return findLocale(picked).path;

    const ranked = (request.headers.get("Accept-Language") ?? "")
        .split(",")
        .map((part) => {
            const [tag, ...params] = part.trim().toLowerCase().split(";");
            const q = params
                .map((p) => p.trim())
                .find((p) => p.startsWith("q="));
            return { tag, weight: q ? Number(q.slice(2)) : 1 };
        })
        .filter(({ tag, weight }) => tag && weight > 0)
        .sort((a, b) => b.weight - a.weight);
    for (const { tag } of ranked) {
        const locale = matchLocale(tag);
        if (locale) return locale.path;
    }
    return DEFAULT_LOCALE.path;
}

/**
 * Sends a path without a language ("/", "/blog/<slug>") to its version in the
 * preferred language. Pages end in a slash, as built; files ("rss.xml") stay
 * as they are. Temporary and varied on what decides it, so neither browsers
 * nor caches pin one visitor's choice on everyone.
 */
export function redirectToPreferred(context: APIContext): Response {
    const { pathname, search } = context.url;
    const path =
        pathname.endsWith("/") || /\.[a-z]+$/.test(pathname)
            ? pathname
            : `${pathname}/`;
    return new Response(null, {
        status: 302,
        headers: {
            Location: localePath(preferredLang(context), path) + search,
            Vary: "Cookie, Accept-Language",
            "Cache-Control": "private, no-cache",
        },
    });
}
