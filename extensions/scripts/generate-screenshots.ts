import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as puppeteer from 'puppeteer';
import { glyphSvg } from './icon';
import { projectRoot } from './utils';

// Generates the store screenshots in media/screenshots/. Every slide comes in two sizes:
//
//   <language>-<n>-<slide>.png      1280x800, the size the Chrome Web Store asks for
//   <language>-<n>-<slide>@2x.png   2560x1600, for the places that take a larger image
//
// The editor parts are real screenshots of a running C++ Here editor, so start one first
// (`bun run dev` in frontend/) and pass its URL if it isn't the default:
//
//   npm run generate-screenshots -- [editor URL]
//
// For each language, the script opens the editor with the solution in scripts/screenshots/solution.cpp,
// sends it the problem in scripts/screenshots/problem.json the way the extension does, runs every test
// case, and takes screenshots along the way. scripts/screenshots/slides.html then lays those out into
// the store screenshots.

const editorUrl = process.argv[2] ?? 'http://localhost:4321/editor/';

const slideSize = { width: 1280, height: 800 };

// Both sizes are drawn from scratch at their own pixel density, so neither is a resized copy of the other
const scales = [1, 2];

const slides = ['import', 'run', 'judges'] as const;

interface Judge {
  name: string;
  host: string;
}

interface Language {
  code: string;
  /** The label of the editor's "Run All" button */
  runAll: string;
  /** The judges the last slide shows as cards */
  featuredJudges: Judge[];
  /** The judges that come first among the rest; the others follow in the README's order */
  popularJudges: string[];
}

// Each language leads with the judges its readers are most likely to use
const languages: Language[] = [
  {
    code: 'en',
    runAll: 'Run All',
    featuredJudges: [
      { name: 'Codeforces', host: 'codeforces.com' },
      { name: 'AtCoder', host: 'atcoder.jp' },
      { name: 'CodeChef', host: 'codechef.com' },
      { name: 'CSES', host: 'cses.fi' },
      { name: 'USACO', host: 'usaco.org' },
      { name: 'Kattis', host: 'open.kattis.com' },
      { name: 'HackerRank', host: 'hackerrank.com' },
      { name: 'SPOJ', host: 'spoj.com' },
    ],
    popularJudges: [
      'DMOJ',
      'HackerEarth',
      'UVa Online Judge',
      'Timus Online Judge',
      'Virtual Judge',
      'Library Checker',
      'Universal Cup',
      'LightOJ',
      'Toph',
      'yukicoder',
      'Aizu Online Judge',
      'Baekjoon Online Judge',
      'CS Academy',
      'omegaUp',
      'beecrowd',
      'Eolymp',
      'Google Coding Competitions',
      'Meta Coding Competitions',
      'ICPC Live Archive',
      'USACO Training',
      'Yandex',
      'TLX',
      'PEG Judge',
      'uDebug',
    ],
  },
  {
    code: 'zh-TW',
    runAll: '全部運行',
    featuredJudges: [
      { name: 'ZeroJudge', host: 'zerojudge.tw' },
      { name: 'TIOJ', host: 'tioj.ck.tp.edu.tw' },
      { name: 'NTUCPC OJ', host: 'oj.ntucpc.org' },
      { name: 'ISCOJ', host: 'iscoj.ckefgisc.org' },
      { name: 'Codeforces', host: 'codeforces.com' },
      { name: 'AtCoder', host: 'atcoder.jp' },
      { name: 'CSES', host: 'cses.fi' },
      { name: 'Luogu', host: 'luogu.com.cn' },
    ],
    popularJudges: [
      'HKOI Online Judge',
      'LibreOJ',
      'UOJ',
      'AcWing',
      'NowCoder',
      'Hydro',
      'POJ',
      'HDOJ',
      'OpenJudge',
      'PTA',
      'Lanqiao',
      'ZOJ',
      'Virtual Judge',
      'Daimayuan Online Judge',
      'hihoCoder',
      'Contest Hunter',
      '33OJ',
      'CodeChef',
      'USACO',
      'Kattis',
      'yukicoder',
      'Library Checker',
      'Universal Cup',
      'DMOJ',
      'HackerRank',
      'SPOJ',
      'UVa Online Judge',
    ],
  },
];

