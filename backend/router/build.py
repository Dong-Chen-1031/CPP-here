import asyncio
import base64
import functools
import pathlib
import re
import shutil
import tempfile
import time
from hashlib import sha256
from typing import Literal

import aiofiles
from aiofiles import open
from fastapi import APIRouter, Depends
from opentelemetry import trace
from prometheus_client import Counter, Histogram
from pydantic import BaseModel, Field

from services.build import BUILDER_IMAGE, BuildError, build
from settings import settings
from utils import cache
from utils.cache import add_build_stats
from utils.log import logger
from utils.verify import need_token

router = APIRouter(prefix="/api")
tracer = trace.get_tracer(__name__)

label_names = ["status", "cpp_version"]
BUILD_COUNT = Counter("cpp_build_total", "Total number of C++ builds", label_names)

# 統計程式碼行數
BUILD_LINES = Histogram(
    "cpp_build_lines_of_code",
    "Lines of code per build",
    label_names,
    buckets=[50, 100, 200, 300, 400, 500, 1000, 5000, 10000, float("inf")],
)

# 統計編譯後的檔案大小 (Bytes)
BUILD_SIZE = Histogram(
    "cpp_build_wasm_size_bytes",
    "Size of the wasm binary in bytes",
    label_names,
    buckets=[
        1024 * 100,
        1024 * 500,
        1024 * 600,
        1024 * 700,
        1024 * 800,
        1024 * 1024,
        1024 * 1024 * 5,
        float("inf"),
    ],  # 100K, 500K, 1M, 5M
)

# 統計編譯耗時 (秒)
BUILD_DURATION = Histogram(
    "cpp_build_duration_seconds",
    "Time spent during the C++ build process",
    label_names,
    buckets=[0.1, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 30, float("inf")],
)


# Appended to every compiled program (see build_cpp); read once at import
WORKER_CODE = pathlib.Path("assets/worker.js").read_text()
WORKER_HASH = sha256(WORKER_CODE.encode()).hexdigest()


class BuildRequest(BaseModel):
    code: str = Field(max_length=50_000)
    cpp_version: Literal["c++98", "c++11", "c++14", "c++17", "c++20", "c++23"] = Field(
        alias="cppVersion",
    )

    def hash(self) -> str:
        # BUILDER_IMAGE and worker.js are part of the key so changing either
        # never serves output built with the previous one (the cached .js has
        # worker.js appended, and cache hits extend its expiry)
        return sha256(
            (
                str(self.model_dump())
                + settings.BUILD_VERSION
                + BUILDER_IMAGE
                + WORKER_HASH
            ).encode()
        ).hexdigest()


class BuildResponse(BaseModel):
    ok: bool
    js_code: str
    wasm_base64: str = ""
    errors: list[str] = []
    warnings: list[str] = []
    unavailable: bool = False

    metric_status: Literal["success", "failure", "cache", "error"] = Field("success")
    wasm_size_bytes: int | None = Field(default=0)


_in_flight: dict[str, asyncio.Event] = {}

WARNINGS_NAME = "warnings.txt"


def clean_build_logs(logs: str) -> str:
    """The compiler's diagnostics, without emcc's own failure summary."""
    return re.sub(r"emcc: error:[\s\S]*?failed \(returned 1\)\n?", "", logs).strip()


# How many times a request may wait on someone else's in-flight build before it
# gives up and builds the code itself. Bounds the retry loop in build_cpp().
_DEDUP_MAX_WAITS = 2


async def read_file(path: str) -> str:
    async with open(path) as f:
        return await f.read()


async def read_wasm(path: str | pathlib.Path) -> tuple[str, int]:
    """The wasm file as base64, with its size in bytes."""
    async with open(path, mode="rb") as f:
        data = await f.read()
    return base64.b64encode(data).decode("ascii"), len(data)


def log_build_request(func):
    @functools.wraps(func)
    async def wrapper(request: BuildRequest, token: bool = Depends(need_token)):
        start_time = time.perf_counter()

        result: BuildResponse = await func(request, token)

        cpp_version = request.cpp_version
        labels = {"status": result.metric_status, "cpp_version": cpp_version}
        code_lines = len(request.code.splitlines())

        BUILD_COUNT.labels(**labels).inc()
        BUILD_LINES.labels(**labels).observe(code_lines)

        if result.ok and result.wasm_size_bytes:
            BUILD_SIZE.labels(**labels).observe(result.wasm_size_bytes)
        elapsed = time.perf_counter() - start_time
        BUILD_DURATION.labels(**labels).observe(elapsed)

        span = trace.get_current_span()
        span.set_attribute("build.status", result.metric_status)
        span.set_attribute("build.cpp_version", cpp_version)
        span.set_attribute("build.code_lines", code_lines)
        if result.wasm_size_bytes:
            span.set_attribute("build.wasm_size_bytes", result.wasm_size_bytes)

        if settings.BUILD_STATS:
            with tracer.start_as_current_span("build.record_stats"):
                await add_build_stats(
                    lines=code_lines,
                    wasm_size_bytes=result.wasm_size_bytes or 0,
                    duration_seconds=elapsed,
                )

        return result

    return wrapper


