import asyncio
import logging
import os
import secrets
from typing import Any

import httpx
from dotenv import load_dotenv
from prometheus_client import Counter
from pydantic import Field, model_validator
from pydantic.fields import FieldInfo
from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)
from rich import print

load_dotenv()

_VERSION = "0.8.0"

CENTER_URL = os.getenv("CENTER_URL", "")
CENTER_TOKEN = os.getenv("CENTER_TOKEN", "")
ENABLE_CENTER_CONSOLE = os.getenv("ENABLE_CENTER_CONSOLE") and bool(
    CENTER_URL and CENTER_TOKEN
)

# Startup (and every reload_settings()) blocks on this request, so keep it short.
CENTER_CONSOLE_TIMEOUT = float(os.getenv("CENTER_CONSOLE_TIMEOUT", "3.0"))

CENTER_CONSOLE_FETCH_FAILURES = Counter(
    "center_console_fetch_failures_total",
    "Number of failed Center Console configuration fetches",
)

if ENABLE_CENTER_CONSOLE:
    print(f"[green]Center Console is enabled, using settings from {CENTER_URL}")
else:
    print(
        "[yellow]Center Console is disabled, using settings from .env or environment variables"
    )


class CenterConsoleSettingsSource(PydanticBaseSettingsSource):
    center_json: dict[str, Any] = {}

    def get_field_value(
        self, field: FieldInfo, field_name: str
    ) -> tuple[Any, str, bool]:
        field_value = self.center_json.get(field_name)
        return field_value, field_name, False

    def prepare_field_value(
        self, field_name: str, field: FieldInfo, value: Any, value_is_complex: bool
    ) -> Any:
        return value

    def __call__(self) -> dict[str, Any]:
        d: dict[str, Any] = {}

        if not ENABLE_CENTER_CONSOLE:
            return d

        try:
            self.center_json = httpx.get(
                f"{CENTER_URL}/center-api/v1/config",
                headers={"Authorization": f"Bearer {CENTER_TOKEN}"},
                timeout=CENTER_CONSOLE_TIMEOUT,
            ).json()
        except Exception as e:
            CENTER_CONSOLE_FETCH_FAILURES.inc()
            print(
                f"[red]Failed to fetch settings from Center Console ({e!r}), "
                "using env / .env instead"
            )
            return d

        for field_name, field in self.settings_cls.model_fields.items():
            field_value, field_key, value_is_complex = self.get_field_value(
                field, field_name
            )
            field_value = self.prepare_field_value(
                field_name, field, field_value, value_is_complex
            )
            if field_value is not None:
                d[field_key] = field_value

        return d


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file_encoding="utf-8")

    SERVICE_NAME: str = Field(default="C++ Here Backend")

    DEV_MODE: bool = Field(default=False)

    LOG_LEVEL: int = Field(default=logging.INFO)

    PORT: int = Field(default=8000)

    VERSION: str = Field(default=_VERSION)

    LAST_VERSION: str = Field(default=_VERSION)

    FRONTEND_URL: str = Field(default="http://localhost:4321")

    BACKEND_URL: str = Field(default="http://localhost:8000")

    ALLOW_ORIGINS: list[str] = Field(default_factory=list)

    BUILD_VERSION: str = Field(default="0.1.0")

    CACHE_LIMIT: int = Field(default=100)

    CACHE_EXPIRY: int = Field(default=24 * 3600 * 7)

    CACHE_PATH: str = Field(default="cache")

    HOST_CACHE_PATH: str = Field(default="")

    CACHE_SQLITE_PATH: str = Field(default="")

    TURNSTILE_SECRET: str = Field(default="")

    JWT_SECRET: str = Field(default_factory=lambda: secrets.token_urlsafe(32))

    JWT_EXPIRY_SECONDS: int = Field(default=3600)

    DOCKER_POOL_SIZE: int = Field(default=15)

    S3_ENDPOINT_URL: str = Field(default="")

    S3_ACCESS_KEY_ID: str = Field(default="")

    S3_SECRET_ACCESS_KEY: str = Field(default="")

    S3_BUCKET_NAME: str = Field(default="")

    SHARE: bool = Field(default=False)

    BYPASS_CAPTCHA: bool = Field(default=False)

    CAPTCHA_TEST_TOKEN: str | None = Field(default=None)

    POSTHOG_API_KEY: str | None = Field(default=None)

    POSTHOG_BASE_URL: str = Field(default="https://us.i.posthog.com")

    @model_validator(mode="after")
    def _derive_defaults(self) -> "Settings":
        if not self.JWT_SECRET:
            self.JWT_SECRET = secrets.token_urlsafe(32)

        if not self.ALLOW_ORIGINS:
            self.ALLOW_ORIGINS = [
                self.FRONTEND_URL,
                self.FRONTEND_URL.replace("127.0.0.1", "localhost"),
            ]

        if not self.HOST_CACHE_PATH:
            self.HOST_CACHE_PATH = os.path.abspath(self.CACHE_PATH)

        if not self.CACHE_SQLITE_PATH:
            self.CACHE_SQLITE_PATH = f"sqlite+aiosqlite:///{self.CACHE_PATH}/cache.db"

        self.SHARE = self.SHARE and all(
            [
                self.S3_ENDPOINT_URL,
                self.S3_ACCESS_KEY_ID,
                self.S3_SECRET_ACCESS_KEY,
                self.S3_BUCKET_NAME,
            ]
        )

        return self

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        return (
            init_settings,
            CenterConsoleSettingsSource(settings_cls),
            env_settings,
            dotenv_settings,
            file_secret_settings,
        )


settings = Settings()


async def reload_settings_async():
    await asyncio.to_thread(settings.__init__)


def reload_settings():
    settings.__init__()
