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
from pathlib import Path
from dotenv import load_dotenv

from trading.engine import TradingEngine
from trading.strategies import MeanReversionStrategy, MomentumStrategy, StatArbStrategy
from ws_client import BackendWSClient
from sentiment.analyzer import SentimentAnalyzer

load_dotenv(Path(__file__).parent / ".env")

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
# Risk per trade as a fraction of account equity (default 1%). Set higher to trade bigger.
RISK_PCT = float(os.getenv("RISK_PER_TRADE_PCT", "0.01"))
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

    # All symbols the bot can consider — in live mode these are supplemented by MT5 discovery
    _FOREX_POOL = [
        "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD",
        "EURGBP", "EURJPY", "EURCHF", "EURAUD", "EURCAD", "EURNZD",
        "GBPJPY", "GBPCHF", "GBPAUD", "GBPCAD", "GBPNZD",
        "AUDJPY", "AUDCHF", "AUDCAD", "AUDNZD",
        "CADJPY", "CADCHF", "NZDJPY", "NZDCHF",
        "XAUUSD", "XAGUSD",
    ]

    strategies = [
        MomentumStrategy(symbols=_FOREX_POOL, risk_pct=RISK_PCT),
        MeanReversionStrategy(symbols=_FOREX_POOL, risk_pct=RISK_PCT),
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
        connected = await engine.connect_mt5(
            account=int(os.getenv("MT5_ACCOUNT", "0")),
            password=os.getenv("MT5_PASSWORD", ""),
            server=os.getenv("MT5_SERVER", ""),
        )
        if connected:
            try:
                all_mt5 = mt5.symbols_get() or []
                discovered = [s.name for s in all_mt5 if s.visible and len(s.name) <= 8]
                if len(discovered) > 10:
                    for strat in strategies:
                        strat.symbols = discovered
                    log.info(f"Auto-discovered {len(discovered)} symbols from MT5 broker")
            except Exception as e:
                log.warning(f"MT5 symbol discovery failed, using defaults: {e}")

    # AI key checks
    gemini_key = os.getenv("GEMINI_API_KEY")
    deepseek_key = os.getenv("DEEPSEEK") or os.getenv("DEEPSEEK_API_KEY")
    if gemini_key:
        log.info(f"Gemini API key loaded (ends ...{gemini_key[-6:]})")
    if deepseek_key:
        log.info(f"DeepSeek API key loaded (ends ...{deepseek_key[-6:]})")
    if not gemini_key and not deepseek_key:
        log.warning("=" * 60)
        log.warning("  !! NO AI KEYS SET — AI validation DISABLED !!")
        log.warning("  Add GEMINI_API_KEY and/or DEEPSEEK to your .env file")
        log.warning("=" * 60)

    # Start the bot — give WS a few seconds to connect before engine starts ticking
    # so AI decisions (emit_trade) don't get dropped into a closed socket
    async def engine_delayed():
        await asyncio.sleep(5)
        await engine.run()

    await asyncio.gather(
        ws_client.run(),
        engine_delayed(),
        sentiment.run(),
    )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Bot stopped by user.")
