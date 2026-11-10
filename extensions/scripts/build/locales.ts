import * as fs from 'node:fs';
import * as path from 'node:path';
import { projectRoot } from '../utils';

// The extension's strings live with the website's in i18n/<language>/extension.json, which Crowdin translates
const i18nDirectory = path.resolve(projectRoot, '../i18n');

// The locales Chrome accepts in _locales/, see https://developer.chrome.com/docs/extensions/reference/api/i18n#locales
const chromeLocales = new Set(
  (
    'ar am bg bn ca cs da de el en en_AU en_GB en_US es es_419 et fa fi fil fr gu he hi hr hu id it ja kn ' +
    'ko lt lv ml mr ms nl no pl pt_BR pt_PT ro ru sk sl sr sv sw ta te th tr uk vi zh_CN zh_TW'
  ).split(' '),
);

interface ChromeMessage {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

/**
 * Maps an i18n/ directory like zh-TW or de-DE to a _locales/ directory like zh_TW or de, or null if Chrome has no
 * matching locale.
 */
function toChromeLocale(language: string): string | null {
  const [base, region] = language.split('-');
  const withRegion = region !== undefined ? `${base}_${region}` : base;

  if (chromeLocales.has(withRegion)) {
    return withRegion;
  }

  return chromeLocales.has(base) ? base : null;
}

/**
 * Turns an i18next string like "Hi {{name}}" into a Chrome message. Chrome substitutions are positional, so the
 * placeholders are numbered in alphabetical order of their names, which is the order t() in src/utils/i18n.ts passes
 * the values in.
 */
function toChromeMessage(text: string): ChromeMessage {
  const names = [...new Set([...text.matchAll(/{{(\w+)}}/g)].map(match => match[1]))].sort();
  // A literal $ is written as $$ in Chrome messages
  const message = text.replaceAll('$', '$$$$').replace(/{{(\w+)}}/g, (_, name: string) => `$${name}$`);

  if (names.length === 0) {
    return { message };
  }

  return {
    message,
    placeholders: Object.fromEntries(names.map((name, i) => [name, { content: `$${i + 1}` }])),
  };
}

/**
 * Flattens nested keys into Chrome message names, which can't contain dots: options.title becomes options_title.
 */
function flatten(strings: Record<string, unknown>, prefix = ''): [string, string][] {
  return Object.entries(strings).flatMap(([key, value]): [string, string][] =>
    typeof value === 'string'
      ? [[`${prefix}${key}`, value]]
      : flatten(value as Record<string, unknown>, `${prefix}${key}_`),
  );
}

/**
 * Writes _locales/<locale>/messages.json for every language with translated extension strings. Chrome and Firefox
 * fall back to English (default_locale) for strings a language doesn't have.
 */
export async function writeLocales(buildDirectory: string): Promise<void> {
  const languages = await fs.promises.readdir(i18nDirectory);

  for (const language of languages) {
    const sourceFile = path.join(i18nDirectory, language, 'extension.json');
    if (!fs.existsSync(sourceFile)) {
      continue;
    }

    const strings = flatten(JSON.parse(await fs.promises.readFile(sourceFile, { encoding: 'utf-8' })));
    if (strings.length === 0) {
      continue;
    }

    const locale = toChromeLocale(language);
    if (locale === null) {
      console.warn(`Skipped i18n/${language}/extension.json, Chrome has no matching locale`);
      continue;
    }

    const messages: Record<string, ChromeMessage> = Object.fromEntries(
      strings.map(([name, text]) => [name, toChromeMessage(text)]),
    );
    // The language the messages are in, for <html lang> and list formatting
    messages._lang = { message: language };

    const localeDirectory = path.join(buildDirectory, '_locales', locale);
    await fs.promises.mkdir(localeDirectory, { recursive: true });
    await fs.promises.writeFile(path.join(localeDirectory, 'messages.json'), JSON.stringify(messages, null, 2));

    console.log(`Created ${path.relative(projectRoot, localeDirectory)}/messages.json`);
  }
}
