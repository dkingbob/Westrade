"""
Human-like behaviour layer.

Manages:
- Spain working hours (online window)
- Random delays before actions
- Occasional typo + self-correction in messages
- Queuing actions overnight
"""

import asyncio
import logging
import random
import re
from datetime import datetime, time
from typing import Optional

import pytz

import config

log = logging.getLogger(__name__)

_tz = pytz.timezone(config.TIMEZONE)

_TYPO_PAIRS = [
    ("script", "scrtip"),
    ("video", "vdieo"),
    ("content", "contet"),
    ("creative", "cretaive"),
    ("writing", "writng"),
    ("looking", "lookng"),
    ("perfect", "prfect"),
]


def now_local() -> datetime:
    return datetime.now(_tz)


def is_working_hours() -> bool:
    """Return True if current Spain time is within the working window."""
    now = now_local()
    return config.WORK_HOUR_START <= now.hour < config.WORK_HOUR_END


def seconds_until_work_starts() -> float:
    """Seconds until 08:00 Spain time tomorrow (or today if still before start)."""
    now = now_local()
    start_today = now.replace(hour=config.WORK_HOUR_START, minute=0, second=0, microsecond=0)
    if now < start_today:
        return (start_today - now).total_seconds()
    # already past start — next day
    import datetime as dt
    tomorrow = (now + dt.timedelta(days=1)).replace(
        hour=config.WORK_HOUR_START, minute=0, second=0, microsecond=0
    )
    return (tomorrow - now).total_seconds()


async def wait_for_working_hours() -> None:
    """Block until we're inside working hours."""
    if is_working_hours():
        return
    wait_sec = seconds_until_work_starts()
    log.info("Outside working hours. Sleeping %.0f minutes until 08:00 Spain time.", wait_sec / 60)
    await asyncio.sleep(wait_sec)


async def human_delay(label: str = "") -> None:
    """
    Wait a random amount within working hours.
    If outside working hours, sleeps until morning first.
    """
    await wait_for_working_hours()
    delay = random.randint(
        config.DELAY_MIN_MINUTES * 60,
        config.DELAY_MAX_MINUTES * 60,
    )
    log.info("Human delay%s: %.0f minutes.", f" [{label}]" if label else "", delay / 60)
    await asyncio.sleep(delay)


async def delivery_hold() -> None:
    """
    1-3 hour hold before delivering — simulates actual writing time.
    Respects working hours so delivery never happens at 3am.
    """
    await wait_for_working_hours()
    hold = random.randint(
        config.DELIVERY_HOLD_MIN_SECONDS,
        config.DELIVERY_HOLD_MAX_SECONDS,
    )
    log.info("Delivery hold: %.0f minutes.", hold / 60)

    # Sleep in 5-minute chunks so we can re-check working hours
    elapsed = 0
    while elapsed < hold:
        chunk = min(300, hold - elapsed)
        await asyncio.sleep(chunk)
        elapsed += chunk
        if not is_working_hours():
            # Pause until morning, then resume the remaining hold
            remaining = hold - elapsed
            log.info("Working hours ended mid-hold. Pausing %.0f minutes remaining.", remaining / 60)
            await wait_for_working_hours()


def maybe_add_typo(text: str) -> tuple[str, bool]:
    """
    With ~15% probability, introduce one typo then immediately correct it.
    Returns (possibly_modified_text, typo_added).

    The correction is appended as a second message — caller must send two messages.
    """
    if random.random() > 0.15:
        return text, False

    for correct, typo in _TYPO_PAIRS:
        if correct in text.lower():
            # Replace only the first occurrence (case-insensitive)
            pattern = re.compile(re.escape(correct), re.IGNORECASE)
            typo_text = pattern.sub(typo, text, count=1)
            return typo_text, True

    return text, False


def correction_message(original_text: str) -> str:
    """Return a quick self-correction message after a typo."""
    for correct, typo in _TYPO_PAIRS:
        if typo in original_text.lower():
            return f"*{correct}"
    return "*(typo)"
