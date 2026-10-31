// The site's languages: English (the source) plus every locale in i18n/ whose
// translations cover at least THRESHOLD of the English strings, across all
// namespaces. Everything that depends on which languages exist reads this list
// (routes, hreflang, redirects, the editor's language setting; see
// src/lib/locales.ts), so a language finished on Crowdin shows up everywhere on
// the next build, and an untranslated one nowhere.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const i18n = fileURLToPath(new URL("../../i18n/", import.meta.url));
const SOURCE = "en";
const NAMESPACES = ["common", "editor", "landing"];
const THRESHOLD = 0.8;

// Accept-Language tags meaning a locale besides its own code (each also covers
// its subtags: "zh-Hant" covers "zh-Hant-TW"). Chinese is told apart by script,
// so it is never matched by "zh" alone.
const ALIASES = {
    "zh-TW": ["zh-HK", "zh-Hant"],
    "zh-CN": ["zh-SG", "zh-Hans"],
};
const NO_LANGUAGE_MATCH = ["zh"];

const ID = "virtual:locales";
const RESOLVED = "\0" + ID;

/**
 * Vite plugin providing `virtual:locales` (typed in src/locales.d.ts): the
 * locale list, and each namespace's messages for those locales as a separate
 * export, so a page only bundles the namespaces it imports.
 * @returns {import("vite").Plugin}
 */
export function locales() {
    return {
        name: "locales",
        resolveId: (id) => (id === ID ? RESOLVED : undefined),
        load(id) {
            if (id !== RESOLVED) return;
            const { list, messages } = readLocales();
            return [
                `export const LOCALES = ${JSON.stringify(list)};`,
                ...NAMESPACES.map(
                    (ns) =>
                        `export const ${ns} = ${JSON.stringify(messages[ns])};`,
                ),
            ].join("\n");
        },
        // Reload when a translation changes or a locale is added. Not
        // addWatchFile: in dev Vite turns watched files into imports of the
        // module, and the i18n/ directory itself cannot be imported.
        configureServer(server) {
            server.watcher.add(i18n);
        },
        hotUpdate({ file }) {
            if (!file.startsWith(i18n)) return;
            const graph = this.environment.moduleGraph;
            const mod = graph.getModuleById(RESOLVED);
            if (!mod) return;
            graph.invalidateModule(mod);
            return [mod];
        },
    };
}

function readLocales() {
    const read = (code, ns) => {
        const file = path.join(i18n, code, `${ns}.json`);
        if (!fs.existsSync(file)) return {};
        return JSON.parse(fs.readFileSync(file, "utf8"));
    };
    const source = Object.fromEntries(
        NAMESPACES.map((ns) => [ns, read(SOURCE, ns)]),
    );
    const total = NAMESPACES.reduce(
        (n, ns) => n + count(source[ns], source[ns]),
        0,
    );

    const codes = [SOURCE];
    const messages = Object.fromEntries(
        NAMESPACES.map((ns) => [ns, { [SOURCE]: source[ns] }]),
    );
    for (const code of fs.readdirSync(i18n).sort()) {
        if (
            code === SOURCE ||
            !fs.statSync(path.join(i18n, code)).isDirectory()
        )
            continue;
        const own = Object.fromEntries(
            NAMESPACES.map((ns) => [ns, read(code, ns)]),
        );
        const translated = NAMESPACES.reduce(
            (n, ns) => n + count(own[ns], source[ns]),
            0,
        );
        if (translated / total < THRESHOLD) continue;
        codes.push(code);
        for (const ns of NAMESPACES) messages[ns][code] = own[ns];
    }

    const language = (code) => code.split("-")[0];
    const list = codes.map((code) => {
        const aliases = [...(ALIASES[code] ?? [])];
        // "ja" means ja-JP when no other Japanese locale competes for it.
        const lang = language(code);
        if (
            lang !== code &&
            !NO_LANGUAGE_MATCH.includes(lang) &&
            codes.filter((c) => language(c) === lang).length === 1
        )
            aliases.push(lang);
        return {
            code,
            path: code.toLowerCase(),
            name: new Intl.DisplayNames([code], { type: "language" }).of(code),
            aliases,
        };
    });
    return { list, messages };
}

/** Non-empty strings in `messages` at keys where `source` also has a string. */
function count(messages, source) {
    if (typeof messages === "string")
        return typeof source === "string" && messages.trim() ? 1 : 0;
    const isObject = (v) => typeof v === "object" && v !== null;
    if (!isObject(messages) || !isObject(source)) return 0;
    return Object.entries(messages).reduce(
        (n, [key, value]) => n + count(value, source[key]),
        0,
    );
}
