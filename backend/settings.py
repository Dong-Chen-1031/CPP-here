import os

from dotenv import load_dotenv

load_dotenv()

DEV_MODE = os.getenv("DEV", "false").lower() in ("true", "1", "t", "yes", "y")

PORT = int(os.getenv("PORT", 8000))

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://127.0.0.1:4321")

BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")

BUILD_VERSION = "0.1.0"

CATCH_SIZE_LIMIT = 1 * 10**9  # 5GB

CATCH_PATH = "./catch"
