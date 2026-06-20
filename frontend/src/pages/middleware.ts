import type { APIContext } from "astro";

export function onRequest(context: APIContext, next: () => Promise<Response>) {
    return next();
}
