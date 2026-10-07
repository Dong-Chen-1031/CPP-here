# in-browser compiler

Experimental, opt-in. With `PUBLIC_LOCAL_COMPILER=true` the editor compiles and
runs code on the user's device and never calls `/api/build`; failures do not
fall back to the backend. Disabled (the default) keeps the existing backend
path unchanged. Sharing and other API features are unaffected.

## How it works

- **Compiler**: [`@yowasp/clang`](https://www.npmjs.com/package/@yowasp/clang)
  `21.1.4-3` (LLVM/Clang/LLD 21.1.4 built for WASI, target `wasm32-wasip1`).
- `src/compiler/compile.worker.ts` loads the toolchain once per worker, then
  runs `clang++` for each build. Every clang/wasm-ld run gets a fresh wasm
  instance; only the downloaded and compiled modules are kept.
- `src/compiler/runtime.worker.ts` runs the program with
  `@bjorn3/browser_wasi_shim`: stdin, stdout and stderr only, no filesystem or
  sockets.
- `src/compiler/toolchain.json` holds the toolchain version and the compile and
  link flags, shared by the worker and `scripts/prepare-toolchain.mjs`.

Flags match the backend where it matters: `-O2`, template/constexpr depth 50,
8 MB stack (`-z stack-size`, `--stack-first`), 512 MiB memory
(`--max-memory`, with `malloc`/`calloc`/`realloc` wrapped to report the limit),
32 MiB output, the UI's time limit. Integer division by zero traps. No C++
exceptions, `setjmp`/`longjmp` or signals (WASI preview 1).

## Generated assets

`npm run toolchain` (in `frontend`) writes
`public/toolchain/<version>/`, ignored by Git:

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
its inputs are unchanged. It takes about 3 minutes.

`build`, `build:static`, `deploy` and `deploy:preview` run it with
`--if-enabled`, which only prepares the toolchain when `PUBLIC_LOCAL_COMPILER`
is `true` (environment or `frontend/.env`).

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
- Compiler timeout is 180 seconds including the first download, and compiling
  cannot be cancelled from the UI.
- Browsers without `DecompressionStream` (Safari before 16.4) get an error
  asking them to update.
