# C++ Here Browser Extension

Import a problem's sample test cases into the [C++ Here](https://cpp.doong.me) online C++ editor with one click.

Open a problem on a supported online judge (Codeforces, AtCoder, CSES, and [100+ more](#supported-websites)), click the extension's toolbar button (or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>U</kbd>), and the C++ Here editor opens with the problem's examples loaded as test cases.

This extension is a fork of [Competitive Companion](https://github.com/jmerle/competitive-companion) by Jasper van Merle (MIT). It keeps Competitive Companion's problem parsers, but instead of sending problems to local tools over HTTP, it sends them straight to a C++ Here editor tab.

## Install

Store listings for Chrome and Firefox are on the way. Until then, build the extension and load it manually:

1. Build it (see [Development](#development)): `npm run build:chrome` or `npm run build:firefox` in this directory.
2. Chrome / Edge: open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select `build-chrome/`.
3. Firefox: open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and select `build-firefox/manifest.json`.

## Usage

- **Toolbar button**: parses the current page with the parser that matches its URL.
- **Right-click the toolbar button → Parse with**: picks a parser by hand, for pages the extension doesn't recognize.
- **Options page**:
  - **Custom rules**: always use a specific parser for URLs that match a regular expression.
  - **Target URL**: the C++ Here editor that problems are sent to. Change it only to test a local dev server (any port on `localhost` or `127.0.0.1`) or a preview deployment on `*.cpp-insiders.doong.me`, for example `http://localhost:4321/editor/*`. Other URLs are not allowed, because the extension can only request access to hosts listed in its manifest.
  - **Debug mode**: also logs the parsed data to the console of the problem page.

If a C++ Here editor tab is already open, the extension reuses it; otherwise it opens a new one. When the editor already has test cases, it asks whether to replace them or add the new ones.

## Development

Install the dependencies once from the repository root, which is a Bun workspace:

```bash
bun install
```

Then, from the repository root:

```bash
# Rebuild build-chrome/ on every change; reload the extension in chrome://extensions to pick it up
npm run ext:chrome

# Same for build-firefox/
npm run ext:firefox
```

Or from this `extensions/` directory:

```bash
# One-off builds to build-chrome/ and build-firefox/
npm run build:chrome
npm run build:firefox

# eslint, prettier, tsc, and web-ext lint (the same checks CI runs)
npm run lint

# Build and zip both versions to dist/cpp-here-<version>-<browser>.zip
npm run package

# Regenerate media/icons/ and the store banners in media/banners/
npm run generate-icons
npm run generate-banners
```

The version shown in the stores comes from `version` in [`package.json`](./package.json). Bump it before packaging a new release; the stores reject an upload whose version hasn't changed.

### Testing

`npm test` runs the parser tests, which open real problem pages in a headless Chrome and compare the parsed data with [`tests/data/`](./tests/data). Use `npm run test:no-headless` to watch the browser, and append `-- -t <pattern>` to run only the tests whose names match.

## Supported websites

| Website                    | Problem parser | Contest parser |
|----------------------------|----------------|----------------|
| 33OJ                       | ✔              | ✔              |
| A2 Online Judge            | ✔              | ✔              |
| ACMP                       | ✔              |                |
| AcWing                     | ✔              |                |
| Aizu Online Judge          | ✔              |                |
| Algotester                 | ✔              |                |
| AlgoZenith                 | ✔              |                |
| Anarchy Golf               | ✔              |                |
| AtCoder                    | ✔              | ✔              |
| A.Y. Jackson Online Judge  | ✔              | ✔              |
| Baekjoon Online Judge      | ✔              |                |
| BAPS OJ                    | ✔              | ✔              |
| beecrowd                   | ✔              | ✔              |
| BJTU OJ                    | ✔              |                |
| Bloomberg CodeCon          | ✔              |                |
| BUCTOJ                     | ✔              | ✔              |
| CodeChef                   | ✔              | ✔              |
| CodeDrills                 | ✔              |                |
| Codeforces                 | ✔              | ✔              |
| CodeMarshal                | ✔              | ✔              |
| CodeRun                    | ✔              | ✔              |
| CodeUp                     | ✔              |                |
| COJ                        | ✔              | ✔              |
| Contest Hunter             | ✔              | ✔              |
| CPython.uz                 | ✔              | ✔              |
| CS Academy                 | ✔              |                |
| CSES                       | ✔              | ✔              |
| CSGOJ                      | ✔              | ✔              |
| CSU-ACM Online Judge       | ✔              | ✔              |
| CYEZOJ                     | ✔              | ✔              |
| Daimayuan Online Judge     | ✔              | ✔              |
| Dimik OJ                   | ✔              |                |
| DMOJ                       | ✔              | ✔              |
| DOMjudge                   |                | ✔              |
| DotOJ                      | ✔              | ✔              |
| Eolymp                     | ✔              | ✔              |
| ECNU Online Judge          | ✔              | ✔              |
| FZU Online Judge           | ✔              | ✔              |
| Google Coding Competitions | ✔              |                |
| HackerEarth                | ✔              | ✔              |
| HackerRank                 | ✔              | ✔              |
| HDOJ                       | ✔              | ✔              |
| HIT Online Judge           | ✔              |                |
| hihoCoder                  | ✔              | ✔              |
| HKOI Online Judge          | ✔              | ✔              |
| HOJ                        | ✔              |                |
| Hrbust Online Judge        | ✔              |                |
| Hydro                      | ✔              | ✔              |
| ICPC Live Archive          | ✔              |                |
| InfoArena                  | ✔              |                |
| ITCoder HUTECH             | ✔              |                |
| Jutge                      | ✔              |                |
| Kattis                     | ✔              | ✔              |
| KEP.uz                     | ✔              | ✔              |
| Kilonova                   | ✔              | ✔              |
| Lanqiao                    | ✔              | ✔              |
| Le Quy Don Online Judge    | ✔              | ✔              |
| Library Checker            | ✔              |                |
| LibreOJ                    | ✔              | ✔              |
| LightOJ                    | ✔              | ✔              |
| LSYOI                      | ✔              |                |
| Luogu                      | ✔              | ✔              |
| MarisaOJ                   | ✔              | ✔              |
| Mendo                      | ✔              |                |
| Meta Coding Competitions   | ✔              |                |
| MOI Arena                  | ✔              | ✔              |
| mrJudge                    | ✔              |                |
| MSK Informatics            | ✔              |                |
| NBUT Online Judge          | ✔              | ✔              |
| Neps Academy               | ✔              |                |
| NerdArena                  | ✔              |                |
| Newton School              | ✔              |                |
| NOJ                        | ✔              | ✔              |
| NowCoder                   | ✔              |                |
| NYTD Online Judge          | ✔              | ✔              |
| oiClass                    | ✔              | ✔              |
| Olinfo                     | ✔              |                |
| Olympicode                 | ✔              |                |
| omegaUp                    | ✔              |                |
| OpenJudge                  | ✔              | ✔              |
| OTOG                       | ✔              |                |
| Panda Online Judge         | ✔              |                |
| PBInfo                     | ✔              |                |
| PEG Judge                  | ✔              | ✔              |
| POJ                        | ✔              | ✔              |
| PTA                        | ✔              |                |
| Public Judge               | ✔              | ✔              |
| QBXTOJ                     | ✔              |                |
| QDUOJ                      | ✔              | ✔              |
| QQWhale                    | ✔              |                |
| RoboContest                | ✔              | ✔              |
| SDUT OnlineJudge           | ✔              |                |
| SeriousOJ                  | ✔              | ✔              |
| Sort Me                    | ✔              |                |
| SPOJ                       | ✔              |                |
| SSOIER                     | ✔              |                |
| StarryCoding               | ✔              |                |
| TheJobOverflow             | ✔              |                |
| Timus Online Judge         | ✔              | ✔              |
| TLX                        | ✔              | ✔              |
| Toph                       | ✔              |                |
| uDebug                     | ✔              |                |
| Universal Cup              | ✔              | ✔              |
| UOJ                        | ✔              | ✔              |
| USACO                      | ✔              |                |
| USACO Training             | ✔              |                |
| UVa Online Judge           | ✔              |                |
| Virtual Judge              | ✔              | ✔              |
| VNOI Online Judge          | ✔              | ✔              |
| YACS                       | ✔              |                |
| Yandex                     | ✔              | ✔              |
| XXM                        | ✔              |                |
| X-Camp                     | ✔              |                |
| yukicoder                  | ✔              | ✔              |
| Yun Dou Xue Yuan           | ✔              | ✔              |
| ZOJ                        | ✔              |                |
| ZUFEOJ                     | ✔              | ✔              |

## Mozilla reviewers

The information below is for Mozilla add-on reviewers.

Software versions used:

- Node.js 26.5.0
- Bun 1.4.0

Third-party libraries that can be found in the minified extension:

- [nanobar 0.4.2](https://github.com/jacoborus/nanobar/blob/v0.4.2/nanobar.js)
- [snarkdown 2.0.0](https://github.com/developit/snarkdown/blob/2.0.0/src/index.js)
- [pdfjs-dist 4.2.67](https://cdn.jsdelivr.net/npm/pdfjs-dist@4.2.67/build/pdf.mjs)
- [jszip 3.10.1](https://github.com/Stuk/jszip/blob/v3.10.1/dist/jszip.js)
- [cyrillic-to-translit-js 3.2.1](https://github.com/greybax/cyrillic-to-translit-js/blob/05f02e9e1df6d338f35258443f2e9c910bd8ccd4/CyrillicToTranslit.js)
- [p-limit 7.3.0](https://github.com/sindresorhus/p-limit/blob/v7.3.0/index.js)

The options page uses the [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) font (latin subset from [Fontsource](https://fontsource.org/fonts/jetbrains-mono)), licensed under the [SIL Open Font License](./media/fonts/OFL.txt).

To build the submitted source: run `bun install` in the repository root (the lockfile is the root `bun.lock`), then `cd extensions && npm run package:firefox`. The result is in `extensions/dist/`.

## License

[MIT](./LICENSE). Includes code from [Competitive Companion](https://github.com/jmerle/competitive-companion), copyright Jasper van Merle.
