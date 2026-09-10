import type { APIRoute } from "astro";

export const prerender = false;

export const GET = (async ({ url, params, redirect }) => {
    const { shareId } = params;
    // console.log(url.origin);
    return redirect(`${url.origin}/editor?shareId=${shareId}`);
}) satisfies APIRoute;
