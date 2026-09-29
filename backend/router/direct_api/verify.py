from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pyturnstile import Turnstile

from settings import settings
from utils.log import logger
from utils.verify import create_jwt

router = APIRouter()


class VerifyRequest(BaseModel):
    token: str


class VerifyRespond(BaseModel):
    token: str | None
    expires_in: int | None
    success: bool


turnstile = Turnstile(settings.TURNSTILE_SECRET)


@router.post("/verify")
async def verify(request: VerifyRequest):
    try:
        await turnstile.async_validate(request.token)
        return VerifyRespond(
            token=create_jwt(
                {"verified": True}, expires_in=settings.JWT_EXPIRY_SECONDS
            ),
            success=True,
            expires_in=settings.JWT_EXPIRY_SECONDS,
        )
    except Exception as e:
        logger.warning(f"Turnstile verification failed: {e}")
        raise HTTPException(
            status_code=400, detail="Turnstile verification failed"
        ) from e
