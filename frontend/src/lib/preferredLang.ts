import type { APIContext } from "astro";
import {
    DEFAULT_LOCALE,
    LOCALES,
    localePath,
    matchLocale,
    type Locale,
} from "@/lib/locales";
import { LANG_COOKIE } from "@/lib/langCookie";

/**
 * The site language (route segment) a request prefers, out of `available`:
 * the one the visitor picked by hand (the `lang` cookie), else the
 * highest-weighted tag in its Accept-Language header that the site has a
 * locale for (matchLocale), else English, else the first available.
 */
export function preferredLang(
    { cookies, request }: APIContext,
    available: readonly Locale[] = LOCALES,
): string {
    // A picked language the site has since dropped counts as no pick.
    const picked = cookies.get(LANG_COOKIE)?.value.toLowerCase();
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
    const wanted = [
        LOCALES.find((l) => l.path === picked),
        ...ranked.map(({ tag }) => matchLocale(tag)),
        DEFAULT_LOCALE,
    ];
    return (wanted.find((l) => l && available.includes(l)) ?? available[0])
        .path;
}

/**
 * Sends a path without a language ("/", "/blog/<slug>") to its version in the
 * preferred language, out of those it exists in (`available`). Pages end in a
 * slash, as built; files ("rss.xml") stay as they are. Temporary and varied on
 * what decides it, so neither browsers nor caches pin one visitor's choice on
 * everyone.
 */
export function redirectToPreferred(
    context: APIContext,
    available?: readonly Locale[],
): Response {
    const { pathname, search } = context.url;
    const path =
        pathname.endsWith("/") || /\.[a-z]+$/.test(pathname)
            ? pathname
            : `${pathname}/`;
    return new Response(null, {
        status: 302,
        headers: {
            Location:
                localePath(preferredLang(context, available), path) + search,
            Vary: "Cookie, Accept-Language",
            "Cache-Control": "private, no-cache",
        },
    });
}
