import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const blog = fileURLToPath(new URL("../src/blog/", import.meta.url));

/**
 * Last-modified date of each blog post, keyed by its URL path ("/en/blog/<slug>/",
 * "/zh-tw/blog/<slug>/"), for the sitemap's lastmod. The config can't use
 * astro:content, so this parses updatedDate / pubDate from the frontmatter
 * itself.
 */
export function blogLastmod() {
    const dates = new Map();
    for (const file of fs.readdirSync(blog, { recursive: true })) {
        if (!/\.mdx?$/.test(file)) continue;
        const text = fs.readFileSync(path.join(blog, file), "utf8");
        const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
        const data = frontmatter ? parse(frontmatter) : undefined;
        const date = data?.updatedDate ?? data?.pubDate;
        if (!date) continue;

        const [lang, ...rest] = file.replace(/\.mdx?$/, "").split(path.sep);
        dates.set(
            `/${lang}/blog/${rest.join("/")}/`,
            new Date(date).toISOString(),
        );
    }
    return dates;
}
