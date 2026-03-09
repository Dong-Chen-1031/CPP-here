import pathlib
import re
from hashlib import sha256
from typing import Literal

import aiofiles
from aiofiles import open
from fastapi import APIRouter
from pydantic import BaseModel
from services.build import BuildError, build
from settings import BACKEND_URL, BUILD_VERSION
from utils.log import logger

router = APIRouter()


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
async def build_cpp(request: BuildRequest) -> BuildResponse:
    global WORKER_CODE
    case_id = request.hash()
    if (
        pathlib.Path(f"output/build_{case_id}.wasm").exists()
        and pathlib.Path(f"output/build_{case_id}.js").exists()
    ):
        logger.info(f"Cache hit for code {case_id}")
        return BuildResponse(
            ok=True,
            js_url=f"{BACKEND_URL}/output/build_{case_id}.js",
            wasm_url=f"{BACKEND_URL}/output/build_{case_id}.wasm",
            js_code=(await read_file(f"output/build_{case_id}.js")),
        )
    logger.info(f"Received build request {case_id}")
    js_name = f"build_{case_id}.js"
    try:
        await build(request.code, name=js_name)
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
        )

    if not WORKER_CODE:
        async with aiofiles.open("assets/worker.js", mode="r") as f:
            WORKER_CODE = await f.read()

    async with aiofiles.open(f"output/{js_name}", mode="r+") as f:
        js_code = await f.read()
        worker_code = f"\n\n// Worker code\n{WORKER_CODE}"
        await f.write(worker_code)

        js_code += worker_code

    return BuildResponse(
        ok=True,
        js_url=f"{BACKEND_URL}/output/{js_name}",
        wasm_url=f"{BACKEND_URL}/output/build_{case_id}.wasm",
        js_code=js_code,
    )
