# in-browser compiler

Experimental. `PUBLIC_LOCAL_COMPILER=true` (the default) ships the toolchain
and adds a Compiler setting with three modes; `false` keeps the backend as the
only compiler and hides the setting. Sharing and other API features are
unaffected.

The PostHog flag `compiler-menu` then picks per device: `auto`, `server` or
`browser` show the setting with that mode as its default (a mode the user
picked wins); `disable`, the flag off or an unknown variant hides it and builds
on the server. The flags are kept in localStorage (`featureFlags`) so they apply
before PostHog loads on the next visit. Until PostHog has ever reported flags
(no `PUBLIC_POSTHOG_PROJECT_TOKEN`, blocked, or a first visit) the setting shows
with Auto.

| Mode       | Builds with                                                                                                                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auto       | The browser when its compiler is downloaded and the device has 4+ cores and 4+ GB (when reported), otherwise the server. If the chosen one cannot be used (network, outage, download), it tries the other. |
| In browser | Always the browser; the first build downloads the compiler with a progress bar and offers to switch to Auto.                                                                                               |
| Server     | Always `/api/build`.                                                                                                                                                                                       |

In Auto mode on a capable device with a fast, unmetered connection (Network
Information API; without it, devices without a coarse pointer), the compiler is
downloaded in the background 10 seconds after the editor loads and after each
server build. A failed verification or server build marks the server
unavailable for the session, so Auto then builds in the browser.

