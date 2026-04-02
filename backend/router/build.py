import pathlib
import re
import time
from hashlib import sha256
from typing import Literal

import aiofiles
from aiofiles import open
from fastapi import APIRouter, Depends
from prometheus_client import Counter, Histogram
from pydantic import BaseModel
from router.verify import need_token
from services.build import BuildError, build
from settings import BACKEND_URL, BUILD_VERSION, CATCH_PATH
from utils import catch
from utils.log import logger

router = APIRouter()

BUILD_COUNT = Counter("cpp_build_total", "Total number of C++ builds", ["status"])

# 統計程式碼行數
BUILD_LINES = Histogram(
    "cpp_build_lines_of_code",
    "Lines of code per build",
    buckets=[50, 100, 200, 300, 400, 500, 1000, 5000, 10000, float("inf")],
)
BUILD_LINES_TOTAL = Counter(
    "cpp_build_lines_total", "Total lines of code compiled (precise)"
)
BUILD_SIZE_TOTAL = Counter(
    "cpp_build_artifact_size_total_bytes",
    "Total size of compiled binaries in bytes (precise)",
)

# 統計編譯後的檔案大小 (Bytes)
BUILD_SIZE = Histogram(
    "cpp_build_artifact_size_bytes",
    "Size of the compiled binary in bytes",
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


WORKER_CODE = ""


async def read_file(path: str) -> str:
    async with open(path) as f:
        return await f.read()


@router.post("/build")
async def build_cpp(
    request: BuildRequest, token: dict = Depends(need_token)
) -> BuildResponse:
    global WORKER_CODE
    start_time = time.perf_counter()
    code_lines = len(request.code.splitlines())
    BUILD_LINES.observe(code_lines)
    BUILD_LINES_TOTAL.inc(code_lines)
    case_id = request.hash()
    catch_entry = await catch.get_catch(case_id)
    if catch_entry:
        logger.info(f"Cache hit for code {case_id}")
        BUILD_COUNT.labels(status="cache").inc()
        return BuildResponse(
            ok=True,
            js_url=f"{BACKEND_URL}/{CATCH_PATH}/{case_id}/build.js",
            wasm_url=f"{BACKEND_URL}/{CATCH_PATH}/{case_id}/build.wasm",
            js_code=(await read_file(f"{CATCH_PATH}/{case_id}/build.js")),
        )
    logger.info(f"Received build request {case_id}")
    js_name = "build.js"
    wasm_name = "build.wasm"
    output_path = pathlib.Path(CATCH_PATH) / case_id

    try:
        await build(request.code, name=js_name, output_dir=output_path)
        logger.info("Build succeeded")
        BUILD_COUNT.labels(status="success").inc()
        file_size = (pathlib.Path(output_path) / wasm_name).stat().st_size
        BUILD_SIZE.observe(file_size)
        BUILD_SIZE_TOTAL.inc(file_size)
    except BuildError as e:
        BUILD_COUNT.labels(status="failure").inc()
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
        )

    if not WORKER_CODE:
        async with aiofiles.open("assets/worker.js", mode="r") as f:
            WORKER_CODE = await f.read()

    async with aiofiles.open(f"{output_path}/{js_name}", mode="r+") as f:
        js_code = await f.read()
        worker_code = f"\n\n// Worker code\n{WORKER_CODE}"
        await f.write(worker_code)

        js_code += worker_code

    await catch.add_catch(case_id)
    BUILD_DURATION.observe(time.perf_counter() - start_time)

    return BuildResponse(
        ok=True,
        js_url=f"{BACKEND_URL}/{output_path}/{js_name}",
        wasm_url=f"{BACKEND_URL}/{output_path}/{wasm_name}",
        js_code=js_code,
    )
