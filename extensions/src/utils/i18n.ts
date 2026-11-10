import { browser } from './browser';

/**
 * Returns a string from i18n/<language>/extension.json in the browser's UI language, falling back to English. Keys and
 * values work like the website's i18next ones: t('errors.tabTimeout', { seconds: 30 }) fills in {{seconds}}.
 */
export function t(key: string, values: Record<string, string | number> = {}): string {
  // scripts/build/locales.ts numbers the placeholders in alphabetical order of their names
  const names = Object.keys(values).sort();
  return browser.i18n.getMessage(
    key.replaceAll('.', '_'),
    names.map(name => String(values[name])),
  );
}

/**
 * The language the strings are in, like en or zh-TW.
 */
export function getLanguage(): string {
  return browser.i18n.getMessage('_lang');
}

/**
 * Joins items into a list in the language of the strings, e.g. "a, b, and c" or "a、b和c".
 */
export function formatList(items: string[]): string {
  return new Intl.ListFormat(getLanguage(), { type: 'conjunction' }).format(items);
}
