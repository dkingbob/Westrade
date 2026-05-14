"""
Trading Engine — orchestrates strategy execution, risk checks, and MT5 orders.
"""

import asyncio
import logging
import json
from datetime import datetime
from typing import Optional

log = logging.getLogger("algodesk.engine")

TICK_INTERVAL = 2  # seconds between strategy evaluations


class TradingEngine:
    def __init__(self, mode: str, strategies: list, sentiment_analyzer, ws_client, mt5_available: bool):
        self.mode = mode  # "paper" | "live"
        self.strategies = strategies
        self.sentiment = sentiment_analyzer
        self.ws = ws_client
        self.mt5_available = mt5_available
        self.running = False
        self.kill_switch_active = False
        self.paused_symbols = set()
        self.open_positions = {}
        self.equity = 100_000.0
        self.tick_count = 0

        # Register handlers
        self.ws.on_kill_switch(self._handle_kill_switch)
        self.ws.on_config_update(self._handle_config_update)

    async def connect_mt5(self, account: int, password: str, server: str):
        """Initialize MT5 connection (Windows only, live mode)."""
        try:
            import MetaTrader5 as mt5
            if not mt5.initialize():
                log.error("MT5 initialize() failed")
                return False
            if not mt5.login(account, password=password, server=server):
                log.error(f"MT5 login failed: {mt5.last_error()}")
                return False
            info = mt5.account_info()
            self.equity = info.equity
            self.ws.mt5_connected = True
            self.ws.mt5_account_id = str(account)
            self.ws.mt5_server = server
            self.ws.mt5_equity = self.equity
            log.info(f"MT5 connected: account={account}, equity={self.equity:.2f}")
            return True
        except Exception as e:
            log.error(f"MT5 connection error: {e}")
            return False

    async def _handle_kill_switch(self):
        """React to kill switch from dashboard."""
        self.kill_switch_active = True
        log.warning("Kill switch activated — closing all positions")
        await self._close_all_positions(reason="Kill switch")

    async def _handle_config_update(self, config: dict):
        """Apply config updates from the dashboard."""
        if "pausedSymbols" in config:
            self.paused_symbols = set(config["pausedSymbols"])
        if "killSwitchActive" in config:
            if config["killSwitchActive"] and not self.kill_switch_active:
                await self._handle_kill_switch()
            elif not config["killSwitchActive"]:
                self.kill_switch_active = False
                log.info("Kill switch deactivated")
        log.info(f"Config updated: {config}")

    async def _close_all_positions(self, reason: str = ""):
        """Close all open positions (paper: mark closed; live: send MT5 close orders)."""
        closed = []
        for symbol, position in list(self.open_positions.items()):
            closed.append({"symbol": symbol, "reason": reason, **position})
            del self.open_positions[symbol]

        if closed:
            await self.ws.emit_trade({"action": "force_close", "positions": closed, "reason": reason})
            log.info(f"Closed {len(closed)} positions: {reason}")

    async def _execute_trade(self, signal: dict):
        """Execute a trade signal (paper or live MT5)."""
        symbol = signal["symbol"]

        if self.kill_switch_active:
            log.warning(f"Kill switch active — skipping trade for {symbol}")
            return
        if symbol in self.paused_symbols:
            log.info(f"Symbol {symbol} is paused — skipping")
            return

        sentiment_score = self.sentiment.get_score()
        sentiment_multiplier = max(0.5, min(1.5, sentiment_score / 50.0))

        position_size = self.equity * signal.get("risk_pct", 0.01) * sentiment_multiplier

        trade = {
            "symbol": symbol,
            "side": signal["side"],
            "strategy": signal["strategy"],
            "entry_price": signal["price"],
            "quantity": round(position_size / signal["price"], 4),
            "sentiment_multiplier": round(sentiment_multiplier, 4),
            "z_score": signal.get("z_score"),
            "timestamp": datetime.utcnow().isoformat(),
            "mode": self.mode,
        }

        if self.mode == "live" and self.mt5_available:
            await self._execute_mt5_order(trade)
        else:
            # Paper mode: track in memory
            self.open_positions[symbol] = trade
            log.info(f"[PAPER] {trade['side'].upper()} {symbol} @ {trade['entry_price']:.4f} x {trade['quantity']}")

        await self.ws.emit_trade({"action": "open", "trade": trade})

    async def _execute_mt5_order(self, trade: dict):
        """Send a real order to MetaTrader 5."""
        try:
            import MetaTrader5 as mt5
            symbol = trade["symbol"]

            # Ensure symbol is in Market Watch
            if not mt5.symbol_select(symbol, True):
                log.warning(f"Symbol {symbol} not available on this broker — skipping")
                return

            tick = mt5.symbol_info_tick(symbol)
            if tick is None:
                log.warning(f"No tick data for {symbol} — skipping")
                return

            order_type = mt5.ORDER_TYPE_BUY if trade["side"] == "long" else mt5.ORDER_TYPE_SELL
            price = tick.ask if trade["side"] == "long" else tick.bid

            # Enforce minimum volume for the symbol
            info = mt5.symbol_info(symbol)
            volume = max(float(trade["quantity"]), info.volume_min if info else 0.01)
            volume = round(volume, 2)

            request = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": symbol,
                "volume": volume,
                "type": order_type,
                "price": price,
                "deviation": 10,
                "magic": 202500,
                "comment": f"AlgoDesk/{trade['strategy']}",
                "type_time": mt5.ORDER_TIME_GTC,
                "type_filling": mt5.ORDER_FILLING_IOC,
            }
            result = mt5.order_send(request)
            if result.retcode != mt5.TRADE_RETCODE_DONE:
                log.error(f"MT5 order failed: {result.comment}")
            else:
                log.info(f"MT5 order placed: #{result.order} {symbol} {trade['side']} {volume} lots @ {price}")
        except Exception as e:
            log.error(f"MT5 order error: {e}")

    async def run(self):
        """Main engine loop — ticks strategies every TICK_INTERVAL seconds."""
        self.running = True
        log.info(f"Trading engine started ({self.mode} mode)")

        while self.running:
            self.tick_count += 1

            if not self.kill_switch_active:
                for strategy in self.strategies:
                    try:
                        signals = await strategy.generate_signals()
                        for signal in signals:
                            await self._execute_trade(signal)
                    except Exception as e:
                        log.error(f"Strategy error ({strategy.name}): {e}")

            # Emit position update every 5 ticks
            if self.tick_count % 5 == 0:
                positions = list(self.open_positions.values())
                await self.ws.emit_position_update(positions)

            await asyncio.sleep(TICK_INTERVAL)
