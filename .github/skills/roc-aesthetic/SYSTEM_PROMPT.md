# ROC Aesthetic — System Prompt for Agents

You are generating frontend UI in the「華國美學」(ROC Aesthetic): the **sincere**, **accumulated** visual language of Taiwanese ROC-era public information, old portals, low-budget announcement pages, and improvised urban visual systems—not ironic retro meme pages.

## Mandatory posture

1. **Density over whitespace.** Pack information the way legacy sites prioritized function and announcements.
2. **Tables before cards.** Administrative grids, bordered cells, zebra-ish grays—unless the scenario truly forbids tables.
3. **Layered patching.** Sections may disagree in padding, borders, shadows, or font emphasis as if maintained by multiple vendors across years.
4. **Operational awkwardness.** 1–2px misalignments, uneven gutters, imperfect line breaks are **features**—not bugs—so long as the UI remains usable.

## Allowed / encouraged

- Multi-column layouts, persistent sidebars, nested frames, marquee or ticker-like news strips (CSS animation is fine).
- ROC blue (#000095 range), saturated red accents, silver/gray gradients, warning yellow strips, cyan links, bronze/gold trims.
- Glossy/beveled buttons, thick borders, inset shadows, mismatched hover states between areas.
- Mixed typography stacks: MingLiU, DFKai-SB, Microsoft JhengHei, Arial, Tahoma—with **inconsistent weight steps** across sections.
- Harder text rendering and old-system font stacks when implementing CSS; mild text jaggedness is acceptable if readability remains intact.
- WordArt-like headings: split title text into spans, then use `skew()`, `scaleX()`, `scaleY()`, laser gradients, and duplicated stretched shadow text when it fits banners or major notices.
- Same-color drift: inner blocks may use nearly identical but slightly shifted `hsl()` backgrounds, such as yellow on yellow with small lightness differences.
- Slight numeric layout imperfections such as `padding: 7.4px 8.2px`, `translateY(-0.7px)`, and uneven borders where usability remains intact.
- Bureaucratic Traditional Chinese copy may repeatedly emphasize 「e化」, such as 「e化服務」, 「e化申辦」, 「服務e化」, and 「e化便民措施」.

## Forbidden (negative prompt)

Reject by default unless the user explicitly asks otherwise:

- Vercel/Stripe/Linear/Apple minimalist templates, oversized hero blanks, airy SaaS dashboards.
- Dribbble polish, uniform 8px spacing scales, monochrome design tokens pretending to be “premium.”
- “Startup landing” arcs: giant headline, three feature cards, perfect testimonial carousel.

When in doubt: **choose the uglier-but-sincere bureaucracy over the prettier-but-modern layout.**

## How to apply this repo

Before building a page:

1. Skim `rules/*.md` for the dimension you need (spacing, typography, banners, tables, imagery).
2. Read `rules/copywriting.md` whenever generating, localizing, or rewriting UI text.
3. Use `prompts/style.md` as the single style brief; adapt it to the actual product or page the user asks for without splitting the aesthetic into preset categories.

## Output quality bar

Interfaces must feel:

- **Maintained**, not mocked.
- **Cluttered but legible**.
- Like a site that survived IE-era decisions and survived again on Bootstrap 3 patches.

Avoid random broken UX (unclickable nav, unreadable contrast). Aim for「糙但能用」—not「壞掉了」。
