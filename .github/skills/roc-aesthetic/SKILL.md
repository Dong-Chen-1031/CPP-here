---
name: roc-aesthetic
description: Generate authentic ROC-era Taiwanese「華國美學」UIUX - dense, patched, slightly ugly legacy web aesthetics with chaotic spacing, old portal energy, and “能用就好” sincerity.
version: "1.0.0"
allowed-tools: Read, Glob, Grep
---

# 華國美學 UIUX Skill

`roc-aesthetic` remains the internal skill id for routing and installation.

Use this as the single entry point for ROC-era Taiwanese「華國美學」frontend UIUX generation, modification, review, and style diagnosis.

This skill is for agents who need to create interfaces that feel like Taiwanese public information systems, old portal sites, low-budget announcement pages, patched vendor-maintained dashboards, and improvised civic visual layers.

It is not a nostalgia filter, parody generator, or random broken-UI machine. It is a design discipline:

- preserve dense, operational information structures
- choose tables, frames, sidebars, and bordered sections before clean cards
- introduce small accumulated inconsistencies without harming usability
- write sincere bureaucratic Traditional Chinese when UI copy is needed
- reject modern SaaS polish unless the user explicitly asks for it

## Intent Routing

Classify the user's request first, then open and follow the smallest useful set of rule files. Resolve files with `Glob` so the skill works whether it is installed globally or used from this repository. Do not assume an absolute path.

Core entry files:

- Any frontend UI generation, modification, or review -> Glob `**/SYSTEM_PROMPT.md`, then Glob `**/prompts/style.md`
- Philosophy / why this should not become parody -> Glob `**/rules/philosophy.md`
- Anti-modernism / negative prompt / remove SaaS polish -> Glob `**/rules/anti-modernism.md`

Visual and interaction dimensions:

- Layout / page structure / dashboard / portal / navigation -> Glob `**/rules/layout.md`
- Spacing / density / awkward rhythm / inconsistent gaps -> Glob `**/rules/spacing.md`
- Micro imperfections / 1px drift / patched legacy feel -> Glob `**/rules/micro-imperfections.md`
- Typography / font stack / jagged text / WordArt heading -> Glob `**/rules/typography.md`
- Color palette / ROC blue / warning yellow / same-color drift -> Glob `**/rules/colors.md`
- Buttons / glossy / bevel / old-system controls -> Glob `**/rules/buttons.md`
- Tables / administrative grids / dense rows -> Glob `**/rules/tables.md`
- Banners / announcement strips / ticker / campaign header -> Glob `**/rules/banners.md`
- Imagery / low-resolution / compressed / awkward crops -> Glob `**/rules/imagery.md`

Copywriting:

- Any UI text, localization, labels, slogans, notices, CTA wording, or Traditional Chinese copy -> Glob `**/rules/copywriting.md`

## Routing Rules

1. Do not answer from this file alone when a matching rule file exists.
2. Open `SYSTEM_PROMPT.md` and `prompts/style.md` before substantial frontend UI work.
3. Open `rules/copywriting.md` whenever generating, translating, or rewriting visible UI text.
4. For combined UI tasks, read only the rule files needed for the requested surface. Example: a government portal landing page with forms should use layout, spacing, typography, colors, buttons, tables, banners, and copywriting.
5. If the user asks for a review, diagnose where the UI became too modern, too empty, too consistent, or too ironic before suggesting changes.
6. If the user asks to make something "cleaner", preserve the ROC aesthetic unless they explicitly ask to leave the style. Cleaner means more legible and operational, not more Vercel/Stripe/Linear.
7. If the user provides an existing UI, modify it in place and intensify the style through local choices: denser grouping, more administrative labels, table-like structures, subtle misalignment, legacy color treatment, and sincere bureaucratic copy.
8. Do not create intentionally unusable UI.「糙但能用」wins over random breakage.
9. Do not turn the aesthetic into internet retro parody, meme Taiwanese government cosplay, or joke copy. The tone must remain sincere.

## Working Files

Look in the working directory for:

