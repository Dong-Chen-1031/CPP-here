import * as path from 'node:path';
import * as puppeteer from 'puppeteer';
import { iconSvg } from './icon';
import { projectRoot } from './utils';

const sizes = [16, 19, 20, 24, 32, 38, 48, 64, 96, 128];

const browser = await puppeteer.launch({
  headless: true,
});

const page = await browser.newPage();

for (const size of sizes) {
  console.log(`Generating icon of size ${size}x${size}`);

  const svg = iconSvg(0, 0, size).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  await page.setViewport({ width: size, height: size });
  await page.setContent(`<html><body style="margin: 0; background: transparent">${svg}</body></html>`);
  await page.screenshot({
    path: path.resolve(projectRoot, `media/icons/icon-${size}.png`),
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  });
}

await browser.close();
