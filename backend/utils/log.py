import logging
import os
from logging.handlers import TimedRotatingFileHandler

import settings
from opentelemetry._logs import set_logger_provider
from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from rich.console import Console
from rich.logging import RichHandler
from rich.theme import Theme

custom_theme = Theme({"info": "cyan", "warning": "yellow", "error": "bold red"})
console = Console(theme=custom_theme)

log_dir = "logs"
if not os.path.exists(log_dir):
    os.makedirs(log_dir)

# current_time = datetime.datetime.now().strftime("%Y-%m-%d")
# log_file = f"{log_dir}/{current_time}.log"

logger = logging.getLogger()
logger.setLevel(settings.LOG_LEVEL)

rich_handler = RichHandler(
    console=console, rich_tracebacks=True, tracebacks_show_locals=False
)
rich_handler.setLevel(settings.LOG_LEVEL)

file_handler = TimedRotatingFileHandler(
    filename=f"{log_dir}/backend.log",
    encoding="utf-8",
    when="midnight",
    interval=1,
    backupCount=7,
)
file_handler.setLevel(settings.LOG_LEVEL)
file_format = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
file_handler.setFormatter(file_format)


# Posthog
if settings.POSTHOG_API_KEY:
    logger_provider = LoggerProvider()
    set_logger_provider(logger_provider)

    otlp_exporter = OTLPLogExporter(
        endpoint=f"{settings.POSTHOG_BASE_URL}/i/v1/logs",
        headers={"Authorization": f"Bearer {settings.POSTHOG_API_KEY}"},
    )

    # Add processor
    logger_provider.add_log_record_processor(BatchLogRecordProcessor(otlp_exporter))
    logger.addHandler(LoggingHandler(logger_provider=logger_provider))


logger.addHandler(rich_handler)
logger.addHandler(file_handler)