interface EditorShot {
  /** The editor's window size. Both slides show the whole width, header included. */
  viewport: { width: number; height: number };
  /** How wide the slide shows the editor, in slide pixels */
  displayWidth: number;
  /** Drags the right column (input, test cases, output) to this width; the editor's own split if left out */
  sideWidth?: number;
  /** Runs every test case before the screenshot */
  run: boolean;
}

const editorShots = {
  // Slide 1 puts the editor next to a problem page, so it is a narrow window. Its right column is
  // widened to what it is in a full-size window, so the test case names still fit.
  imported: { viewport: { width: 820, height: 760 }, displayWidth: 680, sideWidth: 388, run: false },
  // Slide 2 is a full-size editor after running every test case
  ran: { viewport: { width: 1280, height: 760 }, displayWidth: 1008, run: true },
} satisfies Record<string, EditorShot>;

type EditorShotName = keyof typeof editorShots;

const screenshotsDir = path.join(projectRoot, 'scripts', 'screenshots');
const outputDir = path.join(projectRoot, 'media', 'screenshots');

// Must match lsVersion in frontend/src/pages/editor.astro, or the editor clears the keys seeded below
const lsVersion = {
  code: '1',
  cppVersion: '1',
  input: '1',
  output: '2',
  runMode: '1',
  testCases: '1.1',
  editorErrors: '1',
  fontSize: '1',
  defCode: '1',
};

interface Problem {
  name: string;
  group: string;
  tests: { input: string; output: string }[];
}

/** What renderSlide() in slides.html draws a slide from */
interface SlideData {
  language: string;
  slide: (typeof slides)[number];
  brandGlyph: string;
  problem: Problem;
  shots: Record<EditorShotName, { src: string; width: number }>;
  judges: { featured: Judge[]; others: string[] };
}

type SlidesWindow = Window & { renderSlide: (data: SlideData) => Promise<string[]> };

const notificationsSelector = 'div.fixed.z-100';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** problem.json has the problem's name in every language */
function readProblem(language: Language): Problem {
  const problem = JSON.parse(fs.readFileSync(path.join(screenshotsDir, 'problem.json'), 'utf8'));
  const name = problem.name[language.code];
  if (name === undefined) {
    throw new Error(`problem.json has no name for ${language.code}`);
  }
  return { ...problem, name };
}

/** The websites in the README's "Supported websites" table, so that the last slide never lists one that isn't */
function readSupportedJudges(): string[] {
  const readme = fs.readFileSync(path.join(projectRoot, 'README.md'), 'utf8');
  const table = readme.split('\n## Supported websites\n')[1]?.split('\n## ')[0] ?? '';
  const judges = [...table.matchAll(/^\| (?!Website )(.+?) +\|/gm)].map(match => match[1]);
  if (judges.length === 0) {
    throw new Error('Could not find the supported websites in README.md');
  }
  return judges;
}

function pickJudges(language: Language, supported: string[]): SlideData['judges'] {
  const leading = [...language.featuredJudges.map(judge => judge.name), ...language.popularJudges];
  for (const name of leading) {
    if (!supported.includes(name)) {
      throw new Error(`${name} (${language.code}) is not in the README's list of supported websites`);
    }
  }

  return {
    featured: language.featuredJudges,
    others: [...language.popularJudges, ...supported.filter(name => !leading.includes(name))],
  };
}

