import type { APIRoute } from "astro";

export const prerender = false;

export const GET = (async ({ url, params, redirect }) => {
    const { shareId } = params;
    return redirect(
        `${url.origin}/editor?shareId=${encodeURIComponent(shareId ?? "")}`,
    );
}) satisfies APIRoute;
