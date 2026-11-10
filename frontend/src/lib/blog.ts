import { getCollection, type CollectionEntry } from "astro:content";
import {
    DEFAULT_LOCALE,
    LOCALES,
    findLocale,
    localePath,
    type Locale,
} from "@/lib/locales";

export type Post = CollectionEntry<"blog">;

/**
 * Every post written in a language the site has. A post in any other
 * language (src/blog/<path>/) waits until that locale makes it into the
 * site (scripts/locales.mjs).
 */
export function getAllPosts(): Promise<Post[]> {
    return getCollection("blog", ({ id }) =>
        LOCALES.some((l) => l.path === id.split("/")[0]),
    );
}

export function splitId(post: Post): { locale: Locale; slug: string } {
    const [folder, ...rest] = post.id.split("/");
    return { locale: findLocale(folder), slug: rest.join("/") };
}

export function blogPath(lang: string | undefined, slug?: string): string {
    return localePath(lang, slug ? `/blog/${slug}/` : "/blog/");
}

/** A post's URL, in the language it is written in. */
export function postPath(post: Post): string {
    const { locale, slug } = splitId(post);
    return blogPath(locale.path, slug);
}

export function rssPath(lang: string | undefined): string {
    return `${blogPath(lang)}rss.xml`;
}

/**
 * Posts to list for a language, newest first. A post with no translation in
 * that language falls back to its English version (linked at its English URL).
 */
export async function getPosts(lang: string | undefined): Promise<Post[]> {
    const wanted = findLocale(lang);
    const bySlug = new Map<string, Post>();
    for (const post of await getAllPosts()) {
        const { locale, slug } = splitId(post);
        if (
            locale === wanted ||
            (locale === DEFAULT_LOCALE && !bySlug.has(slug))
        ) {
            bySlug.set(slug, post);
        }
    }
    return [...bySlug.values()].sort(
        (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
    );
}

export function formatDate(date: Date, lang: string | undefined): string {
    return new Intl.DateTimeFormat(findLocale(lang).code, {
        dateStyle: "long",
        timeZone: "UTC",
    }).format(date);
}