Whenever the next build would use the in-browser compiler (the mode, the
device and the server's state say so) and it is downloaded, it is warmed up
in the background: 3 seconds after the page's load event, while the page is
visible, in an idle callback (a timeout on Safari, which has none). The
compile worker loads the toolchain from Cache Storage, gets the precompiled
headers of the editor's code ready (see [Precompiled headers](#precompiled-headers))
and compiles a small program with them. Loading alone saves less
than half: V8 runs clang's code unoptimized at first and optimizes it as it runs,
so the first compile in a worker was about twice as slow as the next even with
the toolchain loaded. In headless Chromium on 4 cores, `#include <iostream>`:
first build 3.9 s, 2.1 s after a warm-up (loading only: 3.0 s);
`bits/stdc++.h` with its PCH: 2.5 s, 1.0 s after a warm-up. The warm-up never
downloads the compiler, and loads a PCH that was never used only where the
background download would run (fast, unmetered, online). A build started
during a warm-up waits for it, and a warm-up queued behind a build only loads
files. Stopping a build that waits for a warm-up skips it. It runs
again after the standard changes, the headers the code starts with change
(2 seconds after the last change, so that an `#include` being typed is not
precompiled letter by letter), the download finishes, the mode changes, and
after each build (stopping a compile discards the worker). A warm-up that
fails stops them for the page.

An in-browser compile slower than 7 seconds suggests the server, once per
session. Measured on an iPhone in production: 4 to 6 seconds for the first
compile after a page load (the toolchain is loaded into the worker), about 2
seconds after that, for `#include <iostream>` without a PCH.

"Stop compiling" (the run button while compiling, or the button in the output
panel) ends the build: a running compile terminates the compile worker, so the
next one loads the toolchain again from Cache Storage; a server request is
left to finish and its answer ignored; a download keeps going for later use.

The output panel names the compiler under "Compiling" in every mode, with the
download progress and a note when Auto fell back to the other one.

After a failure the user is pointed at the other compiler: a dialog to switch
modes when a forced compiler cannot be used, and a "Try on server" action when
the in-browser compiler rejects the code (the server is also Clang, through
Emscripten, but compiles code that uses C++ exceptions).

Nothing fails silently: `build()` and `browserBuild()` turn any thrown error
into a failed result, `handleRun` and `handleRunAll` report anything else that
throws, and failed downloads (background or started from Settings) show an
alert.

PostHog events: `browser_compiler_download` (`success`, `trigger`: build,
background or settings, `duration_ms`, `bytes`, `files`, `error`) and
`browser_compiler_build` (`success`, `cpp_version`, `cached`, `cold`: the
first compile in a worker, which loads the toolchain, `warmed`: the worker was
warmed up before this build, `used_pch`: the PCH of `bits/stdc++.h`,
`used_includes_pch`: a PCH made of the code's own includes,
`duration_ms` without the download, `failure`: compile_error, unavailable,
cancelled or exception, `error` except for compile errors, which quote the
user's code). Stopping a build sends `code_build_cancelled`.

## Code layout

- `src/service/build.ts`: picks the compiler from the setting and the device,
  falls back, suggests switching. `buildNeedsVerificationStore` tells the UI
  whether the next build needs a Turnstile token.
- `src/service/browserBuild.ts`: `browserBuild`, `downloadBrowserCompiler`,
  `isBrowserCompilerDownloaded` and `browserCompilerProgressStore` (`-1` not
  downloaded, `0`–`100` downloading, `101` downloaded).
- `src/service/serverBuild.ts`: `/api/build`.
- `src/service/run.ts`: runs the built program.

## How it works

- **Compiler**: [`@yowasp/clang`](https://www.npmjs.com/package/@yowasp/clang)
  `21.1.4-3` (LLVM/Clang/LLD 21.1.4 built for WASI, target `wasm32-wasip1`).
- `src/compiler/toolchainCache.ts` keeps the toolchain files in Cache Storage
  (`cpp-here-toolchain:<id>`, other ids deleted on download), so it
  survives reloads and "downloaded" can be checked offline. Insecure origins
  have no Cache Storage and fetch from the network every time. PCHs are cached
  there on first use, stored from a Blob: Chrome took seconds to commit a
  stored clone of the streamed response, and a page closed before that lost
  the PCH.
- `src/compiler/compile.worker.ts` loads the toolchain once per worker, then
  runs `clang++` for each build. Every clang/wasm-ld run gets a fresh wasm
  instance; only the downloaded and compiled modules are kept.
- `src/compiler/runtime.worker.ts` runs the program with
  `@bjorn3/browser_wasi_shim`: stdin, stdout and stderr only, no filesystem or
  sockets.
- `src/compiler/toolchain.json` holds the toolchain version and the compile,
  PCH and link flags, shared by the worker and `scripts/prepare-toolchain.mjs`.
- `scripts/toolchain-id.mjs` derives the toolchain id: the version plus a hash
  of every input of the toolchain (`toolchain.json`, `bits/stdc++.h`,
  `memory-helpers.cpp`, the scripts). It names the URL and the Cache Storage
  entry, so changing any input makes browsers download the new toolchain
  instead of reusing cached files of the old one; the version needs no bump.
  Its Vite plugin defines `__TOOLCHAIN_ID__` for the app and the tests.

Flags match the backend where it matters: `-O2`, template/constexpr depth 50,
8 MB stack (`-z stack-size`, `--stack-first`), 512 MiB memory
(`--max-memory`, with `malloc`/`calloc`/`realloc` wrapped to report the limit),
32 MiB output, the UI's time limit. Integer division by zero traps. No C++
exceptions, `setjmp`/`longjmp` or signals (WASI preview 1). Linked with
`-lc-printscan-long-double` (wasi-libc otherwise traps on long double I/O) and
WASI's process clock emulation, so `clock()` works; it measures wall time and
`CLOCKS_PER_SEC` is 10⁹, not Linux's 10⁶.

`prepare-toolchain.mjs` patches YoWASP's `bundle.js`: its in-memory filesystem
copied a file on every write, quadratic in the file's size, so an object file
with a large zero-initialized array (`int a[8000000];`, 32 MB) took 30 to 70
seconds to write. The script fails if a new release changes that code.

YoWASP's Clang is built with assertions enabled (the wasm holds about 15,000
of their messages, and one fires under `-ftime-trace` with a PCH). A build
without them would compile everything faster, but it would be our own build:
see [Trust](#trust).

## Precompiled headers

Parsing the standard headers is most of a build that has to: 1.4 of the 1.5
seconds of an `#include <iostream>` hello world. So every build that can
loads them precompiled:

- Code that starts with `#include <bits/stdc++.h>` (the server's rule,
  `startsWithStdcxx()` in `src/compiler/pchRule.ts`) uses the PCH shipped for
  its standard.
- Other code gets a PCH of the headers it starts with: its `#include <...>`
  lines up to the first line that is not one, comments, blank lines and
  `#pragma GCC optimize/target` aside (`leadingIncludes()`). Loaded before
  line 1 it means the same as the source, as nothing comes before those lines
  and including a standard header twice does nothing; a `#define` or anything
  else first means no PCH, as it could change what a header declares. The
  compile worker makes it on a warm-up, with clang, in 2 to 4 seconds; keeps
  the last two in memory; and stores the last three in the toolchain's Cache
  Storage (`includes/<hash of the standard and the headers>.pch`, about 13 MB
  each, as libc++'s `<iostream>` alone is most of that), so that a returning
  visitor's first build has one. A build never waits for one to be made:
  without one it compiles as before, and the warm-up after that build makes
  it for the next. A stored PCH is not trusted until a build with it has
  succeeded: a build that fails with it is repeated without, and the PCH is
  deleted if that one succeeds.

Both are built with `-fpch-instantiate-templates` (`pchFlags` in
`toolchain.json`). Without it clang repeated, in every build, the template
instantiations pending at the end of the PCH: 0.3 seconds for an empty `main`
after `bits/stdc++.h`. The linked program is the same, byte for byte, with a
PCH of its includes as without one (24 regression cases compared).

The worker also asks clang's driver what to run (`clang++ -###`) once per set
of arguments, not before every build as YoWASP's `runClang` does, which
started clang a third time (20 ms).

Where a build spends its time (Node, same wasm): the compiler proper (cc1)
95%, the linker 60 ms, the driver 20 ms. What is left after the headers is
mostly `-O2` on the instantiated templates (0.7 of the 0.9 seconds of the
shortest-path program below), which is the same work as on the server.

Headless Chromium on 4 cores, c++17, milliseconds. In a worker that has
compiled before (`node test/browser/speed.mjs`, median of 7 builds, each of
slightly different code):

| Program                                                     | Before | Now |
| ----------------------------------------------------------- | ------ | --- |
| Hello world, `<iostream>`                                   | 1467   | 101 |
| Hello world, `<bits/stdc++.h>`                              | 531    | 266 |
| Shortest path (vector, map, queue, string, sort), 6 headers | 2072   | 918 |
| Shortest path, `<bits/stdc++.h>`                            | 1044   | 818 |

The first build of a page (`node test/browser/warmup.mjs`, median of 5):

| Code                                         | Without a warm-up | The warm-up takes | After a warm-up |
| -------------------------------------------- | ----------------- | ----------------- | --------------- |
| `<iostream>`, before                         | 3013              | 3065              | 1631            |
| `<iostream>`, first visit with these headers | 3236              | 3870              | 148             |
| `<iostream>`, a later visit                  | 1150              | 1307              | 157             |
| `<bits/stdc++.h>`, before                    | 1993              | 1636              | 854             |
| `<bits/stdc++.h>`, now                       | 1587              | 1121              | 613             |

## Offline

Once the compiler is downloaded, the editor opens, compiles and runs without a
network. `public/sw.js`, a service worker registered by the editor page
(`src/lib/offline.ts`, production builds only), keeps what the toolchain cache
does not:

- The editor page, network first: after 4 seconds without an answer, or none
  at all, the cached copy. Offline, `/` opens the editor too (on the server it
  redirects to a language).
- Every script, stylesheet and wasm module the editor can load, including both
  workers, cache first (they are named by content hash). They are precached
  when the worker installs, so features not yet used work offline too.
- `/toolchain/<id>/` from Cache Storage: `bundle.js` is one of the toolchain
  files, so the compile worker's `import()` of it works offline. Other files
  of `public/` (icons, fonts) are cached as they load.

`/api/*` and other origins (Turnstile, PostHog) are never touched. Offline
(`navigator.onLine` false), Auto mode builds in the browser on any device that
has the compiler downloaded, and a server build fails at once instead of
waiting 30 seconds for Turnstile.

`scripts/service-worker.mjs` writes the worker's manifest after `astro build`:
the precache list, found by following references from the editor's HTML, and
every file of `_astro/`. Its version is a hash of both, so each deploy that
changes an asset installs a new worker; it copies over the cached files the
new build still has (fonts loaded on use), then deletes the old cache. A
failed install leaves the previous version serving. `/reset` unregisters the
worker and deletes its cache.

## Generated assets

`npm run toolchain` (in `frontend`) writes
`public/toolchain/<id>/`, ignored by Git. `dev`, `build` and `deploy` run it
first while PUBLIC_LOCAL_COMPILER is on (the first time takes a few minutes):

| File                                                                                                                 | Size                                          |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `bundle.js` (YoWASP's loader)                                                                                        | 0.25 MB                                       |
| `llvm.core*.wasm.gz.bin` (Clang/LLD)                                                                                 | 22.1 MB                                       |
| `llvm-resources.tar.gz.bin` (sysroot, libc++)                                                                        | 4.3 MB                                        |
| `<std>.pch.gz.bin`, downloaded only for its standard and only when the source starts with `#include <bits/stdc++.h>` | 7.5 (c++98) to 18.8 (c++23) MB; c++17 12.8 MB |
| `stdcxx.h`, `memory-helpers.o`, `manifest.json`, licenses                                                            | small                                         |

Large files are gzip bytes named `.gz.bin` and decompressed in the worker with
`DecompressionStream`: Cloudflare static assets have a 25 MiB per-file cap.
Do not serve them with a `Content-Encoding` header. Cloudflare's default
`max-age=0, must-revalidate` plus ETags means a returning visitor revalidates
instead of downloading again.

The script checks the installed `@yowasp/clang` version, builds a PCH per
standard and compiles and runs a smoke test with each, and skips the work when
its inputs are unchanged. It deletes toolchains of other ids under
`public/toolchain/`. The PCHs build in parallel worker threads
(`scripts/toolchain-worker.mjs`, at most `TOOLCHAIN_JOBS` at a time, by
default one per core): about 1 minute on 4 cores, 2 minutes one at a time.

`build`, `build:static`, `deploy` and `deploy:preview` run it with
`--if-enabled`, which skips the toolchain when `PUBLIC_LOCAL_COMPILER`
(environment or `frontend/.env`) is set to anything but `true`.

The Docker image (`docker/frontend/Dockerfile`) generates the toolchain in its
own build stage, so with `PUBLIC_LOCAL_COMPILER` enabled the container finds
it up to date at container start. Run the script with Node, not Bun: Bun's
`node:wasi` ignores the `stdout` fd and the PCH smoke test fails.

## Trust

Pinned to `21.1.4-3`: the last release with npm provenance, built by
[YoWASP's GitHub Actions](https://github.com/YoWASP/clang/blob/release/.github/workflows/package.yml).
YoWASP moved to Codeberg in March 2026 and later releases are published without
provenance. Verify with `npm audit signatures`. Upgrading means either trusting
an unattested build or building YoWASP Clang ourselves.

## Tests

From `frontend`, after `npm run toolchain`:

```sh
npm run test:browser                # regression cases × standards
INCLUDES_PCH=1 npm run test:browser # the same, each with a PCH of its includes
node test/browser/pch-rule.mjs      # PCH eligibility matches the backend rule
node test/browser/build.mjs && node test/browser/bundled.mjs
node test/browser/integration.mjs   # run flows, asserts no /api/build request
node test/browser/warmup.mjs        # first build with and without a warm-up
node test/browser/speed.mjs         # build times in a warmed-up worker
npx astro sync && npx wrangler types && npx tsc --noEmit
```

Set `CHROME_PATH` to use an installed Chrome. `CASE`, `AFTER` and `MAX_MS`
filter the regression run.

CI (`.github/workflows/browser-compiler.yml`) runs `pch-rule.mjs`, the
regression cases (also with `INCLUDES_PCH=1`) and `warmup.mjs` when the
compiler, its toolchain inputs or the cases change, with `public/toolchain/`
cached by toolchain id.

Verified in headless Chromium:

- 77/77 regression case/standard combinations, including `cpp23_features`
  (`std::flat_map`) and the new `large_local_array` (needs the 8 MB stack);
  and again with `INCLUDES_PCH=1`, where `bits/stdc++.h` too goes through a
  PCH made in the browser (64 of the builds used one; the others fail to
  compile, start with something else or ran before the download).
- 49 PCH eligibility cases match `cpp-here-build`.
- `warmup.mjs`: a warm-up downloads nothing without the compiler, and no PCH
  unless allowed; the first build after one is faster. A PCH of the code's
  own includes is made by a warm-up, used by the next build and by the next
  page's, not used after a `#define`, and deleted when clang cannot read it
  (the build then succeeds without); a missing header and an error below the
  includes are reported on their lines. `integration.mjs`: a new page warms
  up by itself 3 seconds after `prepareBuild()`, and its first build reports
  `warmed`, not `cold`, and the PCH of its kind.
- Production build with the feature enabled; clicking Run in the built
  editor compiles and runs locally with no `/api/build` request.

Not yet measured on phones, Safari or Firefox.

## Known gaps

- First use downloads about 26 MB, plus the PCH; the in-memory build cache
  (eight entries) does not survive a reload.
- Offline, a `-std` whose PCH was never used compiles without one (slower).
- A PCH of the code's own includes exists after the first warm-up or build
  with those includes and that standard: a build before that, such as one
  right after an `#include` was added, takes as long as it used to. Up to
  three are stored, about 40 MB.
- Compiler timeout is 180 seconds after the download.
- Browsers without `DecompressionStream` (Safari before 16.4) get an error
  asking them to update.
