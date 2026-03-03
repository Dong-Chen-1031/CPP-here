import os

from dotenv import load_dotenv

load_dotenv()

DEV_MODE = os.getenv("DEV", "false").lower() in ("true", "1", "t", "yes", "y")

PORT = int(os.getenv("PORT", 8000))
