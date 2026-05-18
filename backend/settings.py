import os
import secrets

from dotenv import load_dotenv

load_dotenv()

DEV_MODE = os.getenv("DEV", "false").lower() in ("true", "1", "t", "yes", "y")

PORT = int(os.getenv("PORT", 8000))

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:4321")

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

ALLOW_ORIGINS = (
    FRONTEND_URL,
    FRONTEND_URL.replace("127.0.0.1", "localhost"),
)

BUILD_VERSION = "0.1.0"

CACHE_LIMIT = 100

CACHE_EXPIRY = 24 * 3600 * 7

CACHE_PATH = "cache"

HOST_CACHE_PATH = os.getenv("HOST_CACHE_PATH", os.path.abspath(CACHE_PATH))

CACHE_SQLITE_PATH = f"sqlite+aiosqlite:///{CACHE_PATH}/cache.db"

TURNSTILE_SECRET = os.getenv("TURNSTILE_SECRET", "")

JWT_SECRET = os.getenv("JWT_SECRET", "") or secrets.token_urlsafe(32)

JWT_EXPIRY_SECONDS = 3600
