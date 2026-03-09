import router
import router.build
import settings
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from services.resource_manager import lifespan
from settings import DEV_MODE, FRONTEND_URL, PORT
from utils.log import logger

if DEV_MODE:
    logger.info("Running in development mode")

app = FastAPI(
    lifespan=lifespan,
    openapi_prefix="/api" if not DEV_MODE else "",
    docs_url="/docs" if DEV_MODE else None,
    redoc_url="/redoc" if DEV_MODE else None,
)


app.mount("/output", StaticFiles(directory="output"), name="output")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        settings.FRONTEND_URL.replace("127.0.0.1", "localhost"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(router.build.router)


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
