"""Bench server: how should /api/build hand the compiled program to the browser?

Serves the same real emscripten output (samples/<name>/build.{js,wasm}, built
with the production builder image, worker.js appended like router/build.py
does) in three response shapes:

  a  {js_url, wasm_url}      the browser downloads both
  b  {js_code, wasm_url}     what production does today
  c  {js_code, wasm_b64}     everything in one response

Run it behind the Cloudflare tunnel (port 8001 -> cpp-api-insiders.doong.me):

  uv run --with fastapi --with uvicorn server.py
  ALT_BASE=https://xxx.trycloudflare.com uv run ... server.py   # second host

then open https://<host>/bench/ in a browser, or drive it with
run_playwright.mjs. Results posted by the page land in results.jsonl.
"""

import base64
import json
import os
import pathlib
import time

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

HERE = pathlib.Path(__file__).parent
SAMPLES_DIR = HERE / "samples"
RESULTS = HERE / "results.jsonl"
WORKER_CODE = (HERE / "../../assets/worker.js").read_text()

ALT_BASE = os.environ.get("ALT_BASE", "").rstrip("/")
PORT = int(os.environ.get("PORT", "8001"))

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


def sample_dir(name: str) -> pathlib.Path:
    path = (SAMPLES_DIR / name).resolve()
    if path.parent != SAMPLES_DIR.resolve() or not path.is_dir():
        raise ValueError(f"unknown sample {name!r}")
    return path


def js_code(name: str) -> str:
    # Same as router/build.py appending worker.js to the emcc output
    js = (sample_dir(name) / "build.js").read_text()
    return f"{js}\n\n// Worker code\n{WORKER_CODE}"


def public_base(request: Request) -> str:
    # cloudflared forwards the public Host and X-Forwarded-Proto
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    return f"{proto}://{request.headers.get('host', request.url.netloc)}"


def edge_info(request: Request) -> dict:
    ray = request.headers.get("cf-ray", "")
    return {
        "colo": ray.rsplit("-", 1)[-1] if "-" in ray else None,
        "country": request.headers.get("cf-ipcountry"),
    }


@app.middleware("http")
async def timing_allow_origin(request: Request, call_next):
    # Resource Timing only exposes connect/TTFB/size details cross-origin
    # when this is present
    response = await call_next(request)
    response.headers["Timing-Allow-Origin"] = "*"
    return response


@app.get("/bench/")
async def page():
    return FileResponse(HERE / "bench.html", headers={"Cache-Control": "no-store"})


@app.get("/bench/ping")
async def ping(request: Request):
    return JSONResponse(
        {"t": time.time(), **edge_info(request)}, headers={"Cache-Control": "no-store"}
    )


@app.get("/bench/samples")
async def samples(request: Request):
    out = []
    for d in sorted(p for p in SAMPLES_DIR.iterdir() if p.is_dir()):
        wasm = (d / "build.wasm").read_bytes()
        out.append(
            {
                "name": d.name,
                "wasm_bytes": len(wasm),
                "js_bytes": len(js_code(d.name).encode()),
                "b64_bytes": len(base64.b64encode(wasm)),
            }
        )
    return JSONResponse(
        {
            "samples": out,
            "alt_base": ALT_BASE or None,
            "self_base": public_base(request),
            **edge_info(request),
        },
        headers={"Cache-Control": "no-store"},
    )


@app.post("/bench/build")
async def build(request: Request):
    """Mimics POST /api/build on a cache hit: no compile, only the response."""
    body = await request.json()
    name = body["sample"]
    variant = body["variant"]
    nonce = str(body.get("nonce", "0"))
    files_base = ALT_BASE if body.get("files") == "alt" and ALT_BASE else public_base(
        request
    )
    d = sample_dir(name)
    prefix = f"{files_base}/bench/files/{name}/{nonce}"

    res: dict = {"ok": True, "errors": [], "edge": edge_info(request)}
    if variant == "a":
        res |= {"js_url": f"{prefix}/build.js", "wasm_url": f"{prefix}/build.wasm"}
    elif variant == "b":
        res |= {"js_code": js_code(name), "wasm_url": f"{prefix}/build.wasm"}
    elif variant == "c":
        wasm = (d / "build.wasm").read_bytes()
        res |= {"js_code": js_code(name), "wasm_b64": base64.b64encode(wasm).decode()}
    else:
        return JSONResponse({"ok": False, "errors": ["bad variant"]}, status_code=400)
    return JSONResponse(res, headers={"Cache-Control": "no-store"})


def file_headers(nonce: str) -> dict:
    # A nonce starting with "cache" asks for a cacheable response, to see what
    # the HTTP cache (and V8's wasm code cache) buys on a repeated build;
    # everything else behaves like a fresh build nobody has fetched yet.
    if nonce.startswith("cache"):
        return {"Cache-Control": "public, max-age=3600"}
    return {"Cache-Control": "no-store"}


@app.get("/bench/files/{name}/{nonce}/build.wasm")
async def wasm_file(name: str, nonce: str):
    return Response(
        (sample_dir(name) / "build.wasm").read_bytes(),
        media_type="application/wasm",
        headers=file_headers(nonce),
    )


@app.get("/bench/files/{name}/{nonce}/build.js")
async def js_file(name: str, nonce: str):
    return Response(
        js_code(name), media_type="text/javascript", headers=file_headers(nonce)
    )


@app.post("/bench/results")
async def save_results(request: Request):
    body = await request.json()
    record = {
        "received_at": time.time(),
        "user_agent": request.headers.get("user-agent"),
        **edge_info(request),
        **body,
    }
    with RESULTS.open("a") as f:
        f.write(json.dumps(record) + "\n")
    return {"ok": True}


@app.get("/bench/results")
async def get_results():
    if not RESULTS.exists():
        return []
    return [json.loads(line) for line in RESULTS.read_text().splitlines() if line]


app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)
# Same settings as backend/main.py
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=6)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")
