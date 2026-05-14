"""
Trading Engine — orchestrates strategy execution, risk checks, and MT5 orders.
"""

import asyncio
import logging
import json
import aiohttp
from datetime import datetime
from typing import Optional

import trading.strategies as strategies_module

log = logging.getLogger("algodesk.engine")

TICK_INTERVAL = 2  # seconds between strategy evaluations
CONFIG_POLL_INTERVAL = 60  # seconds between config polls


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
        self.restricted_assets = set()
        self.open_positions = {}
        self.equity = 100_000.0
        self.tick_count = 0
        self._mt5 = None

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
            self._mt5 = mt5
            self.ws.mt5_connected = True
            self.ws.mt5_account_id = str(account)
            self.ws.mt5_server = server
            self.ws.mt5_equity = self.equity
            # Wire real prices into strategies
            strategies_module.set_mt5(mt5)
            log.info(f"MT5 connected: account={account}, equity={self.equity:.2f}")
            return True
        except Exception as e:
            log.error(f"MT5 connection error: {e}")
            return False

    async def load_initial_config(self):
        """Fetch current config from the API on startup."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.ws.api_url}/bot/config",
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as resp:
                    if resp.status == 200:
                        cfg = await resp.json()
                        self.kill_switch_active = cfg.get("killSwitchActive", False)
                        self.paused_symbols = set(cfg.get("pausedSymbols") or [])
                        self.restricted_assets = set(cfg.get("restrictedAssets") or [])
                        log.info(f"Loaded config: killSwitch={self.kill_switch_active}, paused={self.paused_symbols}")
        except Exception as e:
            log.warning(f"Could not load initial config: {e}")

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.ws.api_url}/risk/settings",
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as resp:
                    if resp.status == 200:
                        risk = await resp.json()
                        # Apply risk_per_trade to strategies
                        rpt = risk.get("riskPerTradePct", 0.01)
                        for s in self.strategies:
                            s.risk_pct = rpt
                        log.info(f"Loaded risk settings: riskPerTrade={rpt}")
        except Exception as e:
            log.warning(f"Could not load risk settings: {e}")

    async def _poll_config(self):
        """Periodically re-fetch config as a fallback if WS message was missed."""
        while self.running:
            await asyncio.sleep(CONFIG_POLL_INTERVAL)
            await self.load_initial_config()

    async def _handle_kill_switch(self):
        """React to kill switch from dashboard."""
        self.kill_switch_active = True
        self.running = False
        log.warning("Kill switch activated — bot stopped")
        if self.mode == "live" and self._mt5 is not None:
            await self._close_all_mt5_positions()

    async def _handle_config_update(self, config: dict):
        """Apply config updates from the dashboard."""
        if "pausedSymbols" in config:
            self.paused_symbols = set(config["pausedSymbols"])
        if "restrictedAssets" in config:
            self.restricted_assets = set(config["restrictedAssets"])
        if "killSwitchActive" in config:
            if config["killSwitchActive"] and not self.kill_switch_active:
                await self._handle_kill_switch()
            elif not config["killSwitchActive"]:
                self.kill_switch_active = False
                log.info("Kill switch deactivated")
        if "riskSettings" in config:
            rpt = config["riskSettings"].get("riskPerTradePct", 0.01)
            for s in self.strategies:
                s.risk_pct = rpt
        log.info(f"Config updated from dashboard")

    async def _close_all_mt5_positions(self):
        """Close all open MT5 positions (live mode kill switch)."""
        try:
            mt5 = self._mt5
            positions = mt5.positions_get()
            if not positions:
                return
            for pos in positions:
                tick = mt5.symbol_info_tick(pos.symbol)
                if tick is None:
                    continue
                close_type = mt5.ORDER_TYPE_SELL if pos.type == 0 else mt5.ORDER_TYPE_BUY
                price = tick.bid if pos.type == 0 else tick.ask
                request = {
                    "action": mt5.TRADE_ACTION_DEAL,
                    "symbol": pos.symbol,
                    "volume": pos.volume,
                    "type": close_type,
                    "position": pos.ticket,
                    "price": price,
                    "deviation": 20,
                    "magic": 202500,
                    "comment": "AlgoDesk/KillSwitch",
                    "type_time": mt5.ORDER_TIME_GTC,
                    "type_filling": mt5.ORDER_FILLING_FOK,
                }
                result = mt5.order_send(request)
                if result.retcode == mt5.TRADE_RETCODE_DONE:
                    log.info(f"Closed position #{pos.ticket} {pos.symbol}")
                else:
                    log.error(f"Failed to close #{pos.ticket}: {result.comment}")
        except Exception as e:
            log.error(f"Error closing MT5 positions: {e}")

    async def _close_all_positions(self, reason: str = ""):
        """Close all open positions (paper: mark closed; live: send MT5 close orders)."""
        if self.mode == "live" and self._mt5 is not None:
            await self._close_all_mt5_positions()
        closed = []
        for symbol, position in list(self.open_positions.items()):
            closed.append({"symbol": symbol, "reason": reason, **position})
            del self.open_positions[symbol]
        if closed:
            await self.ws.emit_trade({"action": "force_close", "positions": closed, "reason": reason})
            log.info(f"Closed {len(closed)} positions: {reason}")

    async def _sync_mt5_positions(self):
        """Sync real MT5 positions to the dashboard."""
        if self._mt5 is None:
            return
        try:
            mt5 = self._mt5
            # Update equity
            info = mt5.account_info()
            if info:
                self.equity = info.equity
                self.ws.mt5_equity = self.equity

            positions = mt5.positions_get() or []
            pos_list = []
            for pos in positions:
                tick = mt5.symbol_info_tick(pos.symbol)
                current_price = (tick.ask + tick.bid) / 2 if tick else pos.price_open
                pnl = pos.profit
                pos_list.append({
                    "ticket": pos.ticket,
                    "symbol": pos.symbol,
                    "side": "long" if pos.type == 0 else "short",
                    "volume": pos.volume,
                    "entry_price": pos.price_open,
                    "current_price": current_price,
                    "pnl": pnl,
                    "strategy": pos.comment.replace("AlgoDesk/", "") if pos.comment else "bot",
                })
            await self.ws.emit_position_update(pos_list)
        except Exception as e:
            log.warning(f"MT5 sync error: {e}")

    async def _execute_trade(self, signal: dict):
        """Execute a trade signal (paper or live MT5)."""
        symbol = signal["symbol"]

        if self.kill_switch_active:
            return
        if symbol in self.paused_symbols or symbol in self.restricted_assets:
            log.info(f"Symbol {symbol} is paused/restricted — skipping")
            return

        # Don't open another position in same symbol
        if self.mode == "live" and self._mt5 is not None:
            existing = self._mt5.positions_get(symbol=symbol)
            if existing:
                return
        elif symbol in self.open_positions:
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
            self.open_positions[symbol] = trade
            log.info(f"[PAPER] {trade['side'].upper()} {symbol} @ {trade['entry_price']:.4f} x {trade['quantity']}")

        await self.ws.emit_trade({"action": "open", "trade": trade})

    async def _execute_mt5_order(self, trade: dict):
        """Send a real order to MetaTrader 5."""
        try:
            mt5 = self._mt5
            symbol = trade["symbol"]

            if not mt5.symbol_select(symbol, True):
                log.warning(f"Symbol {symbol} not available on this broker — skipping")
                return

            tick = mt5.symbol_info_tick(symbol)
            if tick is None:
                log.warning(f"No tick data for {symbol} — skipping")
                return

            order_type = mt5.ORDER_TYPE_BUY if trade["side"] == "long" else mt5.ORDER_TYPE_SELL
            price = tick.ask if trade["side"] == "long" else tick.bid

            info = mt5.symbol_info(symbol)
            vol_min = info.volume_min if info else 0.01
            vol_max = info.volume_max if info else 10.0
            vol_step = info.volume_step if info else 0.01
            raw_lots = float(trade["quantity"]) / 100_000
            volume = round(round(raw_lots / vol_step) * vol_step, 2)
            volume = max(vol_min, min(vol_max, volume))

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
                "type_filling": mt5.ORDER_FILLING_FOK,
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

        # Load config from API before first tick
        await self.load_initial_config()

        # Start config polling in background
        asyncio.create_task(self._poll_config())

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

            # Sync real MT5 positions every 5 ticks
            if self.tick_count % 5 == 0:
                if self.mode == "live" and self._mt5 is not None:
                    await self._sync_mt5_positions()
                else:
                    positions = list(self.open_positions.values())
                    await self.ws.emit_position_update(positions)

            await asyncio.sleep(TICK_INTERVAL)
