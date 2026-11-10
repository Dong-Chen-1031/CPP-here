import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// Posts live at src/blog/<lang>/<slug>.mdx, so an entry's id is "<lang>/<slug>".
// Don't set `slug` in frontmatter: the glob loader would use it as the id and
// drop the language.
const blog = defineCollection({
    loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/blog" }),
    schema: z.object({
        title: z.string(),
        description: z.string(),
        pubDate: z.coerce.date(),
        /** Set when a post is revised; feeds dateModified and the sitemap's lastmod. */
        updatedDate: z.coerce.date().optional(),
        author: z.string().default("Dong-Chen-1031"),
        /** Share image: a path under public/ or an absolute URL. */
        photo: z.string().optional(),
    }),
});

export const collections = { blog };
