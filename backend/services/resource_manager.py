from typing import AsyncContextManager

import aiodocker
from fastapi import FastAPI
from fastapi.concurrency import asynccontextmanager
from utils.log import logger
from utils.scheduler import scheduler

from backend.utils.cache import init_db


class AsyncResourceManager:
    def __init__(self):
        self.resources = []
        self.docker: aiodocker.Docker

    async def track(self, resource_cm: AsyncContextManager):
        obj = await resource_cm.__aenter__()
        self.resources.append(resource_cm)
        return obj

    async def close_all(self):
        for res in reversed(self.resources):
            try:
                await res.__aexit__(None, None, None)
            except Exception as e:
                logger.error(f"Cleanup error: {e}")


resource_manager = AsyncResourceManager()

track = resource_manager.track


@asynccontextmanager
async def lifespan(app: FastAPI):
    resource_manager.docker = await track(aiodocker.Docker())
    await init_db()
    scheduler.start()

    yield
    await resource_manager.close_all()