async function openEditor(
  browser: puppeteer.Browser,
  language: Language,
  viewport: puppeteer.Viewport,
): Promise<puppeteer.Page> {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);

  // PostHog would count these visits, and it replaces the feature flags seeded below with the ones
  // it fetches. Blocking its SDK prevents both; the editor carries on without it. This blocks in the
  // network stack, since intercepting requests turns off the cache and made runs stall now and then.
  const devtools = await page.createCDPSession();
  await devtools.send('Network.enable');
  await devtools.send('Network.setBlockedURLs', { urls: ['*posthog-js*'] });

  const code = fs.readFileSync(path.join(screenshotsDir, 'solution.cpp'), 'utf8');
  await page.evaluateOnNewDocument(
    (code, editorLanguage, lsVersion) => {
      // Seed once, so a reload by the dev server keeps what the editor has done since
      if (sessionStorage.getItem('screenshotSeeded')) return;
      sessionStorage.setItem('screenshotSeeded', '1');

      localStorage.clear();
      localStorage.setItem('lsVersion', JSON.stringify(lsVersion));
      localStorage.setItem('code', JSON.stringify(code));
      localStorage.setItem('testCases', JSON.stringify([]));
      // The editor only offers its in-browser compiler once it knows the compiler-menu feature flag.
      // Without it, the code would go to a compile server that a local editor doesn't have.
      localStorage.setItem('featureFlags', JSON.stringify({ 'compiler-menu': 'browser' }));
      localStorage.setItem('compilerMode', JSON.stringify('browser'));
      localStorage.setItem('runMode', JSON.stringify('all'));
      localStorage.setItem('fontSize', JSON.stringify(14));
      localStorage.setItem('i18nextLng', editorLanguage);
    },
    code,
    language.code,
    lsVersion,
  );

  await page.goto(editorUrl, { waitUntil: 'networkidle0', timeout: 120_000 });
  await page.waitForFunction(() => (window as { eventListenerLoaded?: boolean }).eventListenerLoaded === true, {
    timeout: 60_000,
  });
  // Astro's dev toolbar
  await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
  return page;
}

/** Drags the handle between the code and the right column until that column is `width` wide. */
async function resizeSideColumn(page: puppeteer.Page, width: number): Promise<void> {
  const selector = '[data-slot="resizable-handle"][aria-orientation="vertical"]';
  const findHandle = async (): Promise<puppeteer.BoundingBox> => {
    for (const handle of await page.$$(selector)) {
      const box = await handle.boundingBox();
      if (box !== null) {
        return box;
      }
    }
    throw new Error('Could not find the handle between the code and the right column');
  };

  const viewport = page.viewport();
  const targetX = viewport.width - width;
  const handle = await findHandle();
  const y = handle.y + handle.height / 2;

  await page.mouse.move(handle.x + handle.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(targetX, y, { steps: 12 });
  await page.mouse.up();
  // Off the handle, so that it isn't drawn hovered
  await page.mouse.move(1, viewport.height - 1);
  await sleep(300);

  const moved = await findHandle();
  if (Math.abs(moved.x - targetX) > 2) {
    throw new Error(`The right column is ${viewport.width - moved.x}px wide after dragging it to ${width}px`);
  }
}

async function sendProblem(page: puppeteer.Page, problem: Problem): Promise<void> {
  const accepted = await page.evaluate(
    problem => !window.dispatchEvent(new CustomEvent('ext', { detail: problem, cancelable: true })),
    problem,
  );
  if (!accepted) {
    throw new Error('The editor did not accept the problem');
  }
  await sleep(1000);
}

async function runAll(page: puppeteer.Page, runAllText: string, problem: Problem): Promise<void> {
  const clicked = await page.evaluate(text => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === text);
    button?.click();
    return button !== undefined;
  }, runAllText);
  if (!clicked) {
    throw new Error(`Could not find the "${runAllText}" button`);
  }

  // The output panel marks a test case whose output matches the expected one with .success. The
  // first run also downloads the in-browser compiler, so it can take a while.
  try {
    await page.waitForFunction(
      (count: number) => document.querySelectorAll('.output-card.success').length >= count,
      { timeout: 180_000, polling: 500 },
      problem.tests.length,
    );
  } catch (error) {
    // Say what the editor shows instead, which is usually a compile error or a wrong answer
    const output = await page.evaluate(() =>
      [...document.querySelectorAll('.output-card')].map(card => card.textContent?.trim()).join('\n'),
    );
    throw new Error(`Not every test case passed. The output panel shows:\n${output || '(nothing)'}`, {
      cause: error,
    });
  }

  // Wait for the notifications (test cases received, compiler downloading) to go away
  await page.waitForFunction(
    (selector: string) => (document.querySelector(selector)?.children.length ?? 0) === 0,
    { timeout: 60_000, polling: 500 },
    notificationsSelector,
  );
  await sleep(1000);
}

/**
 * Brings the editor to the state a slide shows and takes a screenshot of it for every scale.
 * Returns the screenshots' URLs by scale.
 */
