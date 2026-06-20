// @ts-check
import { defineConfig, envField } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
    output: "static",
    adapter: cloudflare({
        imageService: "compile",
        prerenderEnvironment: "node",
    }),
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
        // @ts-ignore I don't know why tailwindcss types are not working. But it works fine.
        plugins: [tailwindcss()],
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
                default: "http://127.0.0.1:8000",
            }),
            PUBLIC_SKIP_API_FETCH: envField.boolean({
                context: "client",
                access: "public",
                optional: true,
                default: true,
            }),
            PUBLIC_BUILD_TIME_API_URL: envField.string({
                context: "client",
                access: "public",
                optional: true,
                url: true,
                default:
                    import.meta.env.PUBLIC_BUILD_TIME_API_URL ||
                    "http://127.0.0.1:8000",
            }),
            PUBLIC_GITHUB_LINK: envField.string({
                context: "client",
                access: "public",
                optional: true,
                url: true,
                default: "https://github.com/Dong-Chen-1031/CPP-here",
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
        },
    },
});
