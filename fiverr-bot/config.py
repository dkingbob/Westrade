import os
from dotenv import load_dotenv

load_dotenv()


def _require(key: str) -> str:
    val = os.getenv(key)
    if not val:
        raise EnvironmentError(f"Missing required env var: {key}")
    return val


GMAIL_ADDRESS = _require("GMAIL_ADDRESS")
GMAIL_APP_PASSWORD = _require("GMAIL_APP_PASSWORD")
ANTHROPIC_API_KEY = _require("ANTHROPIC_API_KEY")
TELEGRAM_BOT_TOKEN = _require("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = _require("TELEGRAM_CHAT_ID")
FIVERR_EMAIL = _require("FIVERR_EMAIL")
FIVERR_PASSWORD = _require("FIVERR_PASSWORD")
GOOGLE_CALENDAR_ID = os.getenv("GOOGLE_CALENDAR_ID", "")

# Spain timezone (CET winter / CEST summer)
TIMEZONE = "Europe/Madrid"

# Working hours (local Spain time) — bot is "online" during this window
WORK_HOUR_START = 8   # 08:00
WORK_HOUR_END = 23    # 23:00

# Human-like delay range when the bot is online (minutes)
DELAY_MIN_MINUTES = 8
DELAY_MAX_MINUTES = 45

# Additional hold before delivery (seconds) — looks like actual work
DELIVERY_HOLD_MIN_SECONDS = 3600   # 1 hour
DELIVERY_HOLD_MAX_SECONDS = 10800  # 3 hours

# Gmail IMAP server
GMAIL_IMAP_HOST = "imap.gmail.com"
GMAIL_IMAP_PORT = 993

# State directory — one JSON file per open order
ORDERS_DIR = "orders"
