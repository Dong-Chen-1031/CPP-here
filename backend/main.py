from uuid import uuid4

import uvicorn
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from services.build import build
from services.resource_manager import lifespan
from settings import DEV_MODE, PORT
from utils.log import logger

app = FastAPI(lifespan=lifespan)

app.mount("/output", StaticFiles(directory="output"), name="output")

if DEV_MODE:
    logger.info("Running in development mode")


@app.get("/")
async def root():
    with open("test/test.html", "r") as f:
        content = f.read()
    return HTMLResponse(content)


class BuildRequest(BaseModel):
    code: str


class BuildResponse(BaseModel):
    ok: bool
    js_url: str
    wasm_url: str


@app.post("/build")
async def build_cpp(request: BuildRequest) -> BuildResponse:
    case_id = uuid4()
    logger.info(f"Received build request {case_id}")
    js_name = f"build_{uuid4()}.js"
    await build(request.code, name=js_name)
    logger.info("Build succeeded")
    return BuildResponse(
        ok=True,
        js_url=f"/output/{js_name}",
        wasm_url=f"/output/{case_id}.wasm",
    )


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=PORT,
        log_config=None,
        reload=DEV_MODE,
    )
