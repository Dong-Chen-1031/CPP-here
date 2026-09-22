// @ts-check
import { defineConfig, envField } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";
import { strictPrerender } from "./strict-prerender.mjs";
import { DEV_JWT_SECRET } from "./env.defaults.mjs";

const isProd = process.env.NODE_ENV === "production";

// import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
    output: "static",
    adapter: strictPrerender(
        cloudflare({
            // prerenderEnvironment: "node",
            imageService: "passthrough",
        }),
    ),
    site: "https://cpp.doong.me",
    integrations: [
        react(),
        sitemap({
            filter: (page) =>
                !page.includes("/editor") && !page.includes("/test"),
        }),
        // starlight({
        //     title: "C++ Here Docs",
        //     Logo: `./public/favicon.svg`,
        //     disable404Route: true,
        // }),
    ],
    vite: {
        plugins: [tailwindcss()],
        optimizeDeps: {
            include: ["react-dom/client"],
            exclude: ["@wasm-fmt/clang-format"],
        },
        ssr: {
            noExternal: ["@wasm-fmt/clang-format"],
        },
    },
    build: {
        inlineStylesheets: "auto",
    },
    env: {
        schema: {
            PUBLIC_TURNSTILE_SITE_KEY: envField.string({
                context: "client",
                access: "public",
                optional: true,
                default: "1x00000000000000000000BB",
            }),
            PUBLIC_API_URL: envField.string({
                context: "client",
                access: "public",
                optional: true,
                url: true,
                default: "",
            }),
            PUBLIC_SKIP_API_FETCH: envField.boolean({
                context: "client",
                access: "public",
                optional: true,
                default: true,
            }),
            // access "public" on the server context means "inlined at build from
            // process.env", not "visible to the browser" - it stays out of the client
            // bundle. A secret would be read from the Worker env instead, which the
            // prerender step cannot see, so the default would always win.
            PRIVATE_BUILD_TIME_STATUS_URL: envField.string({
                context: "server",
                access: "public",
                optional: true,
                url: true,
                // Full endpoint, not a base URL: the landing page fetches it as-is.
                default: "http://127.0.0.1:8000/api/status",
            }),
            PUBLIC_GITHUB_LINK: envField.string({
                context: "client",
                access: "public",
                optional: true,
                url: true,
                default: "https://github.com/Dong-Chen-1031/CPP-here",
            }),
            PUBLIC_POSTHOG_PROJECT_TOKEN: envField.string({
                context: "client",
                access: "public",
                optional: true,
                default: "",
            }),
            PUBLIC_POSTHOG_HOST: envField.string({
                context: "client",
                access: "public",
                optional: true,
                url: true,
                default: "https://us.i.posthog.com",
            }),
            PUBLIC_STATUS_PAGE: envField.string({
                context: "client",
                access: "public",
                optional: true,
                url: true,
                default: "https://status.doong.me/status/cpp-here",
            }),
            PUBLIC_SHARE: envField.boolean({
                context: "client",
                access: "public",
                optional: true,
                default: false,
            }),
            PUBLIC_S3_BUCKET_URL: envField.string({
                context: "client",
                access: "public",
                optional: true,
                url: true,
                default: "",
            }),
            PUBLIC_S3_BUCKET_NAME: envField.string({
                context: "client",
                access: "public",
                optional: true,
                // Shared code is read from
                // `${PUBLIC_S3_BUCKET_URL}/${PUBLIC_S3_BUCKET_NAME}/share/<id>`,
                // skipping the bucket segment when this is empty. Leave it empty
                // for an R2 custom domain; set it to the backend's S3_BUCKET_NAME
                // for a path-style S3 URL.
                default: "",
            }),
            // In production there is no default, so `astro build` fails fast when
            // the secret is missing instead of shipping a Worker that signs
            // tokens anyone could forge. NODE_ENV is set by the build command.
            PRIVATE_JWT_SECRET: envField.string({
                context: "server",
                access: "secret",
                optional: true,
                ...(isProd ? {} : { default: DEV_JWT_SECRET }),
            }),
            PRIVATE_JWT_EXPIRATION_SECONDS: envField.number({
                context: "server",
                access: "secret",
                optional: true,
                default: 60 * 60, // 1 hour
            }),
            // Also read server-side by src/middleware.ts, which skips the token
            // check entirely when it is true. The Python backend then needs
            // BYPASS_CAPTCHA="true" as well, since no token is sent.
            PUBLIC_BYPASS_CAPTCHA: envField.boolean({
                context: "client",
                access: "public",
                optional: false,
                default: false,
            }),
            PRIVATE_TURNSTILE_SECRET_KEY: envField.string({
                context: "server",
                access: "secret",
                optional: true,
                default: "1x0000000000000000000000000000000AA",
            }),
            PRIVATE_TURNSTILE_CHECK_IP: envField.boolean({
                context: "server",
                access: "secret",
                optional: true,
                default: true,
            }),
            PRIVATE_TEST_JWT: envField.string({
                context: "server",
                access: "secret",
                optional: true,
                default: "",
            }),
            // TODO: Remove this after the complete migration to the new central control architecture.
            PRIVATE_BUILDER_NODE_ENDPOINT: envField.string({
                context: "server",
                access: "secret",
                optional: true,
                default: "http://127.0.0.1:8000",
            }),
            // Sent as the bearer token to the builder node; must equal its
            // CAPTCHA_TEST_TOKEN, or the node needs BYPASS_CAPTCHA="true".
            PRIVATE_BUILDER_NODE_KEY: envField.string({
                context: "server",
                access: "secret",
                optional: true,
                default: "",
            }),
        },
    },
});
