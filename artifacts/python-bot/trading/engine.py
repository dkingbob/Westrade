""" 
Trading Engine — orchestrates strategy execution, risk checks, and MT5 orders.
"""

import asyncio
import logging
import json
import aiohttp
from datetime import datetime, timedelta
from typing import Optional

import trading.strategies as strategies_module
from trading.auto_tuner import AutoTuner
from trading.brain_gym import BrainGym

log = logging.getLogger("algodesk.engine")

TICK_INTERVAL = 2  # seconds between strategy evaluations
CONFIG_POLL_INTERVAL = 60  # seconds between config polls


def _detect_session(hour: int) -> str:
    if 13 <= hour < 17:
        return "ny_london_overlap"
    if 7 <= hour < 13:
        return "london"
    if 13 <= hour < 22:
        return "ny"
    return "asian"


class TradingEngine:
    ...(full content truncated for this attempt)
