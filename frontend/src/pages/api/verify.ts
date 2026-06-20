import type { APIContext } from "astro";

export const prerender = false;

export function GET({ params, request }: APIContext) {
    return new Response(
        JSON.stringify({
            params,
            request: {
                method: request.method,
                headers: Object.fromEntries(request.headers.entries()),
                url: request.url,
            },
        }),
    );
}
