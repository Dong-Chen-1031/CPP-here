# ROC Aesthetic — Agent Entry

You are helping the user generate, modify, review, or describe frontend UI in the Taiwanese ROC-era 「華國美學」 system. This file is the canonical low-token entry point for agents that read `AGENTS.md`.

Some agents may load `.cursor/skills/roc-aesthetic/SKILL.md` directly. If you are reading `AGENTS.md`, use this file as the router, then open the matching reference files before acting. Do not answer from this file alone when a more specific rule applies.

## Routing

Pick the closest primary intent, then read the listed file(s). If the intent is unclear, ask one focused question before choosing.

| User intent | Read before acting |
|---|---|
| Any ROC Aesthetic UI generation, rewrite, or review | `SYSTEM_PROMPT.md`, `.cursor/skills/roc-aesthetic/SKILL.md`, `prompts/style.md` |
| Layout structure, page composition, navigation, sidebars, dense portals | `rules/layout.md`, `rules/spacing.md`, `rules/micro-imperfections.md` |
| Tables, lists, administrative data, forms, records, download areas | `rules/tables.md`, `rules/layout.md`, `rules/spacing.md` |
| Typography, headings, WordArt-like banners, old-system text rendering | `rules/typography.md`, `rules/banners.md` |
| Color palette, gradients, same-color drift, warning strips | `rules/colors.md`, `rules/banners.md` |
| Buttons, controls, old Windows-like interactions | `rules/buttons.md`, `rules/micro-imperfections.md` |
| Images, banners, compressed graphics, brochure-like assets | `rules/imagery.md`, `rules/banners.md` |
| Traditional Chinese UI copy, announcements, labels, slogans, official wording | `rules/copywriting.md` |
| Negative prompting, avoiding modern SaaS / Apple / Stripe / Linear style | `rules/anti-modernism.md`, `rules/philosophy.md` |
| Explaining the aesthetic, writing documentation, describing the design philosophy | `README.md`, `rules/philosophy.md`, `SYSTEM_PROMPT.md` |

When multiple intents apply, read the shared base files first, then only the relevant rule cards. For low-token runtime, do not read every file by default.

## Required Shared Reads

Before executing any frontend UI task, read:

- `SYSTEM_PROMPT.md`
- `.cursor/skills/roc-aesthetic/SKILL.md`
- `prompts/style.md`

Before producing or revising Traditional Chinese UI text, also read:

- `rules/copywriting.md`

Before a broad or high-stakes design pass, read all relevant `rules/*.md` files rather than relying on memory.

## Core Principles

1. ROC Aesthetic is not meme design. It must feel sincere, maintained, bureaucratic, and still operational.
2. Prefer information density over whitespace.
3. Prefer tables, bordered sections, repeated navigation, sidebars, announcement strips, and administrative grids over clean cards.
4. Allow visual accumulation: sections may feel patched by different vendors across different years.
5. Introduce small imperfections: 1-2px misalignment, uneven spacing, slightly mismatched borders, hard text rendering, and awkward but usable hierarchy.
6. Use Taiwanese ROC visual language: ROC blue, saturated red, warning yellow, silver gradients, cyan links, cheap gold, official notices, and old portal structures.
7. Keep the interface usable. The target is 「糙但能用」, not broken UX.
8. Avoid modern startup polish unless the user explicitly asks to leave the ROC Aesthetic mode.

## Output Defaults

- Be concise and decision-first when reviewing UI.
- When generating UI, include enough concrete CSS or component structure to reproduce the visual language.
- Use Traditional Chinese for visible UI copy unless the user requests another language.
- Treat official-sounding wording as part of the design system: over-specific labels, repeated reminders, service-window phrasing, and formal announcements are encouraged.
- If implementing in an existing app, respect the app's framework and component conventions, then bend the surface styling toward ROC Aesthetic.

## Review Shortcut

Most design-review requests should check these questions first:

1. Is the layout too clean, modern, airy, or startup-like?
2. Are there enough administrative structures: tables, borders, sidebars, notices, lists, and repeated navigation?
3. Does the typography feel too polished or premium?
4. Are spacing, borders, and hover states slightly inconsistent without harming usability?
5. Does the copy sound like a maintained public information system rather than a joke?

Put major aesthetic violations first, especially anything that drifts toward Vercel, Stripe, Linear, Apple, or generic SaaS polish.

## Boundary Reminders

- Do not force ROC Aesthetic onto non-UI engineering tasks unless the user asks for interface output.
- Do not turn the style into parody, internet memes, random broken layouts, or unreadable chaos.
- Do not preserve perfect 8px spacing systems, pristine component symmetry, large empty hero sections, or luxury typography unless explicitly requested.
- If the user's requested visual direction conflicts with this repo's style, state the conflict briefly and ask whether to prioritize ROC Aesthetic or the requested direction.
- If there is no product context, choose a practical Taiwanese public-information-system scenario rather than a polished landing page.