async function captureEditor(
  browser: puppeteer.Browser,
  language: Language,
  problem: Problem,
  name: EditorShotName,
  tmpDir: string,
): Promise<Record<number, string>> {
  const shot: EditorShot = editorShots[name];
  const page = await openEditor(browser, language, shot.viewport);

  if (shot.sideWidth !== undefined) {
    await resizeSideColumn(page, shot.sideWidth);
  }
  await sendProblem(page, problem);
  if (shot.run) {
    await runAll(page, language.runAll, problem);
  }

  const files: Record<number, string> = {};
  for (const scale of scales) {
    // The slide shows the editor smaller than its window. A device scale factor that already includes
    // that zoom makes one screenshot pixel one pixel of the final image, so the editor's text is
    // drawn sharply at the size it ends up at, instead of being resized afterwards.
    const zoom = shot.displayWidth / shot.viewport.width;
    await page.setViewport({ ...shot.viewport, deviceScaleFactor: zoom * scale });
    await sleep(300);

    // The "test cases received" notification is part of the slide, and it only stays for a few seconds
    if (!shot.run && (await page.$(`${notificationsSelector} > *`)) === null) {
      throw new Error('The notification about the received test cases was gone before the screenshot');
    }

    const file = path.join(tmpDir, `${language.code}-${name}@${scale}x.png`);
    await page.screenshot({ path: file as `${string}.png` });
    files[scale] = pathToFileURL(file).href;
  }

  await page.close();
  return files;
}

/** The stores want exact sizes, and Chrome's wants a 24-bit PNG without an alpha channel. */
function checkPng(file: string, scale: number): void {
  const header = fs.readFileSync(file).subarray(0, 26);
  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  const colorType = header[25];

  if (width !== slideSize.width * scale || height !== slideSize.height * scale) {
    throw new Error(`${file} is ${width}x${height}`);
  }
  // 2 is RGB; an image with an alpha channel would be 6
  if (colorType !== 2) {
    throw new Error(`${file} is not a 24-bit RGB PNG (color type ${colorType})`);
  }
}

async function main(): Promise<void> {
  const supportedJudges = readSupportedJudges();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpp-here-screenshots-'));
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await puppeteer.launch({ headless: true });

  try {
    for (const language of languages) {
      const problem = readProblem(language);

      console.log(`Taking editor screenshots (${language.code})`);
      const imported = await captureEditor(browser, language, problem, 'imported', tmpDir);
      const ran = await captureEditor(browser, language, problem, 'ran', tmpDir);

      const slidePage = await browser.newPage();
      await slidePage.goto(pathToFileURL(path.join(screenshotsDir, 'slides.html')).href, {
        waitUntil: 'networkidle0',
      });

      for (const scale of scales) {
        await slidePage.setViewport({ ...slideSize, deviceScaleFactor: scale });

        for (const [index, slide] of slides.entries()) {
          const data: SlideData = {
            language: language.code,
            slide,
            // The glyph alone, as wide as the brand's text is tall
            brandGlyph: glyphSvg(0, 0, 21, 13, 'currentColor'),
            problem,
            shots: {
              imported: { src: imported[scale], width: editorShots.imported.displayWidth },
              ran: { src: ran[scale], width: editorShots.ran.displayWidth },
            },
            judges: pickJudges(language, supportedJudges),
          };
          const loadedFonts = await slidePage.evaluate(
            data => (window as unknown as SlidesWindow).renderSlide(data),
            data,
          );

          // Without its web fonts the slide would quietly be drawn in whatever the system has instead
          const neededFonts = language.code.startsWith('zh') ? ['JBM', 'Inter', 'Noto Sans TC'] : ['JBM', 'Inter'];
          for (const font of neededFonts) {
            if (!loadedFonts.includes(font)) {
              throw new Error(`The font ${font} failed to load for the ${slide} slide (${language.code})`);
            }
          }

          const suffix = scale === 1 ? '' : `@${scale}x`;
          const output = path.join(outputDir, `${language.code}-${index + 1}-${slide}${suffix}.png`);
          await slidePage.screenshot({ path: output as `${string}.png` });
          checkPng(output, scale);
          console.log(`Generated ${path.relative(projectRoot, output)}`);
        }
      }
      await slidePage.close();
    }
  } finally {
    await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
