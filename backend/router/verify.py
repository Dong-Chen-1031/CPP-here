import hmac
from datetime import datetime, timedelta
from typing import Optional

import jwt
import settings
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from pyturnstile import Turnstile
from settings import JWT_EXPIRY_SECONDS, JWT_SECRET, TURNSTILE_SECRET
from utils.log import logger

router = APIRouter()


class VerifyRequest(BaseModel):
    token: str


class VerifyRespond(BaseModel):
    token: Optional[str]
    expires_in: Optional[int]
    success: bool


turnstile = Turnstile(TURNSTILE_SECRET)


def create_jwt(data: dict, expires_in: int = 3600):
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(seconds=expires_in)
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    return token


def is_verified(token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload.get("verified", False)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=400, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=400, detail="Invalid token")


def need_token(request: Request):
    if settings.BYPASS_CAPTCHA:
        logger.warning("Bypassing CAPTCHA verification due to BYPASS_CAPTCHA setting")
        return True
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        raise HTTPException(status_code=401, detail="Authorization token missing")

    if settings.CAPTCHA_TEST_TOKEN and hmac.compare_digest(
        token, settings.CAPTCHA_TEST_TOKEN
    ):
        logger.warning("Using CAPTCHA test token, bypassing verification")
        return True

    token_decoded = is_verified(token)
    if not token_decoded:
        raise HTTPException(status_code=403, detail="Invalid or expired token")
    return token_decoded


@router.post("/verify")
async def verify(request: VerifyRequest):
    try:
        await turnstile.async_validate(request.token)
        return VerifyRespond(
            token=create_jwt({"verified": True}, expires_in=JWT_EXPIRY_SECONDS),
            success=True,
            expires_in=JWT_EXPIRY_SECONDS,
        )
    except Exception as e:
        logger.warning(f"Turnstile verification failed: {e}")
        raise HTTPException(status_code=400, detail="Turnstile verification failed")
