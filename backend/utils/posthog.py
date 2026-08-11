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
