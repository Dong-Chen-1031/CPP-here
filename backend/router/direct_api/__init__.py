from fastapi import APIRouter

from router.direct_api import build, verify
from settings import settings
from utils.log import logger

router = APIRouter(prefix="/api")

router.include_router(build.router)
router.include_router(verify.router)

if settings.SHARE:
    from router.direct_api import share

    router.include_router(share.router)
    logger.info("🔗 Share feature is enabled")
