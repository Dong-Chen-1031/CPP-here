from settings import settings
from posthog import Posthog

if settings.POSTHOG_API_KEY:
    posthog = Posthog(
        project_api_key=settings.POSTHOG_API_KEY,
        host=settings.POSTHOG_BASE_URL,
    )
