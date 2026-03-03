import datetime
import logging
import os

from rich.console import Console
from rich.logging import RichHandler
from rich.theme import Theme

custom_theme = Theme({"info": "cyan", "warning": "yellow", "error": "bold red"})
console = Console(theme=custom_theme)

log_dir = "logs"
if not os.path.exists(log_dir):
    os.makedirs(log_dir)

current_time = datetime.datetime.now().strftime("%Y-%m-%d")
log_file = f"{log_dir}/{current_time}.log"

logger = logging.getLogger()
logger.setLevel(logging.INFO)

rich_handler = RichHandler(
    console=console, rich_tracebacks=True, tracebacks_show_locals=False
)
rich_handler.setLevel(logging.INFO)

file_handler = logging.FileHandler(filename=log_file, encoding="utf-8", mode="a")
file_handler.setLevel(logging.DEBUG)
file_format = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
file_handler.setFormatter(file_format)

logger.addHandler(rich_handler)
logger.addHandler(file_handler)
