/**
 * Opens links in rendered Markdown (blog posts) in a new tab, so readers keep
 * their place in the post. Jumps within the page ("#...") are left alone.
 */
export function rehypeNewTabLinks() {
    return (tree) => {
        const visit = (node) => {
            if (node.type === "element" && node.tagName === "a") {
                const href = String(node.properties?.href ?? "");
                if (href && !href.startsWith("#")) {
                    node.properties.target = "_blank";
                    node.properties.rel = ["noopener", "noreferrer"];
                }
            }
            node.children?.forEach(visit);
        };
        visit(tree);
    };
}
