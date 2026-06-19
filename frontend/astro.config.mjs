// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
    adapter: cloudflare(),
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
});
