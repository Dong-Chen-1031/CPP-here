import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getStaticLangPaths, getTranslation } from "@/lib/langList";
import { findLocale } from "@/lib/locales";
import { blogPath, getPosts, postPath } from "@/lib/blog";

export { getStaticLangPaths as getStaticPaths };

export async function GET({ params, site }: APIContext) {
    const { lang } = params;
    const t = getTranslation(lang);
    const posts = await getPosts(lang);
    return rss({
        title: t.blog.title,
        description: t.blog.description,
        // The channel's <link>; item links are absolute paths, so they still
        // resolve against the origin.
        site: new URL(blogPath(lang), site),
        customData: `<language>${findLocale(lang).code}</language>`,
        items: posts.map((post) => ({
            title: post.data.title,
            description: post.data.description,
            pubDate: post.data.pubDate,
            link: postPath(post),
        })),
    });
}
