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
        self.max_position_usd = None
        self.tick_count = 0
        self._mt5 = None

        # Daily session limits
        self.session_start_equity = None
        self.session_start_time = None
        self.session_hours = 24
        self.daily_loss_limit_usd = None
        self.daily_profit_target_usd = None
        self.loss_buffer_usd = None   # stops new trades this $ before loss limit
        self.win_buffer_usd = None    # stops new trades this $ before profit target
        self.in_warning_zone = False

        # AI validation counters
        self.ai_validated = 0
        self.ai_rejected = 0

        # Push sentiment API status into ws_client so heartbeat reports it
        self.ws.sentiment_api_status = self.sentiment.get_api_status()

        # Register handlers
        self.ws.on_kill_switch(self._handle_kill_switch)
        self.ws.on_config_update(self._handle_config_update)

    async def _ai_validate_trade(self, trade: dict, signal: dict) -> bool:
        """Ask Gemini AI whether the trade signal is worth executing. Returns True to allow, False to reject."""
        import os
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            return True

        symbol = trade["symbol"]
        side = trade["side"]
        strategy = trade["strategy"]
        price = trade["entry_price"]
        indicators = signal.get("indicators", {})

        ind_text = ""
        if indicators:
            ind_text = (
                f"- RSI(14): {indicators.get('rsi_14', 'n/a')}\n"
                f"- MACD line: {indicators.get('macd_line', 'n/a')}, signal: {indicators.get('macd_signal', 'n/a')}, histogram: {indicators.get('macd_hist', 'n/a')}\n"
                f"- EMA20: {indicators.get('ema_20', 'n/a')}, EMA50: {indicators.get('ema_50', 'n/a')} → trend: {indicators.get('trend', 'n/a')}\n"
                f"- Bollinger Bands: upper={indicators.get('bb_upper', 'n/a')}, mid={indicators.get('bb_mid', 'n/a')}, lower={indicators.get('bb_lower', 'n/a')}\n"
                f"- Price position in BB: {indicators.get('bb_position_pct', 'n/a')}% (0=lower band, 100=upper band)\n"
                f"- ATR(14): {indicators.get('atr', 'n/a')}\n"
                f"- Z-score(20): {indicators.get('z_score', 'n/a')}\n"
                f"- Last 10 H1 closes: {indicators.get('last_10_h1_closes', 'n/a')}\n"
            )
        else:
            r = signal.get("rsi")
            z = signal.get("z_score")
            ind_text = f"- RSI: {r}\n- Z-score: {z}\n"

        prompt = (
            f"You are a professional forex trading risk analyst. A trading bot wants to place this order:\n"
            f"- Symbol: {symbol}\n"
            f"- Direction: {side} (long=buy, short=sell)\n"
            f"- Strategy: {strategy}\n"
            f"- Entry price: {price}\n\n"
            f"Technical indicators (H1 timeframe):\n{ind_text}\n"
            f"Based on the indicators above, does this trade have a reasonable probability of success?\n"
            f"Consider: trend alignment, momentum confirmation, risk/reward, overbought/oversold conditions.\n"
            f"Respond with only YES or NO followed by one brief sentence explaining why."
        )

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
        body = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"maxOutputTokens": 120, "temperature": 0.1},
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    json=body,
                    timeout=aiohttp.ClientTimeout(total=8),
                ) as resp:
                    if resp.status != 200:
                        log.warning(f"[AI] Gemini API returned {resp.status} — allowing trade")
                        return True
                    data = await resp.json()
                    text = data["candidates"][0]["content"]["parts"][0]["text"].strip()

            upper = text.upper()
            if upper.startswith("YES"):
                decision = "YES"
                reason = text[3:].lstrip(" .,—-").strip() or "signal looks reasonable"
                self.ai_validated += 1
                log.info(f"[AI] {symbol} {side}: {decision} — {reason}")
                await self.ws.emit_trade({"action": "ai_decision", "symbol": symbol, "side": side, "strategy": strategy, "decision": decision, "reason": reason, "price": price})
                return True
            elif upper.startswith("NO"):
                decision = "NO"
                reason = text[2:].lstrip(" .,—-").strip() or "signal rejected"
                self.ai_rejected += 1
                log.info(f"[AI] {symbol} {side}: {decision} — {reason}")
                await self.ws.emit_trade({"action": "ai_decision", "symbol": symbol, "side": side, "strategy": strategy, "decision": decision, "reason": reason, "price": price})
                return False
            else:
                if "YES" in upper:
                    self.ai_validated += 1
                    await self.ws.emit_trade({"action": "ai_decision", "symbol": symbol, "side": side, "strategy": strategy, "decision": "YES", "reason": text, "price": price})
                    return True
                elif "NO" in upper:
                    self.ai_rejected += 1
                    await self.ws.emit_trade({"action": "ai_decision", "symbol": symbol, "side": side, "strategy": strategy, "decision": "NO", "reason": text, "price": price})
                    return False
                log.info(f"[AI] {symbol} {side}: ambiguous response, allowing trade — {text}")
                return True

        except Exception as e:
            log.warning(f"[AI] Gemini validation error ({symbol} {side}): {e} — allowing trade")
            return True

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
            self.session_start_equity = info.equity
            self.session_start_time = datetime.utcnow()
            self._mt5 = mt5
            self.ws.mt5_connected = True
            self.ws.mt5_account_id = str(account)
            self.ws.mt5_server = server
            self.ws.mt5_equity = self.equity
            strategies_module.set_mt5(mt5)
            # Pre-load 200 H1 bars for all strategy symbols so indicators are ready immediately
            all_symbols = list({s for strat in self.strategies for s in strat.symbols})
            strategies_module.initialize_history(all_symbols)
            log.info(f"MT5 connected: account={account}, equity={self.equity:.2f}")
            # Sync real equity to dashboard immediately (don't wait for next heartbeat interval)
            asyncio.create_task(self.ws.send_heartbeat_once())
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
                        extra = cfg.get("botExtra") or {}
                        if extra.get("maxPositionUsd"):
                            self.max_position_usd = float(extra["maxPositionUsd"])
                        if extra.get("dailyLossLimitUsd") is not None:
                            self.daily_loss_limit_usd = float(extra["dailyLossLimitUsd"])
                        if extra.get("dailyProfitTargetUsd") is not None:
                            self.daily_profit_target_usd = float(extra["dailyProfitTargetUsd"])
                        if extra.get("lossBufferUsd") is not None:
                            self.loss_buffer_usd = float(extra["lossBufferUsd"])
                        if extra.get("winBufferUsd") is not None:
                            self.win_buffer_usd = float(extra["winBufferUsd"])
                        if extra.get("sessionHours") is not None:
                            self.session_hours = float(extra["sessionHours"])
                        log.info(f"Loaded config: killSwitch={self.kill_switch_active}, lossLimit=${self.daily_loss_limit_usd}, profitTarget=${self.daily_profit_target_usd}")
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
            elif not config["killSwitchActive"] and self.kill_switch_active:
                self.kill_switch_active = False
                self.running = True
                log.info("Kill switch deactivated — trading resumed")
        if "riskSettings" in config:
            rpt = config["riskSettings"].get("riskPerTradePct", 0.01)
            for s in self.strategies:
                s.risk_pct = rpt
        if "maxPositionUsd" in config:
            self.max_position_usd = config["maxPositionUsd"]
        if "dailyLossLimitUsd" in config:
            self.daily_loss_limit_usd = config["dailyLossLimitUsd"]
            self.in_warning_zone = False  # reset on config change
        if "dailyProfitTargetUsd" in config:
            self.daily_profit_target_usd = config["dailyProfitTargetUsd"]
        if "lossBufferUsd" in config:
            self.loss_buffer_usd = config["lossBufferUsd"]
        if "winBufferUsd" in config:
            self.win_buffer_usd = config["winBufferUsd"]
        if "sessionHours" in config:
            self.session_hours = config["sessionHours"]
            self.session_start_time = datetime.utcnow()  # reset session timer
        log.info("Config updated from dashboard")

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

            # Check session limits after equity update
            await self._check_session_limits()
        except Exception as e:
            log.warning(f"MT5 sync error: {e}")

    async def _check_session_limits(self):
        """Enforce daily loss limit, profit target, and session expiry."""
        if self.session_start_equity is None:
            return

        session_pnl = self.equity - self.session_start_equity

        # Session expired — reset for new session
        if self.session_start_time is not None:
            elapsed_hours = (datetime.utcnow() - self.session_start_time).total_seconds() / 3600
            if elapsed_hours >= self.session_hours:
                self.session_start_equity = self.equity
                self.session_start_time = datetime.utcnow()
                self.in_warning_zone = False
                log.info(f"Session reset after {elapsed_hours:.1f}h")
                await self.ws.emit_trade({"action": "session_reset", "newEquity": self.equity})
                return

        # Broadcast session P&L to dashboard
        await self.ws.emit_trade({
            "action": "session_update",
            "sessionPnl": round(session_pnl, 2),
            "sessionStartEquity": self.session_start_equity,
            "equity": self.equity,
        })

        # Profit target hit — stop for the session
        if self.daily_profit_target_usd is not None and session_pnl >= self.daily_profit_target_usd:
            if self.running:
                self.running = False
                log.info(f"Profit target ${self.daily_profit_target_usd} reached (P&L: ${session_pnl:.2f}) — stopping for session")
                await self.ws.emit_trade({"action": "session_stopped", "reason": "profit_target", "pnl": session_pnl})
            return

        # Win buffer — within this $ of profit target, pause new trades to protect gains
        if self.daily_profit_target_usd is not None and self.win_buffer_usd is not None:
            win_threshold = self.daily_profit_target_usd - self.win_buffer_usd
            if session_pnl >= win_threshold and not self.in_warning_zone:
                self.in_warning_zone = True
                log.info(f"Win buffer: P&L ${session_pnl:.2f} close to target ${self.daily_profit_target_usd} — pausing new trades")
                await self.ws.emit_trade({"action": "session_warning", "type": "win_buffer", "pnl": session_pnl, "target": self.daily_profit_target_usd})
            elif session_pnl < win_threshold and self.in_warning_zone:
                self.in_warning_zone = False

        if self.daily_loss_limit_usd is not None:
            loss = -session_pnl  # positive = loss
            loss_buffer = self.loss_buffer_usd or self.daily_loss_limit_usd * 0.15

            # Hard stop — max loss hit
            if loss >= self.daily_loss_limit_usd:
                if self.running:
                    self.running = False
                    log.warning(f"Loss limit ${self.daily_loss_limit_usd} hit (loss: ${loss:.2f}) — stopping for session")
                    await self._close_all_mt5_positions()
                    await self.ws.emit_trade({"action": "session_stopped", "reason": "loss_limit", "pnl": session_pnl})
                return

            # Loss buffer — within this $ of hard stop, pause new trades
            soft_threshold = self.daily_loss_limit_usd - loss_buffer
            if loss >= soft_threshold and not self.in_warning_zone:
                self.in_warning_zone = True
                log.warning(f"Loss buffer: loss ${loss:.2f} approaching limit ${self.daily_loss_limit_usd}")
                await self.ws.emit_trade({"action": "session_warning", "type": "loss_buffer", "loss": loss, "limit": self.daily_loss_limit_usd})
            elif loss < soft_threshold and self.in_warning_zone:
                self.in_warning_zone = False
                log.info("Exited warning zone — new trades allowed again")

    async def _execute_trade(self, signal: dict):
        """Execute a trade signal (paper or live MT5)."""
        symbol = signal["symbol"]

        if self.kill_switch_active or not self.running:
            return
        if self.in_warning_zone:
            log.debug(f"In warning zone — no new trades")
            return
        if symbol in self.paused_symbols or symbol in self.restricted_assets:
            log.info(f"Symbol {symbol} is paused/restricted — skipping")
            return

        # AI trade validation — build a minimal trade dict for context
        _pre_trade = {
            "symbol": symbol,
            "side": signal["side"],
            "strategy": signal["strategy"],
            "entry_price": signal["price"],
        }
        if not await self._ai_validate_trade(_pre_trade, signal):
            log.info(f"[AI] Trade rejected by Gemini AI — skipping {symbol} {signal['side']}")
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
        if self.max_position_usd is not None:
            position_size = min(position_size, self.max_position_usd)

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
            fill = await self._execute_mt5_order(trade)
            if fill:
                trade["entry_price"] = fill["price"]
                trade["volume"] = fill["volume"]
                await self.ws.emit_trade({"action": "open", "trade": trade})
        else:
            self.open_positions[symbol] = trade
            log.info(f"[PAPER] {trade['side'].upper()} {symbol} @ {trade['entry_price']:.4f} x {trade['quantity']}")
            await self.ws.emit_trade({"action": "open", "trade": trade})

    async def _execute_mt5_order(self, trade: dict):
        """Send a real order to MetaTrader 5. Returns fill info dict on success, None on failure."""
        try:
            mt5 = self._mt5
            symbol = trade["symbol"]

            if not mt5.symbol_select(symbol, True):
                log.warning(f"Symbol {symbol} not available on this broker — skipping")
                return None

            tick = mt5.symbol_info_tick(symbol)
            if tick is None:
                log.warning(f"No tick data for {symbol} — skipping")
                return None

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
                return None
            log.info(f"MT5 order placed: #{result.order} {symbol} {trade['side']} {volume} lots @ {price}")
            return {"price": price, "volume": volume, "ticket": result.order}
        except Exception as e:
            log.error(f"MT5 order error: {e}")
            return None

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
