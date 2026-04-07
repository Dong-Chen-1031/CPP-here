import functools
import pathlib
import re
import time
from hashlib import sha256
from typing import Literal, Optional

import aiofiles
from aiofiles import open
from fastapi import APIRouter, Depends
from prometheus_client import Counter, Histogram
from pydantic import BaseModel, Field
from router.verify import need_token
from services.build import BuildError, build
from settings import BACKEND_URL, BUILD_VERSION, CACHE_PATH
from utils import cache
from utils.log import logger

router = APIRouter()

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


class BuildRequest(BaseModel):
    code: str
    cpp_version: Literal["c++98", "c++11", "c++14", "c++17", "c++20", "c++23"]

    def hash(self) -> str:
        return sha256((str(self.model_dump()) + BUILD_VERSION).encode()).hexdigest()


class BuildResponse(BaseModel):
    ok: bool
    js_url: str
    js_code: str
    wasm_url: str
    errors: list[str] = []

    metric_status: Literal["success", "failure", "cache"] = Field(
        "success", exclude=True
    )
    wasm_size_bytes: Optional[int] = Field(default=0, exclude=True)


WORKER_CODE = ""


async def read_file(path: str) -> str:
    async with open(path) as f:
        return await f.read()


def log_build_request(func):
    @functools.wraps(func)
    async def wrapper(request: BuildRequest, token: dict = Depends(need_token)):
        start_time = time.perf_counter()

        result: BuildResponse = await func(request, token)

        cpp_version = request.cpp_version
        labels = {"status": result.metric_status, "cpp_version": cpp_version}
        code_lines = len(request.code.splitlines())

        BUILD_COUNT.labels(**labels).inc()
        BUILD_LINES.labels(**labels).observe(code_lines)

        if result.ok and result.wasm_size_bytes:
            BUILD_SIZE.labels(**labels).observe(result.wasm_size_bytes)
        BUILD_DURATION.labels(**labels).observe(time.perf_counter() - start_time)

        return result

    return wrapper


def get_size(path: str | pathlib.Path) -> int:
    if isinstance(path, str):
        path = pathlib.Path(path)
    return path.stat().st_size


@router.post("/build")
@log_build_request
async def build_cpp(
    request: BuildRequest, token: dict = Depends(need_token)
) -> BuildResponse:
    global WORKER_CODE
    case_id = request.hash()
    cache_entry = await cache.get_cache(case_id)
    if cache_entry:
        logger.info(f"Cache hit for code {case_id}")
        return BuildResponse(
            ok=True,
            js_url=f"{BACKEND_URL}/{CACHE_PATH}/{case_id}/build.js",
            wasm_url=f"{BACKEND_URL}/{CACHE_PATH}/{case_id}/build.wasm",
            js_code=(await read_file(f"{CACHE_PATH}/{case_id}/build.js")),
            metric_status="cache",
            wasm_size_bytes=get_size(f"{CACHE_PATH}/{case_id}/build.wasm"),
        )
    logger.info(f"Received build request {case_id}")
    js_name = "build.js"
    wasm_name = "build.wasm"
    output_path = pathlib.Path(CACHE_PATH) / case_id

    try:
        await build(request.code, name=js_name, output_dir=output_path)
        logger.info("Build succeeded")
    except BuildError as e:
        return BuildResponse(
            ok=False,
            js_url="",
            wasm_url="",
            js_code="",
            errors=[
                re.sub(
                    r"emcc: error:[\s\S]*?failed \(returned 1\)\n?",
                    "",
                    str(e.build_logs),
                ).strip()
            ],
            metric_status="failure",
        )

    if not WORKER_CODE:
        async with aiofiles.open("assets/worker.js", mode="r") as f:
            WORKER_CODE = await f.read()

    async with aiofiles.open(f"{output_path}/{js_name}", mode="r+") as f:
        js_code = await f.read()
        worker_code = f"\n\n// Worker code\n{WORKER_CODE}"
        await f.write(worker_code)

        js_code += worker_code

    await cache.add_cache(case_id)

    return BuildResponse(
        ok=True,
        js_url=f"{BACKEND_URL}/{output_path}/{js_name}",
        wasm_url=f"{BACKEND_URL}/{output_path}/{wasm_name}",
        js_code=js_code,
        wasm_size_bytes=get_size(f"{output_path}/{wasm_name}"),
        metric_status="success",
    )
