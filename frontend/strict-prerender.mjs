/**
 * @astrojs/cloudflare prerenders each page by POSTing to a workerd server over
 * HTTP (see its prerenderer.js). When a component throws mid-render, the render
 * stream is cancelled *cleanly*, so Astro receives an ordinary 200 with a
 * truncated body and writes it to disk — the build "succeeds" with broken HTML.
 *
 * This wraps the adapter so the prerenderer's response is validated before it
 * reaches Astro. Throwing here is the only thing that stops the build
 * (core/build/generate.js catches and rethrows). workerd rendering is untouched.
 */
export function strictPrerender(adapter) {
    const original = adapter.hooks?.["astro:build:start"];
    if (!original) return adapter;

    return {
        ...adapter,
        hooks: {
            ...adapter.hooks,
            "astro:build:start": async (params) => {
                let inner;
                await original({
                    ...params,
                    setPrerenderer: (p) => (inner = p),
                });
                if (!inner) return;
                params.setPrerenderer({ ...inner, render: validated(inner) });
            },
        },
    };
}

function validated(inner) {
    return async function render(request, context) {
        const response = await inner.render(request, context);

        // Redirects carry no body of our own making.
        if (response.status >= 300 && response.status < 400) return response;

        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("text/html")) return response;

        const pathname = new URL(request.url).pathname;
        const route = context?.routeData?.route;
        // /404 and /500 are *supposed* to render with a non-ok status.
        const isErrorRoute = route === "/404" || route === "/500";

        if (!isErrorRoute && !response.ok) {
            throw new Error(
                `Prerendering ${pathname} returned HTTP ${response.status}.`,
            );
        }

        const buffer = await response.arrayBuffer();
        const html = new TextDecoder().decode(buffer);

        // Not anchored to the end: a page may legitimately emit markup after
        // </html> (anything placed after the layout component in the template).
        if (!/<\/html\s*>/i.test(html)) {
            throw new Error(
                `Prerendering ${pathname} produced truncated HTML ` +
                    `(${buffer.byteLength} bytes, no closing </html>). A component threw ` +
                    `while the response was already streaming — see the "Uncaught exception" ` +
                    `logged above.`,
            );
        }

        return new Response(buffer, {
            status: response.status,
            headers: response.headers,
        });
    };
}
