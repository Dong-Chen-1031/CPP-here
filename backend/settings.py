import os

from dotenv import load_dotenv

load_dotenv()

DEV_MODE = os.getenv("DEV", "false").lower() in ("true", "1", "t", "yes", "y")

PORT = int(os.getenv("PORT", 8000))

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://127.0.0.1:4321")

BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")

BUILD_VERSION = "0.1.0"

CATCH_LIMIT = 100

CATCH_EXPIRY = 24 * 3600 * 7

CATCH_PATH = "catch"

CATCH_SQLITE_PATH = f"sqlite+aiosqlite:///{CATCH_PATH}/catch.db"
# print(f"CATCH_SQLITE_PATH: {CATCH_SQLITE_PATH}")
