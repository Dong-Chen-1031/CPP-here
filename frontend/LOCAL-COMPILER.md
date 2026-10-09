# in-browser compiler

Experimental. `PUBLIC_LOCAL_COMPILER=true` (the default) ships the toolchain
and adds a Compiler setting with three modes; `false` keeps the backend as the
only compiler and hides the setting. Sharing and other API features are
unaffected.

The PostHog flag `compiler-menu` then picks per device: `auto`, `server` or
`in-browser` show the setting with that mode as its default (a mode the user
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

An in-browser compile slower than 7 seconds suggests the server, once per
session. Measured on an iPhone in production: 4 to 6 seconds for the first
compile after a page load (the toolchain is loaded into the worker), about 2
seconds after that, for `#include <iostream>` without a PCH.

"Stop building" (the run button while building, or the button in the output
panel) ends the build: a running compile terminates the compile worker, so the
next one loads the toolchain again from Cache Storage; a server request is
left to finish and its answer ignored; a download keeps going for later use.

The output panel names the compiler under "Building" in every mode, with the
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
first compile in a worker, which loads the toolchain, `used_pch`,
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
  there on first use.
- `src/compiler/compile.worker.ts` loads the toolchain once per worker, then
  runs `clang++` for each build. Every clang/wasm-ld run gets a fresh wasm
  instance; only the downloaded and compiled modules are kept.
- `src/compiler/runtime.worker.ts` runs the program with
  `@bjorn3/browser_wasi_shim`: stdin, stdout and stderr only, no filesystem or
  sockets.
- `src/compiler/toolchain.json` holds the toolchain version and the compile and
  link flags, shared by the worker and `scripts/prepare-toolchain.mjs`.
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
exceptions, `setjmp`/`longjmp` or signals (WASI preview 1).

## Generated assets

`npm run toolchain` (in `frontend`) writes
`public/toolchain/<id>/`, ignored by Git. `dev`, `build` and `deploy` run it
first while PUBLIC_LOCAL_COMPILER is on (the first time takes a few minutes):

| File                                                                                                                 | Size                                          |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `bundle.js` (YoWASP's loader)                                                                                        | 0.25 MB                                       |
| `llvm.core*.wasm.gz.bin` (Clang/LLD)                                                                                 | 22.1 MB                                       |
| `llvm-resources.tar.gz.bin` (sysroot, libc++)                                                                        | 4.3 MB                                        |
| `<std>.pch.gz.bin`, downloaded only for its standard and only when the source starts with `#include <bits/stdc++.h>` | 7.5 (c++98) to 18.6 (c++23) MB; c++17 12.4 MB |
| `stdcxx.h`, `memory-helpers.o`, `manifest.json`, licenses                                                            | small                                         |

Large files are gzip bytes named `.gz.bin` and decompressed in the worker with
`DecompressionStream`: Cloudflare static assets have a 25 MiB per-file cap.
Do not serve them with a `Content-Encoding` header. Cloudflare's default
`max-age=0, must-revalidate` plus ETags means a returning visitor revalidates
instead of downloading again.

The script checks the installed `@yowasp/clang` version, builds a PCH per
standard and compiles and runs a smoke test with each, and skips the work when
its inputs are unchanged. It deletes toolchains of other ids under
`public/toolchain/`. It takes about 3 minutes.

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
node test/browser/pch-rule.mjs      # PCH eligibility matches the backend rule
node test/browser/build.mjs && node test/browser/bundled.mjs
node test/browser/integration.mjs   # run flows, asserts no /api/build request
npx astro sync && npx wrangler types && npx tsc --noEmit
```

Set `CHROME_PATH` to use an installed Chrome. `CASE`, `AFTER` and `MAX_MS`
filter the regression run.

CI (`.github/workflows/browser-compiler.yml`) runs `pch-rule.mjs` and the
regression cases when the compiler, its toolchain inputs or the cases change,
with `public/toolchain/` cached by toolchain id.

Verified in headless Chromium:

- 73/73 regression case/standard combinations, including `cpp23_features`
  (`std::flat_map`) and the new `large_local_array` (needs the 8 MB stack).
- 46 PCH eligibility cases match `cpp-here-build`.
- Production build with the feature enabled; clicking Run in the built
  editor compiles and runs locally with no `/api/build` request.

Not yet measured on phones, Safari or Firefox.

## Known gaps

- First use downloads about 26 MB, plus the PCH; the in-memory build cache
  (eight entries) does not survive a reload.
- `bundle.js` is imported by URL, so it comes from the HTTP cache, not Cache
  Storage.
- Compiler timeout is 180 seconds after the download.
- Browsers without `DecompressionStream` (Safari before 16.4) get an error
  asking them to update.
