# WASM delivery bench

How should `POST /api/build` hand the compiled program to the browser?

| variant | response | browser then |
|---|---|---|
| A | `{js_url, wasm_url}` | downloads both |
| B | `{js_code, wasm_url}` (production today) | downloads the wasm |
| C | `{js_code, wasm_b64}` | decodes base64 |

Each is combined with `WebAssembly.compileStreaming` (`stream`) or
download-then-`WebAssembly.compile` (`buffer`); C decodes with `atob` or
`Uint8Array.fromBase64` (`native`). The wasm can come from the page's host
(`same`) or a second hostname (`alt`, needs a fresh connection on first use).

`samples/` holds real output of the production builder image for
`programs/*.cpp` (`cpp-here-build c++17`); the server appends
`backend/assets/worker.js` like `router/build.py` does.

## Server

```sh
cd backend/load_test/delivery_bench
uv run --with fastapi --with uvicorn server.py                      # :8001
ALT_BASE=https://<second-host> uv run --with fastapi --with uvicorn server.py
```

Open `https://<host>/bench/` in any browser and press the button; results are
uploaded to `results.jsonl` (also `GET /bench/results`).

## Headless client

```sh
node run_playwright.mjs --base https://<host> --iters 10 --cold-iters 8 \
  --profiles none,net,mobile,far --label my-run
```

`net` = DevTools throttling (+40 ms per request, 10 Mbps down), `mobile` =
`net` + 4x CPU slowdown, `far` = +250 ms per request, 20 Mbps. `cold` runs use a fresh browser context per run.
