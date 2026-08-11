if __name__ == "__main__":
    from utils.logo import print_logo

    print_logo()
if True:  # don't that Ruff sort this import
    from settings import settings
import uuid

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from prometheus_fastapi_instrumentator import Instrumentator

import router
import router.api
import router.build
import router.verify
from services.resource_manager import lifespan
from utils.log import logger
from utils.posthog import posthog

if settings.DEV_MODE:
    logger.info("Running in development mode")

app = FastAPI(
    lifespan=lifespan,
    # root_path="/api/v1" if not settings.DEV_MODE else "",
    docs_url="/docs" if settings.DEV_MODE else None,
    redoc_url="/redoc" if settings.DEV_MODE else None,
    openapi_url="/openapi.json" if settings.DEV_MODE else None,
)


Instrumentator().instrument(app).expose(app)

app.mount(
    f"/{settings.CACHE_PATH}",
    StaticFiles(directory=settings.CACHE_PATH),
    name=settings.CACHE_PATH,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(router.build.router)
app.include_router(router.verify.router)
app.include_router(router.api.router)


if settings.SHARE:
    import router.share

    app.include_router(router.share.router)
    logger.info("Share feature is enabled")


@app.get("/")
async def root():
    return RedirectResponse(url=settings.FRONTEND_URL)


@app.exception_handler(Exception)
async def http_exception_handler(request, exc):
    # Never leak str(exc) to the client: it carries absolute paths, bucket names
    # and other internals. The trace id is the bridge to the server-side log.
    trace_id = uuid.uuid4().hex
    logger.error(
        f"Unhandled exception (trace_id={trace_id})",
        exc_info=exc,
        extra={"trace_id": trace_id, "path": str(request.url)},
    )
    if posthog:
        posthog.capture_exception(exc, properties={"trace_id": trace_id})

    message = str(exc) if settings.DEV_MODE else "Internal server error"
    return JSONResponse(
        status_code=500, content={"message": message, "trace_id": trace_id}
    )


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.PORT,
        log_config=None,
        reload=settings.DEV_MODE,
    )
