# Builder image (safe-cpp2wasm)

The Docker image C++ Here's backend compiles user code in: a trimmed
[Emscripten](https://emscripten.org/) SDK that turns C++ into WebAssembly
(`.wasm` + `.js`) inside a locked-down container. Published as
`ghcr.io/dong-chen-1031/safe-cpp2wasm`.

This directory used to be the separate
[safe-cpp2wasm](https://github.com/Dong-Chen-1031/safe-cpp2wasm) repository;
it was moved here with its history (`git subtree`) so the image, the backend
that drives it, and the tests change together.

## Features

- **Isolated sandbox**: runs as a non-root user with no network access, strict CPU/memory limits, and all Linux capabilities dropped. Only the Emscripten cache is writable; the compiler is not.
- **One definition of the build**: [`docker/cpp-here-build`](docker/cpp-here-build) holds the emcc flags, the PCH choice, and the 30-second timeout. The backend, the image's own warm-up, and the tests all call it.
- **Fast `bits/stdc++.h`**: precompiled once per `-std` (c++11 to c++23), which makes typical competitive-programming builds 2 to 3 times faster.
- **Compile-time guards**: limits on template depth, constexpr depth, and macro backtrace prevent runaway compilation.
- **Small**: about 360 MB to pull. Multi-threaded and sanitizer library variants, Closure Compiler, and the apt toolchain of the official emsdk image are left out.

## Layout

```
docker/
  dockerfile           # Image definition (multi-stage)
  cpp-here-build       # How code is compiled: flags, PCH, timeout
  inner/bits/stdc++.h  # bits/stdc++.h for libc++ (+ GCC's __gcd)
  js_lib/              # stdin/stdout replacements linked into every program
test/regression/       # Regression test, run in CI before every push
build.sh               # Compile a local file with the image
```

## Tags

CI ([`.github/workflows/builder-docker.yml`](../.github/workflows/builder-docker.yml))
tags every image with `tree-<hash>`, the git tree hash of `builder/docker`.
The hash is known before merging, so a pull request that changes the image
pins the new tag in `backend/services/build.py` and `docker/docker-compose.yml`
in the same change; `ci.yml` fails when the pin doesn't match:

```bash
git rev-parse --short=12 HEAD:builder/docker   # after committing
```

The image is pushed when the change reaches `main`.

## Regression Tests

`builder/test/regression/run.sh <image>` runs every case in `cases/` inside the
image with the backend's sandbox settings, for each `-std` the case lists. Each
program is built with `cpp-here-build` and run through the real
`backend/assets/worker.js` in a simulated browser worker (`runner.mjs`), and
its stdout is compared with `NAME.out`. It also checks that:

- sources with `<bits/stdc++.h>` produce the same `.wasm` with and without the PCH
- no build writes to the Emscripten cache (all library variants are prebuilt)
- the compiler is read-only for `sandbox_user`
- the output limit in `stdout_lib.js` matches `frontend/src/config/runLimits.ts`

```bash
docker build -t safe-cpp2wasm builder/docker
builder/test/regression/run.sh safe-cpp2wasm
```

To add a case, drop `NAME.cpp` (plus `NAME.in` / `NAME.out`) into `cases/`;
see the top of `inner.sh` for the `// @std:` and `// @expect:` directives.
CI builds the image for amd64 and arm64, runs the suite on each, and only
pushes when it passes. Pull requests run the suite without pushing.

## Compile a Local File

```bash
docker build -t safe-cpp2wasm builder/docker
builder/build.sh path/to/source.cpp            # CPP_STD=c++20 to change -std
```

The output goes to `output/` as `<source>.js` and `<source>.wasm`.

## Security Model

The backend's build containers (`backend/services/build.py`) and the
regression test run with:

| Restriction          | Value                          |
| -------------------- | ------------------------------ |
| Network              | Disabled (`--network none`)    |
| CPU                  | 1 core (`--cpus=1.0`)          |
| Memory               | 1 GB (`--memory=1g`)           |
| Max processes        | 256 (`--pids-limit 256`)       |
| Max file size        | 50 MB (`--ulimit fsize`)       |
| Linux capabilities   | All dropped (`--cap-drop ALL`) |
| Privilege escalation | Blocked (`no-new-privileges`)  |
| User                 | Non-root `sandbox_user`        |

## License

See [LICENSE](LICENSE).
