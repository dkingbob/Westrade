"""
Trading Engine — orchestrates strategy execution, risk checks, and MT5 orders.
"""

import asyncio
import collections
import logging
import json
import os
import time
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
        self.max_open_positions: Optional[int] = None
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

        # Interval trading: trade for N hours, pause for M hours, repeat
        # Both None means continuous trading (no interval)
        self.interval_trade_hours: Optional[float] = None
        self.interval_pause_hours: Optional[float] = None
        self._interval_window_start: Optional[datetime] = None
        self._interval_paused: bool = False

        # AutoTuner — adaptive parameter optimizer and self-learner
        self.tuner = AutoTuner(strategies=strategies, api_url=ws_client.api_url)
        self._last_mt5_positions: list = []  # tracks previous sync so we can detect closures
        self._symbol_cooldowns: dict = {}  # symbol -> datetime of last close, prevents instant re-entry
        self.reentry_cooldown_minutes: float = 30.0
        self.block_on_ai_error: bool = True   # True = reject trade when all AI providers fail
        self.ai_enabled: bool = True          # False = skip AI entirely, auto-approve all signals
        self._ai_cache: dict = {}             # (symbol, direction) -> (result, expires_at)
        self._ai_cache_ttl: int = 60          # seconds to reuse a cached AI answer
        self._ai_call_times: collections.deque = collections.deque()  # rate limiter timestamps
        self._ai_rpm_limit: int = 8           # calls/min ceiling; raised to 25 when Groq is active
        self._ai_rate_lock = None             # asyncio.Lock — created lazily after event loop starts
        self._new_trades_this_tick: int = 0   # cap new positions per scan cycle
        self.max_new_trades_per_tick: int = 2  # never open more than 2 positions per 60s scan
        self._brain_gym_ran_this_weekend: bool = False  # run once per weekend downtime window
        self._brain_gym_done_this_weekend: bool = False  # set when analysis fully completes

        # Push sentiment API status into ws_client so heartbeat reports it
        self.ws.sentiment_api_status = self.sentiment.get_api_status()

        # Register handlers
        self.ws.on_kill_switch(self._handle_kill_switch)
        self.ws.on_config_update(self._handle_config_update)

    async def _emit_log(self, category: str, message: str, level: str = "info"):
        """Emit a structured log entry to the dashboard Bot Feed page."""
        log_fn = log.warning if level == "warn" else log.debug if level == "debug" else log.info
        log_fn(f"[{category}] {message}")
        await self.ws.emit_trade({
            "action": "bot_log",
            "category": category,
            "message": message,
            "level": level,
            "timestamp": datetime.utcnow().isoformat(),
        })

    async def _call_gemini(self, api_key: str, prompt: str) -> str:
        """Call Gemini — tries model names in order until one works. Returns 'YES', 'NO', or 'ERROR'."""
        import os
        models = [
            os.environ.get("GEMINI_MODEL", "").strip(),
            "gemini-2.5-flash",
            "gemini-2.5-flash-preview-05-20",
            "gemini-2.5-flash-preview-04-17",
            "gemini-2.0-flash",
            "gemini-1.5-flash-latest",
        ]
        models = [m for m in models if m]  # drop empty
        body = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"maxOutputTokens": 120, "temperature": 0.1},
        }
        async with aiohttp.ClientSession() as session:
            for model in models:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
                try:
                    async with session.post(url, json=body, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                        if resp.status == 404:
                            log.debug(f"[AI/Gemini] {model} not found, trying next...")
                            continue
                        if resp.status == 429:
                            log.warning("[AI/Gemini] Rate limited — waiting 8s then retrying once...")
                            await asyncio.sleep(8)
                            async with session.post(url, json=body, timeout=aiohttp.ClientTimeout(total=15)) as retry:
                                if retry.status != 200:
                                    log.warning(f"[AI/Gemini] Retry failed HTTP {retry.status} — free tier: 10 req/min. Upgrade at aistudio.google.com")
                                    return "ERROR"
                                resp = retry
                        if resp.status != 200:
                            log.warning(f"[AI/Gemini] {model} HTTP {resp.status}")
                            return "ERROR"
                        data = await resp.json()
                        text = data["candidates"][0]["content"]["parts"][0]["text"].strip().upper()
                        log.info(f"[AI/Gemini] {model} responded OK")
                        if text.startswith("YES") or "YES" in text[:10]:
                            return "YES"
                        if text.startswith("NO") or "NO" in text[:10]:
                            return "NO"
                        return "YES"  # ambiguous → allow
                except Exception as e:
                    log.warning(f"[AI/Gemini] {model} error: {e}")
                    continue
        log.warning("[AI/Gemini] All model names exhausted — no response")
        return "ERROR"

    async def _call_deepseek(self, api_key: str, prompt: str) -> str:
        """Call DeepSeek Chat API. Returns 'YES', 'NO', or 'ERROR'."""
        url = "https://api.deepseek.com/v1/chat/completions"
        body = {
            "model": "deepseek-chat",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 120,
            "temperature": 0.1,
        }
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=body, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status == 402:
                        log.warning("[AI/DeepSeek] HTTP 402 — API requires paid credits (add balance at platform.deepseek.com). Using Gemini only.")
                        return "ERROR"
                    if resp.status != 200:
                        log.warning(f"[AI/DeepSeek] HTTP {resp.status}")
                        return "ERROR"
                    data = await resp.json()
                    text = data["choices"][0]["message"]["content"].strip().upper()
                    if text.startswith("YES") or "YES" in text[:10]:
                        return "YES"
                    if text.startswith("NO") or "NO" in text[:10]:
                        return "NO"
                    return "YES"
        except Exception as e:
            log.warning(f"[AI/DeepSeek] Error: {e}")
            return "ERROR"

    async def _ai_rate_check(self):
        """Block until we are within the per-minute rate limit for AI calls."""
        if self._ai_rate_lock is None:
            self._ai_rate_lock = asyncio.Lock()
        async with self._ai_rate_lock:
            now = time.monotonic()
            while self._ai_call_times and now - self._ai_call_times[0] > 60:
                self._ai_call_times.popleft()
            if len(self._ai_call_times) >= self._ai_rpm_limit:
                wait_for = 61.0 - (now - self._ai_call_times[0])
                if wait_for > 0:
                    log.info(f"[AI] Rate limiter: {len(self._ai_call_times)}/{self._ai_rpm_limit} calls/min — queued, waiting {wait_for:.1f}s")
                    await asyncio.sleep(wait_for)
                    now = time.monotonic()
                    while self._ai_call_times and now - self._ai_call_times[0] > 60:
                        self._ai_call_times.popleft()
            self._ai_call_times.append(time.monotonic())

    async def _call_groq(self, api_key: str, prompt: str) -> str:
        """Call Groq (free tier: 30 RPM, Llama 3.1 8B). Returns 'YES', 'NO', or 'ERROR'."""
        url = "https://api.groq.com/openai/v1/chat/completions"
        body = {
            "model": "llama-3.1-8b-instant",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 120,
            "temperature": 0.1,
        }
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=body, headers=headers, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    if resp.status == 429:
                        log.warning("[AI/Groq] Rate limited — waiting 8s then retrying...")
                        await asyncio.sleep(8)
                        async with session.post(url, json=body, headers=headers, timeout=aiohttp.ClientTimeout(total=15)) as retry:
                            if retry.status != 200:
                                log.warning(f"[AI/Groq] Retry failed HTTP {retry.status}")
                                return "ERROR"
                            resp = retry
                    if resp.status != 200:
                        log.warning(f"[AI/Groq] HTTP {resp.status}")
                        return "ERROR"
                    data = await resp.json()
                    text = data["choices"][0]["message"]["content"].strip().upper()
                    if text.startswith("YES") or "YES" in text[:10]:
                        return "YES"
                    if text.startswith("NO") or "NO" in text[:10]:
                        return "NO"
                    return "YES"
        except Exception as e:
            log.warning(f"[AI/Groq] Error: {e}")
            return "ERROR"

    async def _ai_validate_trade(self, trade: dict, signal: dict) -> bool:
        """Run Gemini and/or DeepSeek in parallel. Trade only if at least one says YES and none say NO."""
        if not self.ai_enabled:
            await self.ws.emit_trade({
                "action": "ai_decision", "symbol": trade["symbol"], "side": trade["side"],
                "strategy": trade["strategy"], "decision": "YES", "price": trade["entry_price"],
                "reason": "AI validation disabled — auto-approved",
                "votes": {},
            })
            self.ai_validated += 1
            return True
        gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
        deepseek_key = (os.environ.get("DEEPSEEK") or os.environ.get("DEEPSEEK_API_KEY") or "").strip()
        groq_key = os.environ.get("GROQ_API_KEY", "").strip()

        # Groq free tier is 30 RPM — much more generous than Gemini's 10 RPM
        self._ai_rpm_limit = 25 if groq_key else 8

        symbol = trade["symbol"]
        side = trade["side"]
        strategy = trade["strategy"]
        price = trade["entry_price"]

        if not gemini_key and not deepseek_key and not groq_key:
            log.warning(f"[AI] No AI keys found (GROQ_API_KEY / GEMINI_API_KEY / DEEPSEEK). Trade blocked.")
            await self.ws.emit_trade({
                "action": "ai_decision", "symbol": symbol, "side": side, "strategy": strategy,
                "decision": "NO", "price": price,
                "reason": "No AI keys configured. Add GROQ_API_KEY (free at console.groq.com) to your .env file.",
            })
            return False

        # Cache check — reuse AI answer for same symbol+direction within TTL (avoids rate limits)
        # Rate gate — queue this call until we are within the per-minute ceiling
        cache_key = (symbol, side)
        now = datetime.utcnow()
        if cache_key in self._ai_cache:
            cached_result, expires_at = self._ai_cache[cache_key]
            if now < expires_at:
                log.info(f"[AI] {symbol} {side} — using cached answer ({cached_result}) — {(expires_at - now).seconds}s remaining")
                await self.ws.emit_trade({
                    "action": "ai_decision", "symbol": symbol, "side": side, "strategy": strategy,
                    "decision": cached_result, "price": price,
                    "reason": f"Cached AI answer ({cached_result}) — reusing to avoid rate limits",
                    "votes": {"Gemini": cached_result, "DeepSeek": "—"},
                })
                if cached_result == "YES":
                    self.ai_validated += 1
                    return True
                else:
                    self.ai_rejected += 1
                    return False

        indicators = signal.get("indicators", {})
        if indicators:
            ind_text = (
                f"- RSI(14): {indicators.get('rsi_14', 'n/a')}\n"
                f"- MACD line: {indicators.get('macd_line', 'n/a')}, signal: {indicators.get('macd_signal', 'n/a')}, histogram: {indicators.get('macd_hist', 'n/a')}\n"
                f"- EMA20: {indicators.get('ema_20', 'n/a')}, EMA50: {indicators.get('ema_50', 'n/a')} — trend: {indicators.get('trend', 'n/a')}\n"
                f"- Bollinger Bands: upper={indicators.get('bb_upper', 'n/a')}, mid={indicators.get('bb_mid', 'n/a')}, lower={indicators.get('bb_lower', 'n/a')}\n"
                f"- Price position in BB: {indicators.get('bb_position_pct', 'n/a')}% (0=lower, 100=upper)\n"
                f"- ATR(14): {indicators.get('atr', 'n/a')}, Z-score(20): {indicators.get('z_score', 'n/a')}\n"
                f"- Last 10 H1 closes: {indicators.get('last_10_h1_closes', 'n/a')}\n"
            )
        else:
            ind_text = f"- RSI: {signal.get('rsi', 'n/a')}\n- Z-score: {signal.get('z_score', 'n/a')}\n"

        # Fetch Depth of Market from MT5 if connected — gives AI real order flow data
        dom_text = ""
        if self._mt5 is not None:
            try:
                mt5 = self._mt5
                mt5.market_book_add(symbol)
                book = mt5.market_book_get(symbol)
                if book and len(book) > 0:
                    asks = sorted([(b.price, b.volume) for b in book if b.type in (1, 2)], key=lambda x: x[0])[:5]
                    bids = sorted([(b.price, b.volume) for b in book if b.type in (-1, -2)], key=lambda x: -x[0])[:5]
                    if asks or bids:
                        dom_text = "\nDepth of Market (live order book):\n"
                        dom_text += f"  Asks: {', '.join(f'{p:.5f}×{v:.2f}' for p, v in asks)}\n"
                        dom_text += f"  Bids: {', '.join(f'{p:.5f}×{v:.2f}' for p, v in bids)}\n"
                        total_ask_vol = sum(v for _, v in asks)
                        total_bid_vol = sum(v for _, v in bids)
                        if total_ask_vol > 0 and total_bid_vol > 0:
                            ratio = total_bid_vol / total_ask_vol
                            sentiment = "buyers dominating" if ratio > 1.1 else "sellers dominating" if ratio < 0.9 else "balanced"
                            dom_text += f"  Bid/Ask vol ratio: {ratio:.2f} ({sentiment})\n"
            except Exception:
                pass

        prompt = (
            f"You are a professional forex trading risk analyst. A trading bot wants to place this order:\n"
            f"- Symbol: {symbol}\n- Direction: {side} (long=buy, short=sell)\n"
            f"- Strategy: {strategy}\n- Entry price: {price}\n\n"
            f"Technical indicators (H1 timeframe):\n{ind_text}"
            f"{dom_text}\n"
            f"Does this trade have a reasonable probability of success?\n"
            f"Consider: trend alignment, momentum, risk/reward, overbought/oversold conditions, and order flow if available.\n"
            f"Respond with only YES or NO followed by one brief reason."
        )

        # Rate gate — queue if at the per-minute ceiling before hitting any API
        await self._ai_rate_check()

        # Run available AIs in parallel
        tasks = []
        labels = []
        if groq_key:
            tasks.append(self._call_groq(groq_key, prompt))
            labels.append("Groq")
        if gemini_key:
            tasks.append(self._call_gemini(gemini_key, prompt))
            labels.append("Gemini")
        if deepseek_key:
            tasks.append(self._call_deepseek(deepseek_key, prompt))
            labels.append("DeepSeek")

        results = await asyncio.gather(*tasks)
        log.info(f"[AI] {symbol} {side} — {', '.join(f'{l}:{r}' for l, r in zip(labels, results))}")

        # Tally votes (ignore errors)
        valid = [(l, r) for l, r in zip(labels, results) if r != "ERROR"]
        no_votes = [l for l, r in valid if r == "NO"]
        yes_votes = [l for l, r in valid if r == "YES"]

        if no_votes:
            decision = "NO"
            reason = f"Rejected by {', '.join(no_votes)}"
            self.ai_rejected += 1
        elif yes_votes:
            decision = "YES"
            reason = f"Approved by {', '.join(yes_votes)}"
            self.ai_validated += 1
        else:
            # All AI providers failed — block by default (safer than allowing blind trades)
            if self.block_on_ai_error:
                decision = "NO"
                reason = "AI unavailable — trade blocked (all providers failed)"
                self.ai_rejected += 1
            else:
                decision = "YES"
                reason = "AI services unavailable — trade allowed by default"
                self.ai_validated += 1

        # Store real YES/NO answers in cache — skip caching ERROR outcomes
        if decision in ("YES", "NO") and (yes_votes or no_votes):
            self._ai_cache[cache_key] = (decision, now + timedelta(seconds=self._ai_cache_ttl))
            log.debug(f"[AI] Cached {symbol} {side} → {decision} for {self._ai_cache_ttl}s")

        await self.ws.emit_trade({
            "action": "ai_decision", "symbol": symbol, "side": side, "strategy": strategy,
            "decision": decision, "reason": reason, "price": price,
            "votes": {label: result for label, result in zip(labels, results)},
        })
        return decision == "YES"

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
                        if extra.get("intervalTradeHours") is not None:
                            self.interval_trade_hours = float(extra["intervalTradeHours"])
                        if extra.get("intervalPauseHours") is not None:
                            self.interval_pause_hours = float(extra["intervalPauseHours"])
                        if extra.get("autoTunerEnabled") is not None:
                            self.tuner.enabled = bool(extra["autoTunerEnabled"])
                        self.tuner.mode = extra.get("autoTunerMode", "guided")
                        if "aiEnabled" in extra:
                            self.ai_enabled = bool(extra["aiEnabled"])
                        log.info(f"Loaded config: killSwitch={self.kill_switch_active}, lossLimit=${self.daily_loss_limit_usd}, profitTarget=${self.daily_profit_target_usd}, interval={self.interval_trade_hours}h/{self.interval_pause_hours}h, autoTuner={self.tuner.enabled}, tunerMode={self.tuner.mode}")
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
                        self.max_open_positions = int(risk.get("maxOpenPositions", 5))
                        log.info(f"Loaded risk settings: riskPerTrade={rpt}, maxOpenPositions={self.max_open_positions}")
        except Exception as e:
            log.warning(f"Could not load risk settings: {e}")

    async def _poll_config(self):
        """Periodically re-fetch config as a fallback if WS message was missed."""
        while self.running:
            await asyncio.sleep(CONFIG_POLL_INTERVAL)
            await self.load_initial_config()

    async def _handle_kill_switch(self):
        """Kill switch: close all positions and terminate the bot process."""
        self.kill_switch_active = True
        self.running = False
        log.warning("Kill switch activated — closing all positions and shutting down")
        await self._emit_log("warn", "KILL SWITCH — closing positions and terminating bot process")
        try:
            if self.mode == "live" and self._mt5 is not None:
                await self._close_all_mt5_positions()
        except Exception as e:
            log.warning(f"Error closing positions on kill switch: {e}")
        await asyncio.sleep(1)
        import os, signal as _signal
        os.kill(os.getpid(), _signal.SIGTERM)

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
        if "riskPerTradePct" in config:
            for s in self.strategies:
                s.risk_pct = float(config["riskPerTradePct"])
        if "riskSettings" in config:
            rpt = config["riskSettings"].get("riskPerTradePct", 0.01)
            for s in self.strategies:
                s.risk_pct = rpt
        if "aiEnabled" in config:
            self.ai_enabled = bool(config["aiEnabled"])
            log.info(f"AI validation {'enabled' if self.ai_enabled else 'DISABLED — all signals auto-approved'}")
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
        if "intervalTradeHours" in config:
            self.interval_trade_hours = float(config["intervalTradeHours"]) if config["intervalTradeHours"] else None
            self._interval_window_start = datetime.utcnow()
            self._interval_paused = False
        if "intervalPauseHours" in config:
            self.interval_pause_hours = float(config["intervalPauseHours"]) if config["intervalPauseHours"] else None
        if "autoTunerEnabled" in config:
            self.tuner.enabled = bool(config["autoTunerEnabled"])
            log.info(f"AutoTuner {'enabled' if self.tuner.enabled else 'disabled'}")
        if "autoTunerMode" in config:
            self.tuner.mode = config["autoTunerMode"]
            log.info(f"AutoTuner mode set to: {self.tuner.mode}")
        if "paperMode" in config:
            new_mode = "paper" if config["paperMode"] else "live"
            if new_mode != self.mode:
                self.mode = new_mode
                self.open_positions.clear()
                log.info(f"Mode switched to {self.mode.upper()} — open_positions cleared")
                await self._emit_log("scan", f"Switched to {self.mode.upper()} mode — {'simulated fills, no real MT5 orders' if self.mode == 'paper' else 'real MT5 orders'}")
        if config.get("triggerBrainGym"):
            lookback = config.get("brainGymLookback", "7d")
            asyncio.create_task(self._run_brain_gym(lookback=lookback))
        log.info("Config updated from dashboard")

    async def _check_interval(self) -> bool:
        """Returns True if the bot is allowed to trade right now based on interval schedule."""
        if self.interval_trade_hours is None or self.interval_pause_hours is None:
            return True  # no interval configured — always trade

        if self._interval_window_start is None:
            self._interval_window_start = datetime.utcnow()

        elapsed = (datetime.utcnow() - self._interval_window_start).total_seconds() / 3600

        if not self._interval_paused:
            if elapsed >= self.interval_trade_hours:
                self._interval_paused = True
                self._interval_window_start = datetime.utcnow()
                log.info(f"[INTERVAL] Trading window ended ({self.interval_trade_hours}h) — pausing for {self.interval_pause_hours}h")
                await self.ws.emit_trade({
                    "action": "interval_update",
                    "state": "paused",
                    "resumesInHours": self.interval_pause_hours,
                })
            return True  # currently in trade window
        else:
            if elapsed >= self.interval_pause_hours:
                self._interval_paused = False
                self._interval_window_start = datetime.utcnow()
                log.info(f"[INTERVAL] Pause ended — resuming trading for {self.interval_trade_hours}h")
                await self.ws.emit_trade({
                    "action": "interval_update",
                    "state": "trading",
                    "windowHours": self.interval_trade_hours,
                })
            return False  # currently in pause window

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
                    "sl": pos.sl if pos.sl else None,
                    "tp": pos.tp if pos.tp else None,
                    "strategy": pos.comment.replace("AlgoDesk/", "") if pos.comment else "bot",
                })

            # Detect positions that closed since last sync → feed AutoTuner + set cooldown
            if self._last_mt5_positions:
                open_tickets = {str(p["ticket"]) for p in pos_list}
                for prev in self._last_mt5_positions:
                    if str(prev["ticket"]) not in open_tickets:
                        sym = prev.get("symbol", "")
                        pnl = prev.get("pnl", 0)
                        self.tuner.record_closed_trade(
                            strategy_name=prev.get("strategy", "unknown"),
                            side=prev.get("side", "long"),
                            pnl=pnl,
                            entry_indicators={},
                            entry_price=prev.get("entry_price", 0),
                        )
                        # Set re-entry cooldown so bot doesn't immediately re-buy
                        self._symbol_cooldowns[sym] = datetime.utcnow()
                        pnl_sign = "+" if pnl >= 0 else ""
                        asyncio.create_task(self._emit_log(
                            "trade" if pnl >= 0 else "warn",
                            f"{sym} closed — P&L {pnl_sign}${pnl:.2f}",
                            "info" if pnl >= 0 else "warn",
                        ))
                        # Save closed trade P&L to DB so dashboard reflects real results
                        await self.ws.emit_trade({
                            "action": "closed",
                            "trade": {
                                "symbol": sym,
                                "side": prev.get("side", "long"),
                                "pnl": pnl,
                                "ticket": prev.get("ticket"),
                                "entry_price": prev.get("entry_price", 0),
                                "exit_price": prev.get("current_price", 0),
                                "volume": prev.get("volume", 0),
                                "strategy": prev.get("strategy", "bot"),
                                "closedAt": datetime.utcnow().isoformat(),
                            }
                        })
            self._last_mt5_positions = pos_list

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

    async def _run_brain_gym(self, lookback: str = "7d"):
        """Run Brain Gym analytics offline. Called automatically on weekends or on-demand."""
        await self._emit_log("brain_gym", f"Brain Gym starting — lookback={lookback}")
        try:
            gym = BrainGym(api_url=self.ws.api_url, mt5=self._mt5)
            report = await gym.run(lookback=lookback, emit_log=self._emit_log)
            if report:
                summary = report.get("summary", {})
                await self._emit_log("brain_gym",
                    f"Brain Gym done — {report['total_trades']} trades | "
                    f"win_rate={summary.get('win_rate', 0):.0%} | "
                    f"PnL=${summary.get('total_pnl', 0):.2f}")
                if report.get("strategy_recommendations"):
                    await self._emit_log("brain_gym",
                        "Strategy recommendations generated — check Brain Gym page for Gemini's advice")
            self._brain_gym_done_this_weekend = True
            # Terminal stops itself — nothing left to do until market reopens
            await self._emit_log("brain_gym",
                "Weekend analysis complete. Bot is shutting down. Restart when you're ready to trade.")
            await asyncio.sleep(2)
            self.running = False
        except Exception as e:
            log.error(f"Brain Gym error: {e}")
            await self._emit_log("brain_gym", f"Brain Gym error: {e}", "warn")

    async def _generate_market_briefing(self):
        """
        Called on startup (after MT5 connects). Fetches recent price context and
        the latest Brain Gym report, then asks Gemini for a pre-market briefing
        that sets the trading agenda for the session.
        """
        gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
        if not gemini_key:
            return

        await self._emit_log("brain_gym", "Generating pre-market briefing — Gemini is thinking...")
        try:
            # Pull latest Brain Gym report from API
            bg_report = None
            async with aiohttp.ClientSession() as sess:
                async with sess.get(
                    f"{self.ws.api_url}/analytics/brain-gym/latest",
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    if resp.status == 200:
                        bg_report = await resp.json()

            # Pull current equity + recent MT5 positions
            equity_str = f"${self.equity:,.2f}" if self.equity else "unknown"
            all_symbols = list({s for strat in self.strategies for s in strat.symbols})

            # Build recent price context from MT5 if available
            price_context = ""
            if self._mt5 is not None:
                lines = []
                for sym in all_symbols[:8]:  # cap at 8 to stay concise
                    tick = self._mt5.symbol_info_tick(sym)
                    if tick:
                        lines.append(f"  {sym}: bid={tick.bid:.5f} ask={tick.ask:.5f}")
                if lines:
                    price_context = "CURRENT PRICES:\n" + "\n".join(lines)

            # Brain Gym summary
            bg_summary = ""
            if bg_report and isinstance(bg_report, dict):
                report_data = bg_report.get("report") or bg_report
                if isinstance(report_data, dict):
                    summ = report_data.get("summary", {})
                    recs = report_data.get("strategy_recommendations", "")
                    bg_summary = (
                        f"LAST BRAIN GYM REPORT ({bg_report.get('lookback', '?')} window):\n"
                        f"  Win rate: {summ.get('win_rate', 0):.0%} | Profit factor: {summ.get('profit_factor', '?')}\n"
                        f"  Total P&L: ${summ.get('total_pnl', 0):.2f} | Avg win: ${summ.get('avg_win', 0):.2f} | Avg loss: ${summ.get('avg_loss', 0):.2f}\n"
                    )
                    if recs:
                        bg_summary += f"STRATEGY RECOMMENDATIONS:\n{recs}\n"

            now_utc = datetime.utcnow()
            prompt = f"""You are the head of trading at a $1B forex hedge fund.
The algorithmic trading bot is about to start its session. Give a professional pre-market briefing.

TODAY: {now_utc.strftime('%A %d %B %Y, %H:%M UTC')}
ACCOUNT EQUITY: {equity_str}
STRATEGIES ACTIVE: {len(self.strategies)} strategies across {len(all_symbols)} pairs: {', '.join(all_symbols[:10])}

{price_context}

{bg_summary}

Write a pre-market briefing with these sections:

SESSION OUTLOOK: (2 sentences — what market conditions to expect today based on day/time)
KEY LEVELS TO WATCH: (bullet list of 3–5 specific things — price levels, sessions, events)
RISK WARNINGS: (1–2 specific warnings based on the Brain Gym data above, or general if no data)
EXECUTION RULES FOR THIS SESSION: (3 bullet points — specific rules the bot should follow today)
CONFIDENCE RATING: X/10 — one sentence why

Be specific. Reference the Brain Gym data. No generic advice."""

            # Call Gemini (with 429 retry)
            for model in ["gemini-2.5-flash", "gemini-2.5-flash-preview-05-20", "gemini-2.0-flash", "gemini-1.5-flash-latest"]:
                try:
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={gemini_key}"
                    payload = {
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 1024},
                    }
                    async with aiohttp.ClientSession() as sess:
                        async with sess.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=45)) as resp:
                            if resp.status == 404:
                                continue
                            if resp.status == 429:
                                log.warning("[AI/Gemini] Briefing rate-limited — waiting 10s then retrying...")
                                await asyncio.sleep(10)
                                async with sess.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=45)) as retry:
                                    if retry.status != 200:
                                        log.warning(f"[AI/Gemini] Briefing retry failed HTTP {retry.status}")
                                        continue
                                    resp = retry
                            if resp.status != 200:
                                log.warning(f"[AI/Gemini] Briefing HTTP {resp.status}")
                                continue
                            data = await resp.json()
                            briefing_text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                            async with aiohttp.ClientSession() as s2:
                                await s2.post(
                                    f"{self.ws.api_url}/analytics/market-briefing",
                                    json={"briefing": briefing_text, "equity": self.equity, "symbols": all_symbols},
                                    timeout=aiohttp.ClientTimeout(total=10)
                                )
                            await self._emit_log("brain_gym",
                                f"Pre-market briefing ready — check Brain Gym page\n\n{briefing_text[:400]}...")
                            return
                except Exception as e:
                    log.warning(f"Briefing Gemini {model} error: {e}")
        except Exception as e:
            log.error(f"Market briefing error: {e}")
            await self._emit_log("brain_gym", f"Could not generate briefing: {e}", "warn")

    async def _execute_trade(self, signal: dict):
        """Execute a trade signal (paper or live MT5)."""
        symbol = signal["symbol"]

        if self.kill_switch_active or not self.running:
            return
        # Never open more than max_new_trades_per_tick new positions in a single scan cycle
        if self._new_trades_this_tick >= self.max_new_trades_per_tick:
            await self._emit_log("risk", f"{symbol} skipped — already opened {self.max_new_trades_per_tick} positions this scan")
            return
        if self.in_warning_zone:
            await self._emit_log("risk", f"{symbol} skipped — near loss limit (warning zone active)", "warn")
            return
        if symbol in self.paused_symbols or symbol in self.restricted_assets:
            await self._emit_log("risk", f"{symbol} is paused/restricted — skipping", "warn")
            return

        # Re-entry cooldown — prevents immediate re-buy after manual/auto close
        if symbol in self._symbol_cooldowns:
            elapsed = (datetime.utcnow() - self._symbol_cooldowns[symbol]).total_seconds() / 60
            if elapsed < self.reentry_cooldown_minutes:
                remaining = self.reentry_cooldown_minutes - elapsed
                await self._emit_log("risk", f"{symbol} cooldown active — {remaining:.0f}m before re-entry allowed")
                return
            else:
                del self._symbol_cooldowns[symbol]

        # Enforce maxOpenPositions limit
        if self.max_open_positions is not None:
            if self.mode == "live" and self._mt5 is not None:
                open_count = len(self._mt5.positions_get() or [])
            else:
                open_count = len(self.open_positions)
            if open_count >= self.max_open_positions:
                await self._emit_log("risk", f"Max positions ({self.max_open_positions}) reached — {symbol} skipped")
                return

        # Signal detected — log it before AI check
        indicators = signal.get("indicators", {})
        z = indicators.get("z_score") or signal.get("z_score", "n/a")
        rsi = indicators.get("rsi_14", "n/a")
        atr = indicators.get("atr", "n/a")
        await self._emit_log("signal",
            f"{symbol} {signal['side'].upper()} signal — z={z}, RSI={rsi}, ATR={atr} [{signal['strategy']}]")

        # AI trade validation
        _pre_trade = {
            "symbol": symbol,
            "side": signal["side"],
            "strategy": signal["strategy"],
            "entry_price": signal["price"],
        }
        _providers = " + ".join(filter(None, [
            "Groq" if os.environ.get("GROQ_API_KEY") else None,
            "Gemini" if os.environ.get("GEMINI_API_KEY") else None,
            "DeepSeek" if (os.environ.get("DEEPSEEK") or os.environ.get("DEEPSEEK_API_KEY")) else None,
        ])) or "no AI keys"
        await self._emit_log("ai", f"Evaluating {symbol} {signal['side'].upper()} with {_providers}...")
        if not await self._ai_validate_trade(_pre_trade, signal):
            await self._emit_log("ai", f"{symbol} REJECTED by AI — trade blocked", "warn")
            return

        # Don't open another position in same symbol
        if self.mode == "live" and self._mt5 is not None:
            existing = self._mt5.positions_get(symbol=symbol)
            if existing:
                await self._emit_log("risk", f"{symbol} already has an open position — skipping")
                return
        elif symbol in self.open_positions:
            return

        self._new_trades_this_tick += 1  # reserve slot — decremented below on failure
        sentiment_score = self.sentiment.get_score()
        sentiment_multiplier = max(0.5, min(1.5, sentiment_score / 50.0))
        position_size = self.equity * signal.get("risk_pct", 0.01) * sentiment_multiplier
        if self.max_position_usd is not None:
            position_size = min(position_size, self.max_position_usd)

        now_utc = datetime.utcnow()
        trade = {
            "symbol": symbol,
            "side": signal["side"],
            "strategy": signal["strategy"],
            "entry_price": signal["price"],
            "quantity": round(position_size / signal["price"], 4),
            "sentiment_multiplier": round(sentiment_multiplier, 4),
            "z_score": signal.get("z_score"),
            "atr": indicators.get("atr"),
            "session": _detect_session(now_utc.hour),
            "entry_indicators": {
                "rsi_14": indicators.get("rsi_14"),
                "adx": indicators.get("adx"),
                "bb_position_pct": indicators.get("bb_position_pct"),
                "macd_hist": indicators.get("macd_hist"),
                "atr": indicators.get("atr"),
                "trend": indicators.get("trend"),
            },
            "timestamp": now_utc.isoformat(),
            "mode": self.mode,
        }

        if self.mode == "live" and self.mt5_available:
            fill = await self._execute_mt5_order(trade)
            if fill:
                strategies_module.confirm_cooldown(symbol)  # lock symbol after successful order
                trade["entry_price"] = fill["price"]
                trade["volume"] = fill["volume"]
                trade["mt5_ticket_id"] = str(fill.get("ticket", ""))
                await self.ws.emit_trade({"action": "open", "trade": trade})
                await self._emit_log("trade",
                    f"✅ {symbol} {signal['side'].upper()} placed @ {fill['price']:.5f} | {fill['volume']} lots | #{fill.get('ticket','?')}")
            else:
                self._new_trades_this_tick -= 1  # order failed — release the slot
                strategies_module.cancel_cooldown(symbol)   # allow retry next scan
                await self._emit_log("trade", f"❌ {symbol} order failed — check MT5 logs", "warn")
        else:
            strategies_module.confirm_cooldown(symbol)
            self.open_positions[symbol] = trade
            await self._emit_log("trade",
                f"✅ [PAPER] {symbol} {signal['side'].upper()} @ {trade['entry_price']:.5f} × {trade['quantity']}")
            await self.ws.emit_trade({"action": "open", "trade": trade})

    async def _execute_mt5_order(self, trade: dict):
        """Send a real order to MetaTrader 5. Returns fill info dict on success, None on failure."""
        try:
            mt5 = self._mt5
            symbol = trade["symbol"]

            # Skip orders during broker daily close window (22:55–23:10 UTC)
            now_utc = datetime.utcnow()
            close_start = now_utc.replace(hour=22, minute=55, second=0, microsecond=0)
            close_end   = now_utc.replace(hour=23, minute=10, second=0, microsecond=0)
            if close_start <= now_utc <= close_end:
                log.warning(f"Daily close window — skipping {symbol} order (retry after 23:10 UTC)")
                return None

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

            digits = info.digits if info else 5
            point = info.point if info else 0.00001

            # Step 1: Place the market order WITHOUT SL/TP (more reliable across brokers)
            request = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": symbol,
                "volume": volume,
                "type": order_type,
                "price": price,
                "deviation": 20,
                "magic": 202500,
                "comment": f"AlgoDesk/{trade['strategy']}",
                "type_time": mt5.ORDER_TIME_GTC,
                "type_filling": mt5.ORDER_FILLING_IOC,
            }
            result = mt5.order_send(request)
            if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
                # Try FOK as fallback
                request["type_filling"] = mt5.ORDER_FILLING_FOK
                result = mt5.order_send(request)
            if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
                err = result.comment if result else mt5.last_error()
                log.error(f"MT5 order failed: {err}")
                return None

            ticket = result.order
            fill_price = result.price if result.price else price
            log.info(f"MT5 order placed: #{ticket} {symbol} {trade['side']} {volume} lots @ {fill_price:.{digits}f}")

            # Step 2: Set SL/TP on the now-open position via TRADE_ACTION_SLTP
            atr = trade.get("atr")
            if atr and atr > 0:
                sl_dist = atr * 1.5
                tp_dist = atr * 2.5
            else:
                pip = point * 10
                sl_dist = pip * 20
                tp_dist = pip * 40

            # Clamp to broker's minimum stop level
            stop_level = (info.trade_stops_level * point) if info else 0
            sl_dist = max(sl_dist, stop_level + point)
            tp_dist = max(tp_dist, stop_level + point)

            if trade["side"] == "long":
                sl_price = round(fill_price - sl_dist, digits)
                tp_price = round(fill_price + tp_dist, digits)
            else:
                sl_price = round(fill_price + sl_dist, digits)
                tp_price = round(fill_price - tp_dist, digits)

            sltp_request = {
                "action": mt5.TRADE_ACTION_SLTP,
                "symbol": symbol,
                "position": ticket,
                "sl": sl_price,
                "tp": tp_price,
            }
            sltp_result = mt5.order_send(sltp_request)
            if sltp_result and sltp_result.retcode == mt5.TRADE_RETCODE_DONE:
                log.info(f"[MT5] SL={sl_price:.{digits}f} TP={tp_price:.{digits}f} set on #{ticket}")
            else:
                err = sltp_result.comment if sltp_result else mt5.last_error()
                log.warning(f"[MT5] SL/TP set failed on #{ticket}: {err} — position open without SL/TP")

            return {"price": fill_price, "volume": volume, "ticket": ticket}
        except Exception as e:
            log.error(f"MT5 order error: {e}")
            return None

    async def _sync_mt5_history(self, days: int = 90):
        """Sync last N days of real MT5 closed positions into the journal DB."""
        if self._mt5 is None or self.mode != "live":
            return
        mt5 = self._mt5
        try:
            from datetime import timezone
            date_from = datetime.utcnow() - timedelta(days=days)
            deals = mt5.history_deals_get(date_from, datetime.utcnow())
            if not deals:
                log.info("MT5 history sync: no deals found")
                return

            # Group deals by position_id to pair entries with exits
            by_position: dict = {}
            for d in deals:
                if d.type not in (0, 1):   # 0=BUY 1=SELL — skip deposits, balance ops
                    continue
                by_position.setdefault(d.position_id, []).append(d)

            trades = []
            for pid, deal_list in by_position.items():
                entries = [d for d in deal_list if d.entry == 0]
                exits   = [d for d in deal_list if d.entry == 1]
                if not entries or not exits:
                    continue
                entry      = entries[0]
                exit_deal  = exits[-1]
                pnl        = round(sum(d.profit + d.swap + d.commission for d in exits), 2)
                fees       = round(abs(sum(d.commission for d in exits)), 2)
                strategy   = (entry.comment or "").replace("AlgoDesk/", "").strip() or "mt5"
                trades.append({
                    "mt5_ticket_id": str(pid),
                    "symbol":        entry.symbol,
                    "side":          "long" if entry.type == 0 else "short",
                    "strategy":      strategy,
                    "entry_price":   str(entry.price),
                    "exit_price":    str(exit_deal.price),
                    "quantity":      str(entry.volume),
                    "pnl":           str(pnl),
                    "fees":          str(fees),
                    "opened_at":     datetime.utcfromtimestamp(entry.time).isoformat() + "Z",
                    "closed_at":     datetime.utcfromtimestamp(exit_deal.time).isoformat() + "Z",
                })

            if not trades:
                return

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.ws.api_url}/trades/sync-history",
                    json={"trades": trades},
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    result = await resp.json()
                    inserted = result.get("inserted", 0)
                    purged   = result.get("purged", 0)
                    log.info(f"MT5 history sync: {inserted}/{len(trades)} new trades added, {purged} bad paper trades purged")
                    if inserted > 0 or purged > 0:
                        await self._emit_log("scan",
                            f"MT5 history synced — {inserted} trades added to journal"
                            + (f", {purged} bad paper trades cleaned up" if purged else ""))
        except Exception as e:
            log.error(f"MT5 history sync error: {e}")

    async def run(self):
        """Main engine loop — ticks strategies every TICK_INTERVAL seconds."""
        self.running = True
        log.info(f"Trading engine started ({self.mode} mode)")

        # Load config from API before first tick
        await self.load_initial_config()
        await self._emit_log("scan", f"Engine online — {self.mode} mode | {len(self.strategies)} strategies loaded | {len({s for strat in self.strategies for s in strat.symbols})} symbols")

        # Start config polling in background
        asyncio.create_task(self._poll_config())

        # Sync real MT5 closed trade history into the journal DB on startup
        asyncio.create_task(self._sync_mt5_history())

        # Generate Gemini pre-market briefing before first trade
        asyncio.create_task(self._generate_market_briefing())

        # Refresh H1 bars once per hour (3600 / TICK_INTERVAL ticks)
        h1_refresh_interval = max(1, 3600 // TICK_INTERVAL)
        all_symbols = list({s for strat in self.strategies for s in strat.symbols})

        while self.running:
            self.tick_count += 1

            # Weekend check — forex is closed Fri 22:00 UTC → Sun 22:00 UTC
            # Paper mode bypasses this so you can train/test on weekends
            now_utc = datetime.utcnow()
            wday = now_utc.weekday()  # Mon=0 ... Fri=4, Sat=5, Sun=6
            market_closed = self.mode == "live" and (
                wday == 5 or                                      # all Saturday
                (wday == 6 and now_utc.hour < 22) or             # Sunday before 22:00
                (wday == 4 and now_utc.hour >= 22)               # Friday after 22:00
            )

            # Heartbeat fires regardless of kill switch — always visible in Bot Feed
            if self.tick_count % 30 == 1:
                total_syms = len({s for strat in self.strategies for s in strat.symbols})
                if market_closed:
                    await self._emit_log("scan",
                        f"WEEKEND — forex market closed | reopens Sunday 22:00 UTC "
                        f"({now_utc.strftime('%A %H:%M')} UTC)")
                else:
                    status = "PAUSED" if self.kill_switch_active else "SCANNING"
                    await self._emit_log("scan",
                        f"{status} — {total_syms} symbols | {len(self.strategies)} strategies | "
                        f"equity=${self.equity:,.2f} | positions={len(self._last_mt5_positions)}")

            if market_closed:
                # Trigger Brain Gym once per weekend when market closes
                if not self._brain_gym_ran_this_weekend:
                    self._brain_gym_ran_this_weekend = True
                    self._brain_gym_done_this_weekend = False
                    asyncio.create_task(self._run_brain_gym())

                # Once Brain Gym is fully done, sleep in long chunks instead of spinning
                if self._brain_gym_done_this_weekend:
                    # Calculate seconds until Sunday 22:00 UTC (market open)
                    now_utc = datetime.utcnow()
                    days_until_open = (6 - now_utc.weekday()) % 7  # days until Sunday
                    if now_utc.weekday() == 6 and now_utc.hour >= 22:
                        days_until_open = 7  # already past open time, next week
                    market_open = now_utc.replace(hour=22, minute=0, second=0, microsecond=0)
                    if days_until_open > 0:
                        market_open += __import__('datetime').timedelta(days=days_until_open)
                    secs_remaining = max(60, (market_open - now_utc).total_seconds())
                    # Emit one final log then sleep until market reopens
                    if self.tick_count % 60 == 1:
                        await self._emit_log("scan",
                            f"WEEKEND — Brain Gym complete. Sleeping until market reopens "
                            f"({now_utc.strftime('%A %H:%M')} UTC, ~{secs_remaining/3600:.1f}h away)")
                    await asyncio.sleep(min(300, secs_remaining))  # wake every 5 min max to check
                else:
                    await asyncio.sleep(TICK_INTERVAL)
                continue

            # Market open — reset flags so Brain Gym runs again next weekend
            self._brain_gym_ran_this_weekend = False
            self._brain_gym_done_this_weekend = False

            can_trade = not self.kill_switch_active and await self._check_interval()
            self._new_trades_this_tick = 0
            if can_trade:
                for strategy in self.strategies:
                    try:
                        signals = await strategy.generate_signals()
                        for signal in signals:
                            await self._execute_trade(signal)
                    except Exception as e:
                        log.error(f"Strategy error ({strategy.name}): {e}")
                        await self._emit_log("scan", f"Strategy error ({strategy.name}): {e}", "warn")

            # Sync real MT5 positions every 5 ticks
            if self.tick_count % 5 == 0:
                if self.mode == "live" and self._mt5 is not None:
                    await self._sync_mt5_positions()
                else:
                    positions = list(self.open_positions.values())
                    await self.ws.emit_position_update(positions)

            # Refresh H1 bars from MT5 every hour so indicators stay current
            if self.tick_count % h1_refresh_interval == 0 and self._mt5 is not None:
                strategies_module.refresh_latest_h1(all_symbols)
                log.debug("H1 bar cache refreshed")

            # AutoTuner: evaluate and adjust strategy params every 60 seconds
            if self.tick_count % 30 == 0:
                await self.tuner.evaluate_and_tune()

            await asyncio.sleep(TICK_INTERVAL)
