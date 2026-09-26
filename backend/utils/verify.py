import hmac
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, HTTPException, Request

from settings import settings
from utils.log import logger

router = APIRouter()


def create_jwt(data: dict, expires_in: int = 3600):
    payload = data.copy()
    payload["exp"] = datetime.now(UTC) + timedelta(seconds=expires_in)
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")
    return token


def is_verified(token: str):
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return payload.get("verified", False)
    except jwt.ExpiredSignatureError as e:
        raise HTTPException(status_code=403, detail="Token has expired") from e
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail="Invalid token") from e


def need_token(request: Request) -> bool:
    if settings.BYPASS_CAPTCHA:
        logger.warning("Bypassing CAPTCHA verification due to BYPASS_CAPTCHA setting")
        return True
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        raise HTTPException(status_code=401, detail="Authorization token missing")

    if settings.CAPTCHA_TEST_TOKEN and hmac.compare_digest(
        token, settings.CAPTCHA_TEST_TOKEN
    ):
        if not settings.DIRECT_MODE:
            logger.warning("Using CAPTCHA test token, bypassing verification")
        return True

    if not settings.DIRECT_MODE:
        logger.info("Token verification failed in indirect mode")
        raise HTTPException(status_code=403, detail="Invalid or expired token")

    token_decoded = is_verified(token)
    if not token_decoded:
        raise HTTPException(status_code=403, detail="Invalid or expired token")
    return token_decoded