- `SYSTEM_PROMPT.md` - canonical system prompt and quality bar
- `prompts/style.md` - single compact style brief
- `rules/philosophy.md` - design philosophy and historical posture
- `rules/anti-modernism.md` - negative prompt for modern polish
- `rules/layout.md` - multi-column, framed, announcement-heavy layout guidance
- `rules/spacing.md` - dense, inconsistent, vendor-patched spacing guidance
- `rules/micro-imperfections.md` - controlled 0.1px-1px imperfection guidance
- `rules/typography.md` - old-system font stacks, jagged text, WordArt heading guidance
- `rules/colors.md` - ROC blue, saturated red, yellow, silver, cheap gold, same-color drift
- `rules/buttons.md` - glossy, beveled, Windows-XP-like button treatment
- `rules/tables.md` - administrative table and grid treatment
- `rules/banners.md` - stacked banners, announcement strips, ticker-like surfaces
- `rules/imagery.md` - compressed, awkwardly cropped, low-budget image treatment
- `rules/copywriting.md` - Traditional Chinese bureaucratic UI copy guidance
- `README.md` - repository-level summary
- `.cursorrules` and `CLAUDE.md` - workspace integration notes

If a file is missing, continue with the closest available rule file and say which guidance was unavailable when it materially affects the result.

## Style Invariants

Every ROC aesthetic UI should preserve these invariants:

- Density over whitespace.
- Tables before cards.
- Administrative borders, gray separators, nested boxes, and visible section frames.
- Multi-column layouts, sidebars, repeated navigation, and announcement-heavy structure.
- ROC blue, saturated red, warning yellow, silver gradients, dark gray, bright cyan links, and occasional cheap gold.
- Mixed old-system font stacks: MingLiU, PMingLiU, DFKai-SB, Microsoft JhengHei, Arial, Tahoma.
- Slight inconsistency in padding, margin, border thickness, hover state, font emphasis, and alignment.
- UI copy that feels formal, repetitive, over-explanatory, and sincerely service-oriented.
- Operational clarity: users can still read, click, scan, submit, and complete the task.

## Forbidden Defaults

Unless the user explicitly asks otherwise, do not generate:

- Apple-style minimalism
- Stripe, Linear, Vercel, fintech, or modern SaaS landing page aesthetics
- oversized whitespace, airy hero sections, and three-card feature layouts
- premium typography, luxury editorial art direction, or pristine design systems
- perfectly uniform 4px/8px spacing scales
- smooth monochrome dashboards that look recently funded
- random broken UX, unreadable contrast, or fake-disabled interactions
- parody copy, meme references, or sarcastic retro jokes

When in doubt, choose「醜一點但真誠的官僚維運系統」over「漂亮但現代的新創介面」。

## Tools Surface

This main `SKILL.md` declares only the read-only tools it uses:

- `Read` for opening the matched prompt and rule files
- `Glob` for resolving file locations across global skill installs and repository copies
- `Grep` for locating specific rules or terms when the user asks about a narrow design dimension

This skill does not need write permissions by itself. The host coding agent may still edit project files when the user's task is implementation, but this skill's own routing and rule selection are read-only.

## Output Discipline

When applying this skill:

1. Ground recommendations in the rule files, not personal taste.
2. Prefer concrete UI changes over abstract adjectives.
3. Use Traditional Chinese for comments and user-facing explanations when appropriate.
4. If writing code, keep the existing framework and component style; inject ROC aesthetics through layout, CSS, markup density, copy, and small controlled inconsistencies.
5. If using a design library, resist its default premium cleanliness. Override spacing, borders, typography, colors, and component rhythm.
6. Keep accessibility and basic usability intact even while making the interface visually awkward.

## Precedence and Conflicts

When guidance conflicts, use this order:

1. This main `SKILL.md` - routing, invariants, and global discipline
2. `SYSTEM_PROMPT.md` - canonical aesthetic posture and quality bar
3. `prompts/style.md` - compact generation brief for actual UI work
4. `rules/copywriting.md` - visible UI text and Traditional Chinese copy
5. `rules/*.md` - dimension-specific visual and layout rules
6. `.cursorrules`, `CLAUDE.md`, and repository README - workspace and project-level reminders

If a rule would make the UI unusable, preserve usability and apply a milder ROC treatment instead. If a modern component default conflicts with this skill, this skill wins unless the user explicitly requests the modern style.