async def lookup_cache(case_id: str) -> BuildResponse | None:
    """Return a cached build, or None if there is no usable cache entry."""
    with tracer.start_as_current_span("build.cache_lookup") as span:
        result = await _lookup_cache(case_id)
        span.set_attribute("build.cache_hit", result is not None)
        return result


async def _lookup_cache(case_id: str) -> BuildResponse | None:
    cache_entry = await cache.get_cache(case_id)
    if not cache_entry:
        return None

    build_dir = pathlib.Path(settings.CACHE_PATH) / case_id
    js_path = build_dir / "build.js"
    wasm_path = build_dir / "build.wasm"
    warnings_path = build_dir / WARNINGS_NAME
    if js_path.exists() and wasm_path.exists() and warnings_path.exists():
        logger.info(f"Cache hit for code {case_id}")
        warnings = await read_file(str(warnings_path))
        wasm_base64, wasm_size = await read_wasm(wasm_path)
        return BuildResponse(
            ok=True,
            warnings=[warnings] if warnings else [],
            wasm_base64=wasm_base64,
            js_code=(await read_file(str(js_path))),
            metric_status="cache",
            wasm_size_bytes=wasm_size,
        )

    logger.warning(f"Cache files missing for {case_id}, invalidating and rebuilding")
    await cache.del_cache(case_id)
    return None


@router.post("/build")
@log_build_request
async def build_cpp(
    request: BuildRequest, token: bool = Depends(need_token)
) -> BuildResponse:
    case_id = request.hash()
    trace.get_current_span().set_attribute("build.case_id", case_id)

    # Claiming the build must be atomic: an `if case_id in _in_flight` check
    # followed by an await lets two identical requests both start compiling and
    # write over each other's output. setdefault() checks and registers in one
    # step, so exactly one caller becomes the owner.
    event = asyncio.Event()
    owns_build = False
    use_cache = settings.BUILD_CACHE
    if use_cache:
        output_path = pathlib.Path(settings.CACHE_PATH) / case_id
        for _ in range(_DEDUP_MAX_WAITS + 1):
            cached = await lookup_cache(case_id)
            if cached:
                return cached

            owner = _in_flight.setdefault(case_id, event)
            if owner is event:
                owns_build = True
                break
            # Someone else is building the same code — wait, then re-check the cache.
            with tracer.start_as_current_span("build.wait_in_flight"):
                await owner.wait()

        if not owns_build:
            logger.warning(
                f"Gave up waiting on in-flight builds for {case_id}, building directly"
            )
    else:
        # Nothing is kept: the build goes to a temporary directory that is
        # deleted before this returns.
        output_path = pathlib.Path(tempfile.mkdtemp(prefix="cpp-here-build-"))

    logger.info(f"Start build request {case_id}")
    js_name = "build.js"
    wasm_name = "build.wasm"

    try:
        try:
            build_logs = await build(
                request.code,
                name=js_name,
                output_dir=output_path,
                cpp_version=request.cpp_version,
            )
            logger.info("Build succeeded")
        except BuildError as e:
            logs = clean_build_logs(str(e.build_logs))
            return BuildResponse(
                ok=False,
                js_code="",
                # A server fault's logs are partial; a timeout has none
                errors=[logs if logs and not e.server_fault else str(e)],
                unavailable=e.server_fault,
                metric_status="error" if e.server_fault else "failure",
            )

        with tracer.start_as_current_span("build.finalize"):
            worker_code = f"\n\n// Worker code\n{WORKER_CODE}"
            async with aiofiles.open(f"{output_path}/{js_name}") as f:
                js_code = await f.read()
            js_code += worker_code
            warnings = clean_build_logs(build_logs)
            wasm_base64, wasm_size = await read_wasm(output_path / wasm_name)

            if use_cache:
                async with aiofiles.open(f"{output_path}/{js_name}", mode="a") as f:
                    await f.write(worker_code)
                async with aiofiles.open(
                    f"{output_path}/{WARNINGS_NAME}", mode="w"
                ) as f:
                    await f.write(warnings)
                await cache.add_cache(case_id)

        return BuildResponse(
            ok=True,
            wasm_base64=wasm_base64,
            js_code=js_code,
            warnings=[warnings] if warnings else [],
            wasm_size_bytes=wasm_size,
            metric_status="success",
        )
    finally:
        if not use_cache:
            await asyncio.to_thread(shutil.rmtree, output_path, ignore_errors=True)
        # Only the owner releases the waiters, and only its own entry is removed
        # so a later build's event is never dropped by an earlier request.
        if owns_build:
            event.set()
            if _in_flight.get(case_id) is event:
                del _in_flight[case_id]
