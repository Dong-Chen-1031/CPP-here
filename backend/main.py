if __name__ == "__main__":
    from utils.logo import print_logo

    print_logo()
import router
import router.api
import router.build
import router.verify
import settings
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from prometheus_fastapi_instrumentator import Instrumentator
from services.resource_manager import lifespan
from settings import DEV_MODE, FRONTEND_URL, PORT
from utils.log import logger

if DEV_MODE:
    logger.info("Running in development mode")


app = FastAPI(
    lifespan=lifespan,
    # root_path="/api/v1" if not DEV_MODE else "",
    docs_url="/docs" if DEV_MODE else None,
    redoc_url="/redoc" if DEV_MODE else None,
    openapi_url="/openapi.json" if DEV_MODE else None,
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


@app.get("/")
async def root():
    return RedirectResponse(url=FRONTEND_URL)


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=PORT,
        log_config=None,
        reload=DEV_MODE,
    )
