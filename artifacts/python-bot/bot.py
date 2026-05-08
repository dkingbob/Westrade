"""
AlgoDesk Python Trading Bot
===========================
Connects to the AlgoDesk dashboard via WebSocket, executes trades via MetaTrader 5
(Windows only — falls back to paper/simulation mode on Linux/Mac), and streams
real-time updates back to the dashboard.

Usage:
    cp .env.example .env
    # Edit .env with your credentials
    pip install -r requirements.txt
    python bot.py
"""

import asyncio
import json
import os
import sys
import platform
import logging
from datetime import datetime
from dotenv import load_dotenv

from trading.engine import TradingEngine
from trading.strategies import MeanReversionStrategy, MomentumStrategy, StatArbStrategy
from ws_client import BackendWSClient
from sentiment.analyzer import SentimentAnalyzer

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("algodesk.bot")

BOT_MODE = os.getenv("BOT_MODE", "paper")
WS_URL = os.getenv("ALGODESK_WS_URL", "ws://localhost:80/api/ws")
API_URL = os.getenv("ALGODESK_API_URL", "http://localhost:80/api")
HEARTBEAT_INTERVAL = int(os.getenv("HEARTBEAT_INTERVAL", "10"))
IS_WINDOWS = platform.system() == "Windows"

MT5_AVAILABLE = False
if IS_WINDOWS:
    try:
        import MetaTrader5 as mt5
        MT5_AVAILABLE = True
        log.info("MetaTrader5 library available")
    except ImportError:
        log.warning("MetaTrader5 not installed. Run: pip install MetaTrader5")
else:
    log.info(f"Platform: {platform.system()} — running in simulation mode (MT5 requires Windows)")


async def main():
    log.info("=" * 60)
    log.info("  AlgoDesk Python Trading Bot")
    log.info(f"  Mode: {BOT_MODE.upper()}")
    log.info(f"  MT5: {'Available' if MT5_AVAILABLE else 'Not available (simulation mode)'}")
    log.info(f"  Dashboard: {API_URL}")
    log.info("=" * 60)

    # Initialize components
    sentiment = SentimentAnalyzer()
    ws_client = BackendWSClient(WS_URL, API_URL, HEARTBEAT_INTERVAL)

    strategies = [
        MeanReversionStrategy(symbols=["AAPL", "MSFT", "GOOGL"], risk_pct=0.01, lookback=20, z_threshold=2.0),
        MomentumStrategy(symbols=["NVDA", "TSLA", "AMZN"], risk_pct=0.012, rsi_period=14),
        StatArbStrategy(symbols=["SPY", "QQQ", "JPM"], risk_pct=0.008),
    ]

    engine = TradingEngine(
        mode=BOT_MODE,
        strategies=strategies,
        sentiment_analyzer=sentiment,
        ws_client=ws_client,
        mt5_available=MT5_AVAILABLE,
    )

    # Connect MT5 if available
    if MT5_AVAILABLE and BOT_MODE == "live":
        await engine.connect_mt5(
            account=int(os.getenv("MT5_ACCOUNT", "0")),
            password=os.getenv("MT5_PASSWORD", ""),
            server=os.getenv("MT5_SERVER", ""),
        )

    # Start the bot
    await asyncio.gather(
        ws_client.run(),
        engine.run(),
        sentiment.run(),
    )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Bot stopped by user.")
