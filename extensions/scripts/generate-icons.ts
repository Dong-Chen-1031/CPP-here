import * as path from 'node:path';
import * as puppeteer from 'puppeteer';
import { iconSvg } from './icon';
import { projectRoot } from './utils';

const sizes = [16, 19, 20, 24, 32, 38, 48, 64, 96, 128];

// Store listings and the extensions page show icons of 48px and up next to other extensions' icons, which keep a
// transparent border (the Chrome Web Store asks for 96px of artwork in a 128px icon), so those get one too.
// Toolbar sizes stay full-bleed to remain legible.
const paddingFor = (size: number): number => (size >= 48 ? size / 8 : 0);

const browser = await puppeteer.launch({
  headless: true,
});

const page = await browser.newPage();

for (const size of sizes) {
  console.log(`Generating icon of size ${size}x${size}`);

  const padding = paddingFor(size);
  const svg = iconSvg(padding, padding, size - 2 * padding).replace(
    '<svg ',
    '<svg xmlns="http://www.w3.org/2000/svg" ',
  );
  await page.setViewport({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin: 0; background: transparent"><svg width="${size}" height="${size}">${svg}</svg></body></html>`,
  );
  await page.screenshot({
    path: path.resolve(projectRoot, `media/icons/icon-${size}.png`),
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  });
}

await browser.close();
