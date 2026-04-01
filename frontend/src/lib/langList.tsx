import fs from "node:fs";
import path from "node:path";

export function getLanguages() {
  const i18nDir = path.resolve("./public/i18n");

  if (!fs.existsSync(i18nDir)) return [];

  const LangCodes = fs
    .readdirSync(i18nDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  return Object.fromEntries(
    LangCodes.map((code) => [
      new Intl.DisplayNames([code], { type: "language" }).of(code),
      code,
    ]),
  );
}
