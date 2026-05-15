"""
AutoTuner — adaptive parameter optimization and self-learning for trading strategies.

After every MIN_TRADES_PER_EVAL closed trades, the tuner:
  1. Evaluates each strategy's win rate, avg P&L, and Sharpe ratio
  2. Adjusts entry thresholds (z_score, RSI) based on performance
  3. Adjusts risk_pct per strategy using fractional Kelly Criterion
  4. Logs every change with reason, previous params, and outcome metrics
  5. Syncs state to backend so the dashboard can display it

Self-learning:
  - Stores indicator snapshots at entry for each trade
  - After close, labels the trade WIN or LOSS
  - Uses win/loss patterns to tighten or relax thresholds over time
"""

import logging
import math
import aiohttp
from datetime import datetime
from typing import Optional

log = logging.getLogger("algodesk.autotuner")

MIN_TRADES_PER_EVAL = 5    # minimum closed trades before first evaluation
KELLY_FRACTION = 0.25      # use 25% of full Kelly (conservative)
MAX_RISK_PCT = 0.02        # never risk more than 2% per trade
MIN_RISK_PCT = 0.003       # never go below 0.3% per trade
MAX_LOG_ENTRIES = 100


class AutoTuner:
    def __init__(self, strategies: list, api_url: str):
        self.strategies = strategies
        self.api_url = api_url
        self.enabled = False
        self.mode = "guided"  # "guided" | "autonomous"

        # Rolling window of closed trade outcomes
        # Each entry: {strategy, side, pnl, entry_indicators, timestamp}
        self._closed_trades: list = []
        self._max_trade_history = 200

        # Adjustment log (shown in dashboard)
        self.log: list = []

        # Track "last known" params so we can log changes
        self._snapshot_params()

    def _snapshot_params(self):
        """Record current strategy parameters."""
        self._param_snapshot = {
            s.name: {
                "z_threshold": getattr(s, "z_threshold", None),
                "risk_pct": s.risk_pct,
            }
            for s in self.strategies
        }

    def record_closed_trade(self, strategy_name: str, side: str, pnl: float,
                             entry_indicators: dict, entry_price: float):
        """Called by engine when a position closes. Records outcome for learning."""
        self._closed_trades.append({
            "strategy": strategy_name,
            "side": side,
            "pnl": round(pnl, 4),
            "win": pnl > 0,
            "entry_indicators": entry_indicators,
            "entry_price": entry_price,
            "timestamp": datetime.utcnow().isoformat(),
        })
        # Keep rolling window
        if len(self._closed_trades) > self._max_trade_history:
            self._closed_trades = self._closed_trades[-self._max_trade_history:]
        log.info(f"[Tuner] Recorded {strategy_name} {side} trade: P&L ${pnl:.2f} ({'WIN' if pnl > 0 else 'LOSS'})")

    def get_trade_count(self) -> int:
        return len(self._closed_trades)

    async def evaluate_and_tune(self):
        """Evaluate performance and adjust parameters. Called periodically."""
        if not self.enabled:
            return
        if len(self._closed_trades) < MIN_TRADES_PER_EVAL:
            log.info(f"[Tuner] Only {len(self._closed_trades)} trades recorded, need {MIN_TRADES_PER_EVAL} to evaluate")
            return

        log.info(f"[Tuner] Evaluating {len(self._closed_trades)} closed trades across {len(self.strategies)} strategies")
        any_change = False

        for strategy in self.strategies:
            trades = [t for t in self._closed_trades if t["strategy"] == strategy.name]
            if len(trades) < 3:
                continue

            wins = [t for t in trades if t["win"]]
            losses = [t for t in trades if not t["win"]]
            win_rate = len(wins) / len(trades)
            avg_pnl = sum(t["pnl"] for t in trades) / len(trades)
            avg_win = sum(t["pnl"] for t in wins) / len(wins) if wins else 0
            avg_loss = abs(sum(t["pnl"] for t in losses) / len(losses)) if losses else 1

            # Sharpe proxy: avg / std of P&Ls
            pnls = [t["pnl"] for t in trades]
            mean_p = sum(pnls) / len(pnls)
            variance = sum((p - mean_p) ** 2 for p in pnls) / len(pnls)
            std_p = math.sqrt(variance) if variance > 0 else 1
            sharpe = mean_p / std_p

            changes = {}
            reasons = []

            # ── Threshold tuning ──────────────────────────────────────────────
            if hasattr(strategy, "z_threshold"):
                old_z = strategy.z_threshold
                autonomous = self.mode == "autonomous"
                tighten_threshold = 0.45 if autonomous else 0.35
                tighten_step = 0.25 if autonomous else 0.15
                relax_step = 0.10 if autonomous else 0.05
                if win_rate < tighten_threshold and avg_pnl < 0:
                    # Losing → tighten entry (require stronger signal)
                    new_z = min(3.5, old_z + tighten_step)
                    strategy.z_threshold = round(new_z, 2)
                    changes["z_threshold"] = {"from": old_z, "to": strategy.z_threshold}
                    reasons.append(f"win rate {win_rate:.0%} → tightening z threshold")
                elif win_rate > 0.60 and avg_pnl > 0:
                    # Winning well → slightly relax to catch more signals
                    new_z = max(1.8, old_z - relax_step)
                    strategy.z_threshold = round(new_z, 2)
                    changes["z_threshold"] = {"from": old_z, "to": strategy.z_threshold}
                    reasons.append(f"win rate {win_rate:.0%} → relaxing z threshold slightly")

            # ── Kelly position sizing ──────────────────────────────────────────
            kelly_fraction = 0.40 if self.mode == "autonomous" else KELLY_FRACTION
            old_risk = strategy.risk_pct
            if win_rate > 0 and avg_loss > 0:
                win_loss_ratio = avg_win / avg_loss if avg_loss > 0 else 1
                kelly = win_rate - (1 - win_rate) / win_loss_ratio
                kelly = max(0, kelly)  # Kelly can be negative — clamp to 0
                optimal_risk = kelly * kelly_fraction
                optimal_risk = max(MIN_RISK_PCT, min(MAX_RISK_PCT, optimal_risk))
                new_risk = round(optimal_risk, 4)
                if abs(new_risk - old_risk) > 0.0005:  # only log if meaningful change
                    strategy.risk_pct = new_risk
                    changes["risk_pct"] = {"from": old_risk, "to": new_risk}
                    direction = "↑" if new_risk > old_risk else "↓"
                    reasons.append(f"Kelly sizing {direction} (W:{win_rate:.0%} W/L:{win_loss_ratio:.2f})")

            # ── Log the adjustment ────────────────────────────────────────────
            if changes:
                any_change = True
                entry = {
                    "timestamp": datetime.utcnow().isoformat(),
                    "strategy": strategy.name,
                    "changes": changes,
                    "reason": " | ".join(reasons),
                    "performance": {
                        "winRate": round(win_rate, 3),
                        "avgPnl": round(avg_pnl, 2),
                        "avgWin": round(avg_win, 2),
                        "avgLoss": round(avg_loss, 2),
                        "sharpe": round(sharpe, 3),
                        "tradeCount": len(trades),
                    },
                }
                self.log.insert(0, entry)
                log.info(
                    f"[Tuner] {strategy.name}: {'; '.join(reasons)} "
                    f"(trades={len(trades)}, win={win_rate:.0%}, avg_pnl=${avg_pnl:.2f})"
                )

        if len(self.log) > MAX_LOG_ENTRIES:
            self.log = self.log[:MAX_LOG_ENTRIES]

        if any_change or len(self._closed_trades) % 10 == 0:
            await self._sync_to_backend()

    def get_current_params(self) -> dict:
        return {
            s.name: {
                "z_threshold": round(getattr(s, "z_threshold", 0), 2) if hasattr(s, "z_threshold") else None,
                "risk_pct": round(s.risk_pct * 100, 3),  # as percentage for display
            }
            for s in self.strategies
        }

    def get_state(self) -> dict:
        return {
            "enabled": self.enabled,
            "mode": self.mode,
            "totalTradesEvaluated": len(self._closed_trades),
            "currentParams": self.get_current_params(),
            "log": self.log[:30],  # last 30 entries for UI
        }

    async def _sync_to_backend(self):
        """Persist tuner state to backend so dashboard can read it."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.api_url}/bot/config",
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as resp:
                    cfg = await resp.json() if resp.status == 200 else {}

                extra = dict(cfg.get("botExtra") or {})
                extra["autoTuner"] = self.get_state()

                await session.put(
                    f"{self.api_url}/bot/config",
                    json={"botExtra": extra},
                    timeout=aiohttp.ClientTimeout(total=5),
                )
            log.info("[Tuner] State synced to backend")
        except Exception as e:
            log.warning(f"[Tuner] Backend sync failed: {e}")
