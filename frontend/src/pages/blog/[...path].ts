import type { APIRoute } from "astro";
import { getAllPosts, splitId } from "@/lib/blog";
import { redirectToPreferred } from "@/lib/preferredLang";

export const prerender = false;

// "/blog/..." (no language) → "/en/blog/...", "/zh-tw/blog/...", …; a post
// only to a language it is written in.
export const GET: APIRoute = async (context) => {
    const slug = context.params.path?.split("/")[0];
    const posts = (await getAllPosts()).filter(
        (post) => splitId(post).slug === slug,
    );
    return redirectToPreferred(
        context,
        posts.length ? posts.map((post) => splitId(post).locale) : undefined,
    );
};
