from contextvars import ContextVar

from fastapi.applications import FastAPI
from fastapi.requests import Request
from posthog import Posthog

from settings import settings

posthog = (
    Posthog(
        project_api_key=settings.POSTHOG_API_KEY,
        host=settings.POSTHOG_BASE_URL,
    )
    if settings.POSTHOG_API_KEY
    else None
)

x_posthog_session_id: ContextVar[str | None] = ContextVar(
    "X-PostHog-Session-ID", default=None
)


def make_posthog_middleware(app: FastAPI):
    @app.middleware("http")
    async def posthog_middleware(request: Request, call_next):
        token = x_posthog_session_id.set(request.headers.get("X-PostHog-Session-ID"))
        try:
            response = await call_next(request)
        finally:
            x_posthog_session_id.reset(token)

        return response

    return posthog_middleware
