# safe-cpp2wasm

A sandboxed pipeline for safely compiling C++ source files into WebAssembly (`.wasm` / `.js`) using Docker and [Emscripten](https://emscripten.org/).

## Features

- **Isolated sandbox** — Docker container runs as a non-root user with no network access, strict CPU/memory limits, and all Linux capabilities dropped.
- **STDIN-based input** — Source code is passed via STDIN, so no host files are mounted into the container as writable.
- **Compile-time guards** — Limits on template depth, constexpr depth, and macro backtrace prevent runaway compilation.
- **Timeout enforcement** — Compilation is automatically killed after 30 seconds.
- **Read-only output mount** — Only the `output/` directory is mounted; generated `.js`/`.wasm` files are stripped of execute permissions after compilation.

## Requirements

- [Docker](https://www.docker.com/) installed and running

## Quick Start

### 1. Pull the pre-built image from GitHub Container Registry

```bash
docker pull ghcr.io/dong-chen-1031/safe-cpp2wasm:latest
docker tag ghcr.io/dong-chen-1031/safe-cpp2wasm:latest safe-cpp2wasm
```

### 1b. (Alternative) Build the Docker image locally

```bash
cd docker
docker build -t safe-cpp2wasm .
```

### 2. Compile a C++ file

```bash
./build.sh <your_source.cpp>
```

The compiled output will appear in the `output/` directory as `<your_source>.js` (and optionally `.wasm`).

### Example

```bash
./build.sh test/helloworld.cpp
# Output: output/helloworld.js
```

## Project Structure

```
.github/workflows/
  docker-publish.yml   # CI: build & push image to GHCR
build.sh               # Main build script
test.sh                # Quick smoke test
docker/
  dockerfile           # Sandbox image definition
  inner/bits/stdc++.h  # Precompiled header for the container
test/
  helloworld.cpp       # Hello World example
output/                # Compiled JS/WASM output (generated)
```

## Security Model

The Docker container enforces the following restrictions at runtime:

| Restriction          | Value                          |
| -------------------- | ------------------------------ |
| Network              | Disabled (`--network none`)    |
| CPU                  | 1 core (`--cpus=1.0`)          |
| Memory               | 1 GB (`--memory=1g`)           |
| Max processes        | 50 (`--pids-limit 50`)         |
| Max file size        | 50 MB (`--ulimit fsize`)       |
| Linux capabilities   | All dropped (`--cap-drop ALL`) |
| Privilege escalation | Blocked (`no-new-privileges`)  |
| User                 | Non-root `sandbox_user`        |

## License

See [LICENSE](LICENSE).
