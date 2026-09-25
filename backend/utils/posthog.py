import logging
from contextvars import ContextVar

from fastapi.applications import FastAPI
from fastapi.requests import Request
from opentelemetry import trace
from opentelemetry._logs import set_logger_provider
from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
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


def add_posthog_middleware(app: FastAPI):
    @app.middleware("http")
    async def posthog_middleware(request: Request, call_next):
        x_posthog_session_id.set(request.headers.get("X-PostHog-Session-ID"))
        return await call_next(request)

    return posthog_middleware


# Posthog
def setup_posthog_logging(logger: logging.Logger):
    if not settings.POSTHOG_API_KEY:
        return None

    resource = Resource.create(
        {
            "service.name": settings.SERVICE_NAME,
            "service.version": settings.VERSION,
            "deployment.environment": "dev" if settings.DEV_MODE else "prod",
        }
    )

    logger_provider = LoggerProvider(resource=resource)
    set_logger_provider(logger_provider)

    class PostHogLogFilter(logging.Filter):
        def filter(self, record):
            if sid := x_posthog_session_id.get():
                record.sessionId = sid
            return True

    otlp_exporter = OTLPLogExporter(
        endpoint=f"{settings.POSTHOG_BASE_URL}/i/v1/logs",
        headers={"Authorization": f"Bearer {settings.POSTHOG_API_KEY}"},
    )

    # Add processor
    logger_provider.add_log_record_processor(BatchLogRecordProcessor(otlp_exporter))
    handler = LoggingHandler(logger_provider=logger_provider)
    handler.addFilter(PostHogLogFilter())
    logger.addHandler(handler)
    return logger_provider


def setup_posthog_tracer(app: FastAPI):
    resource = Resource.create({SERVICE_NAME: settings.SERVICE_NAME})
    provider = TracerProvider(resource=resource)

    exporter = OTLPSpanExporter(
        endpoint=f"{settings.POSTHOG_BASE_URL}/i/v1/traces",
        headers={"Authorization": f"Bearer {settings.POSTHOG_API_KEY}"},
    )

    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    # Skip the per-message ASGI receive/send child spans: every response yields
    # several identical "http send" spans that only add noise to the trace.
    FastAPIInstrumentor.instrument_app(app, exclude_spans=["receive", "send"])
