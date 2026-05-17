// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

// import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
    integrations: [
        react(),
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
