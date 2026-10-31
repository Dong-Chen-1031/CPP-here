// Code blocks in Markdown and MDX are rendered by Expressive Code, which adds
// file-name frames, line markers and a copy button. Its button texts come from
// i18n/<locale>/landing.json (blog.codeBlock), picked by the folder a post is in.
import path from "node:path";
import { fileURLToPath } from "node:url";
import expressiveCode, {
    createInlineSvgUrl,
    pluginFramesTexts,
} from "astro-expressive-code";
import { readLocales } from "./locales.mjs";

const blog = fileURLToPath(new URL("../src/blog/", import.meta.url));

// The editor's copy-output button (components/panel/OutputPanel.tsx) shows
// Lucide's clipboard-copy, popping into circle-check-big once copied.
const lucide = (paths) =>
    createInlineSvgUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`,
    );
const clipboardCopy = lucide(
    '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M16 4h2a2 2 0 0 1 2 2v4"/><path d="M21 14H11"/><path d="m15 10-4 4 4 4"/>',
);
const circleCheckBig = lucide(
    '<path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/>',
);

/** IconMotion's spring (stiffness 400, damping 25) as a CSS easing. */
function spring(stiffness = 400, damping = 25, steps = 30) {
    const w = Math.sqrt(stiffness);
    const zeta = damping / (2 * w);
    const wd = w * Math.sqrt(1 - zeta ** 2);
    // Long enough to settle within 0.25% of the end.
    const duration = 6 / (zeta * w);
    const points = Array.from({ length: steps + 1 }, (_, i) => {
        const t = (i / steps) * duration;
        const decay = Math.exp(-zeta * w * t);
        const x =
            1 -
            decay * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
        return +x.toFixed(3);
    });
    return `${Math.round(duration * 1000)}ms linear(${points.join(", ")})`;
}

// shadcn's outline Button, as the editor's copy button. The copied message
// stays for screen readers only: the check says it on screen.
const copyButtonStyles = `
.copy button {
    width: 2rem;
    height: 2rem;
    border: 1px solid var(--input);
    border-radius: calc(var(--radius) - 2px);
    background: color-mix(in oklab, var(--input) 30%, var(--code-background));
    transition-property: opacity, background-color, border-color, box-shadow;

    div, &::before {
        display: none;
    }
    &::after {
        margin: calc((2rem - 2px - 1rem) / 2);
        background-color: var(--foreground);
        -webkit-mask-size: 100%;
        mask-size: 100%;
        animation: cpp-copy-icon-in ${spring()};
    }
    &:hover {
        background: color-mix(in oklab, var(--input) 50%, var(--code-background));
    }
    &:focus-visible {
        outline: none;
        border-color: var(--ring);
        box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent);
    }
}
.copy:has(.feedback.show) button {
    opacity: 1;

    &::after {
        -webkit-mask-image: ${circleCheckBig};
        mask-image: ${circleCheckBig};
        /* Another name, so the animation runs again. */
        animation-name: cpp-copy-icon-in-again;
    }
}
.copy .feedback {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
    .copy button::after {
        animation: none;
    }
}
@keyframes cpp-copy-icon-in {
    from { opacity: 0; scale: 0.5; }
}
@keyframes cpp-copy-icon-in-again {
    from { opacity: 0; scale: 0.5; }
}`;

export function codeBlocks() {
    const { list, messages } = readLocales();
    const texts = (code) => {
        const { copy, copied, terminal } =
            messages.landing[code]?.blog?.codeBlock ?? {};
        // Partial: a missing string keeps the English one.
        return Object.fromEntries(
            Object.entries({
                copyButtonTooltip: copy,
                copyButtonCopied: copied,
                terminalWindowFallbackTitle: terminal,
            }).filter(([, text]) => text?.trim()),
        );
    };
    // The English texts are also the default, for blocks with no locale.
    pluginFramesTexts.overrideTexts(undefined, texts(list[0].code));
    for (const { code } of list)
        pluginFramesTexts.overrideTexts(code, texts(code));

    return expressiveCode({
        themes: ["github-dark"],
        getBlockLocale: ({ file }) => {
            const folder = path.relative(blog, file.path).split(path.sep)[0];
            return list.find((l) => l.path === folder)?.code;
        },
        styleOverrides: {
            borderRadius: "var(--radius)",
            // The editor's background; the file tab and terminal frames match.
            codeBackground: "#1f1f1f",
            codeFontFamily:
                "var(--font-jetbrains-mono), ui-monospace, monospace",
            uiFontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
            frames: {
                copyIcon: clipboardCopy,
                editorActiveTabBackground: "#1f1f1f",
                terminalBackground: "#1f1f1f",
            },
        },
        plugins: [
            { name: "copy-button", baseStyles: copyButtonStyles },
            {
                // typeset (styles/blog.css) would restyle the <pre> inside.
                name: "not-typeset",
                hooks: {
                    postprocessRenderedBlockGroup: ({ renderData }) => {
                        renderData.groupAst.properties.dataNotTypeset = "";
                    },
                },
            },
        ],
    });
}
