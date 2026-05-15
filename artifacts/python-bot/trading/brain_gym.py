"""
Brain Gym — offline post-trade analytics engine.

Runs automatically during weekend market downtime, or on-demand via
the dashboard. Fetches closed trades from the API, splits them into
winning/losing channels, and outputs a StrategyOptimizationReport.

Minimum 15 closed trades required before drawing statistical conclusions.
MAE/MFE are approximated from H1 OHLC bars (honest limitation noted in report).
"""

import asyncio
import logging
import math
import aiohttp
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional, Any

log = logging.getLogger("algodesk.brain_gym")

MIN_TRADES_FOR_CONCLUSIONS = 15

# Forex session windows (UTC hours)
SESSIONS = {
    "asian":  (0, 9),
    "london": (7, 17),
    "ny":     (13, 22),
}

# Known correlated pair groups — used for correlation loss clustering
CORRELATED_GROUPS = [
    {"name": "USD_strength", "pairs": ["EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF", "USDJPY"]},
    {"name": "JPY_crosses",  "pairs": ["USDJPY", "EURJPY", "GBPJPY", "AUDJPY", "CADJPY", "NZDJPY"]},
    {"name": "GBP_crosses",  "pairs": ["GBPUSD", "GBPJPY", "GBPCHF", "GBPAUD", "GBPCAD", "GBPNZD"]},
    {"name": "commodity_fx", "pairs": ["AUDUSD", "NZDUSD", "USDCAD", "XAUUSD", "XAGUSD"]},
]


def _session(dt: datetime) -> str:
    """Return the dominant forex session for a UTC datetime."""
    h = dt.hour
    # Overlap periods go to the higher-volume session
    if 13 <= h < 17:
        return "ny_london_overlap"
    if 7 <= h < 13:
        return "london"
    if 13 <= h < 22:
        return "ny"
    return "asian"


def _safe_float(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _mean(values: List[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _std(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    m = _mean(values)
    return math.sqrt(sum((v - m) ** 2 for v in values) / len(values))


def _percentile(values: List[float], p: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    idx = (p / 100) * (len(s) - 1)
    lo, hi = int(idx), min(int(idx) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (idx - lo)


# ── Analysis channels ─────────────────────────────────────────────────────────

def _indicator_distribution(trades: List[Dict]) -> Dict:
    """Extract indicator value distributions from a set of trades."""
    rsi_vals, adx_vals, bb_pct_vals, macd_vals, atr_vals = [], [], [], [], []
    for t in trades:
        ind = t.get("entryIndicators") or {}
        if not ind:
            continue
        rsi_vals.append(_safe_float(ind.get("rsi_14")))
        adx_vals.append(_safe_float(ind.get("adx")))
        bb_pct_vals.append(_safe_float(ind.get("bb_position_pct")))
        macd_vals.append(_safe_float(ind.get("macd_hist")))
        atr_vals.append(_safe_float(ind.get("atr")))

    def stats(vals):
        if not vals:
            return {"n": 0, "mean": 0, "std": 0, "p25": 0, "p50": 0, "p75": 0}
        return {
            "n": len(vals),
            "mean": round(_mean(vals), 3),
            "std": round(_std(vals), 3),
            "p25": round(_percentile(vals, 25), 3),
            "p50": round(_percentile(vals, 50), 3),
            "p75": round(_percentile(vals, 75), 3),
        }

    return {
        "rsi": stats(rsi_vals),
        "adx": stats(adx_vals),
        "bb_pct": stats(bb_pct_vals),
        "macd_hist": stats(macd_vals),
        "atr": stats(atr_vals),
    }


def _session_matrix(trades: List[Dict]) -> Dict:
    """Win rate, avg PnL, trade count per session × strategy."""
    matrix: Dict[str, Dict] = {}
    for t in trades:
        session = t.get("session") or "unknown"
        strategy = t.get("strategy") or "unknown"
        key = f"{session}:{strategy}"
        if key not in matrix:
            matrix[key] = {"session": session, "strategy": strategy, "wins": 0, "losses": 0, "pnl": 0.0, "trades": 0}
        pnl = _safe_float(t.get("pnl"))
        matrix[key]["trades"] += 1
        matrix[key]["pnl"] = round(matrix[key]["pnl"] + pnl, 4)
        if pnl > 0:
            matrix[key]["wins"] += 1
        else:
            matrix[key]["losses"] += 1

    result = []
    for cell in matrix.values():
        n = cell["trades"]
        cell["win_rate"] = round(cell["wins"] / n, 3) if n > 0 else 0
        cell["avg_pnl"] = round(cell["pnl"] / n, 4) if n > 0 else 0
        result.append(cell)
    return sorted(result, key=lambda x: x["pnl"], reverse=True)


def _mae_mfe_analysis(wins: List[Dict], losses: List[Dict]) -> Dict:
    """
    Analyse Maximum Adverse/Favorable Excursion.
    MAE on winners: how deep into drawdown before turning profitable.
    MFE on losers: how close they got to TP before reversing.
    """
    win_maes = [_safe_float(t.get("mae")) for t in wins if t.get("mae")]
    loss_mfes = [_safe_float(t.get("mfe")) for t in losses if t.get("mfe")]

    def stats(vals, label):
        if not vals:
            return {"label": label, "n": 0, "note": "no data yet"}
        return {
            "label": label,
            "n": len(vals),
            "mean": round(_mean(vals), 4),
            "p50_median": round(_percentile(vals, 50), 4),
            "p75": round(_percentile(vals, 75), 4),
            "p90": round(_percentile(vals, 90), 4),
        }

    sl_rec = None
    if win_maes:
        # Recommend SL ≥ p90 of winning-trade MAE so we don't stop out winners early
        p90_mae = _percentile(win_maes, 90)
        sl_rec = f"SL should be at least {round(p90_mae, 4)} from entry (p90 MAE of winning trades)"

    tp_rec = None
    if loss_mfes:
        # If losers regularly get close to TP before reversing, TP might be too far
        p75_mfe = _percentile(loss_mfes, 75)
        tp_rec = f"Consider tightening TP — 75% of losing trades reached within {round(p75_mfe, 4)} of entry before reversing"

    return {
        "winner_mae": stats(win_maes, "MAE on winning trades (how deep before turning up)"),
        "loser_mfe": stats(loss_mfes, "MFE on losing trades (how close to TP before reversing)"),
        "sl_recommendation": sl_rec,
        "tp_recommendation": tp_rec,
        "note": "MAE/MFE approximated from H1 OHLC bars — sub-hour precision not available",
    }


def _correlation_clusters(losses: List[Dict]) -> List[Dict]:
    """
    Find time windows where multiple correlated pairs lost simultaneously.
    Flags USD-stacking, JPY-stacking, etc.
    """
    clusters = []
    for group in CORRELATED_GROUPS:
        group_losses = [t for t in losses if t.get("symbol") in group["pairs"]]
        if len(group_losses) < 2:
            continue

        # Group by 4-hour windows
        buckets: Dict[str, List] = {}
        for t in group_losses:
            opened = t.get("openedAt") or t.get("opened_at") or ""
            try:
                dt = datetime.fromisoformat(opened.replace("Z", "+00:00"))
                bucket = dt.strftime("%Y-%m-%d-%H")[:-1] + "0"  # 4h bucket
            except Exception:
                bucket = "unknown"
            buckets.setdefault(bucket, []).append(t)

        for bucket, bucket_trades in buckets.items():
            if len(bucket_trades) < 2:
                continue
            total_loss = sum(_safe_float(t.get("pnl")) for t in bucket_trades)
            clusters.append({
                "group": group["name"],
                "window": bucket,
                "simultaneous_losses": len(bucket_trades),
                "pairs": [t["symbol"] for t in bucket_trades],
                "total_pnl": round(total_loss, 2),
                "risk": "HIGH" if len(bucket_trades) >= 3 else "MEDIUM",
            })

    return sorted(clusters, key=lambda x: x["total_pnl"])


def _derive_blacklist(wins: List[Dict], losses: List[Dict], session_data: List[Dict]) -> List[str]:
    """Auto-generate blacklist rules from data patterns."""
    rules = []
    n_total = len(wins) + len(losses)
    if n_total < MIN_TRADES_FOR_CONCLUSIONS:
        return [f"Insufficient data ({n_total} trades) — need {MIN_TRADES_FOR_CONCLUSIONS} minimum for statistical rules"]

    # ADX > 50 on trend_pullback — check win rate
    tp_high_adx_wins = [t for t in wins if t.get("strategy") == "trend_pullback"
                        and _safe_float((t.get("entryIndicators") or {}).get("adx")) > 50]
    tp_high_adx_losses = [t for t in losses if t.get("strategy") == "trend_pullback"
                          and _safe_float((t.get("entryIndicators") or {}).get("adx")) > 50]
    if len(tp_high_adx_wins) + len(tp_high_adx_losses) >= 5:
        wr = len(tp_high_adx_wins) / (len(tp_high_adx_wins) + len(tp_high_adx_losses))
        if wr < 0.40:
            rules.append(f"Block trend_pullback when ADX > 50 (win rate: {wr:.0%} from {len(tp_high_adx_wins)+len(tp_high_adx_losses)} trades)")

    # BB reversion during high-volume sessions
    for cell in session_data:
        if cell["strategy"] == "bb_reversion" and cell["trades"] >= 5 and cell["win_rate"] < 0.35:
            rules.append(
                f"Block bb_reversion during {cell['session']} session "
                f"(win rate: {cell['win_rate']:.0%}, {cell['trades']} trades, avg PnL: ${cell['avg_pnl']:.2f})"
            )

    # Pairs with >3 losses and <30% win rate
    pair_stats: Dict[str, Dict] = {}
    for t in wins + losses:
        sym = t.get("symbol", "?")
        if sym not in pair_stats:
            pair_stats[sym] = {"wins": 0, "losses": 0}
        if _safe_float(t.get("pnl")) > 0:
            pair_stats[sym]["wins"] += 1
        else:
            pair_stats[sym]["losses"] += 1
    for sym, s in pair_stats.items():
        n = s["wins"] + s["losses"]
        if n >= 4 and s["wins"] / n < 0.30:
            rules.append(f"Consider disabling {sym} (win rate: {s['wins']/n:.0%} over {n} trades)")

    return rules if rules else ["No blacklist conditions detected — strategy is performing within norms"]


def _derive_thresholds(wins: List[Dict]) -> List[str]:
    """Find high-confidence entry conditions from winning trades."""
    if len(wins) < MIN_TRADES_FOR_CONCLUSIONS:
        return [f"Insufficient winning trades ({len(wins)}) for threshold analysis"]

    thresholds = []

    # RSI sweet spot for winning trend_pullback longs
    tp_long_wins = [t for t in wins if t.get("strategy") == "trend_pullback" and t.get("side") == "long"]
    if len(tp_long_wins) >= 5:
        rsi_vals = [_safe_float((t.get("entryIndicators") or {}).get("rsi_14")) for t in tp_long_wins if t.get("entryIndicators")]
        rsi_vals = [v for v in rsi_vals if v > 0]
        if rsi_vals:
            thresholds.append(
                f"trend_pullback LONG: winning RSI sweet spot {round(_percentile(rsi_vals,25),1)}–{round(_percentile(rsi_vals,75),1)} "
                f"(p25–p75 of {len(rsi_vals)} winning entries)"
            )

    # ATR threshold for XAUUSD
    xau_wins = [t for t in wins if t.get("symbol") == "XAUUSD"]
    if len(xau_wins) >= 3:
        atr_vals = [_safe_float((t.get("entryIndicators") or {}).get("atr")) for t in xau_wins if t.get("entryIndicators")]
        atr_vals = [v for v in atr_vals if v > 0]
        if atr_vals:
            thresholds.append(
                f"XAUUSD: optimal ATR range {round(_percentile(atr_vals,25),2)}–{round(_percentile(atr_vals,75),2)} "
                f"(p25–p75 of {len(atr_vals)} winning trades)"
            )

    # Highest profit-factor pairs
    pf: Dict[str, Dict] = {}
    for t in wins:
        sym = t.get("symbol", "?")
        pf.setdefault(sym, {"wins": 0, "total_win": 0.0, "total_loss": 0.0})
        pf[sym]["wins"] += 1
        pf[sym]["total_win"] += _safe_float(t.get("pnl"))
    for t in [x for x in wins if _safe_float(x.get("pnl")) <= 0]:  # shouldn't happen but be safe
        sym = t.get("symbol", "?")
        pf.setdefault(sym, {"wins": 0, "total_win": 0.0, "total_loss": 0.0})
        pf[sym]["total_loss"] += abs(_safe_float(t.get("pnl")))

    top_pf = sorted(
        [(sym, d["total_win"]) for sym, d in pf.items() if d["wins"] >= 3],
        key=lambda x: x[1], reverse=True
    )[:3]
    for sym, total_win in top_pf:
        thresholds.append(f"Priority pair: {sym} — ${total_win:.2f} total profit from winning trades")

    return thresholds if thresholds else ["No high-confidence thresholds yet — more trades needed"]


# ── Main engine ───────────────────────────────────────────────────────────────

def _pip_size(symbol: str) -> float:
    if "JPY" in symbol or "XAU" in symbol or "XAG" in symbol:
        return 0.01
    return 0.0001


def _ema(values: List[float], period: int) -> float:
    if len(values) < period:
        return values[-1] if values else 0.0
    k = 2 / (period + 1)
    ema = sum(values[:period]) / period
    for v in values[period:]:
        ema = v * k + ema * (1 - k)
    return ema


def _rsi(closes: List[float], period: int = 14) -> float:
    if len(closes) < period + 1:
        return 50.0
    deltas = [closes[i] - closes[i-1] for i in range(1, len(closes))]
    gains = [max(d, 0) for d in deltas[-period:]]
    losses = [abs(min(d, 0)) for d in deltas[-period:]]
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 1)


class BrainGym:
    def __init__(self, api_url: str, mt5=None):
        self.api_url = api_url.rstrip("/")
        self.analytics_lookback_window: str = "7d"  # all_time | 30d | 7d | 1d
        self.mt5 = mt5  # MetaTrader5 module — enables deep per-trade bar analysis

    async def _fetch_trades(self, lookback: str) -> List[Dict]:
        """Fetch closed trades from the API server."""
        url = f"{self.api_url}/trades?status=closed&limit=1000"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    if resp.status != 200:
                        log.warning(f"Brain Gym: failed to fetch trades — HTTP {resp.status}")
                        return []
                    data = await resp.json()
                    # Trades endpoint returns {"trades": [...], "total": N}
                    if isinstance(data, dict):
                        trades = data.get("trades", [])
                    elif isinstance(data, list):
                        trades = data
                    else:
                        trades = []
        except Exception as e:
            log.error(f"Brain Gym: could not fetch trades: {e}")
            return []

        # Apply lookback filter
        if lookback == "all_time":
            return trades
        cutoffs = {"30d": 30, "7d": 7, "1d": 1}
        days = cutoffs.get(lookback, 7)
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        filtered = []
        for t in trades:
            opened = t.get("openedAt") or t.get("opened_at") or ""
            try:
                dt = datetime.fromisoformat(opened.replace("Z", "+00:00"))
                if dt >= cutoff:
                    filtered.append(t)
            except Exception:
                filtered.append(t)
        return filtered

    async def _post_trade_analysis(self, trade_id: int, analysis: Dict) -> bool:
        """Store deep analysis for a single trade."""
        url = f"{self.api_url}/trades/{trade_id}/deep-analysis"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.patch(
                    url,
                    json={"analysis": analysis},
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    return resp.status == 200
        except Exception as e:
            log.warning(f"Brain Gym: failed to save trade {trade_id} analysis: {e}")
            return False

    def _deep_analyze_trade_sync(self, trade: Dict) -> Optional[Dict]:
        """
        Fetch real MT5 H1 bars for a trade and compute:
          - Real MAE / MFE in pips from actual bar data
          - Trend at entry (uptrend / downtrend / sideways)
          - Whether entry was WITH or AGAINST the trend
          - RSI, EMA200 state at entry
          - What price did after exit (reversed or continued against us?)
          - Plain-language verdict on why the trade won or lost
        """
        if self.mt5 is None:
            return None

        mt5 = self.mt5
        symbol = trade.get("symbol", "")
        side   = trade.get("side", "long")
        pnl    = _safe_float(trade.get("pnl"))

        try:
            opened_str = trade.get("openedAt") or trade.get("opened_at") or ""
            closed_str = trade.get("closedAt") or trade.get("closed_at") or ""
            opened_at  = datetime.fromisoformat(opened_str.replace("Z", "+00:00")).replace(tzinfo=None)
            closed_at  = datetime.fromisoformat(closed_str.replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            return None

        # Fetch H1 bars: 72h before entry → 24h after exit (gives enough pre-history for indicators)
        from_dt = opened_at - timedelta(hours=72)
        to_dt   = closed_at + timedelta(hours=24)

        bars = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_H1, from_dt, to_dt)
        if bars is None or len(bars) < 5:
            return None

        bar_times = [datetime.utcfromtimestamp(int(b["time"])) for b in bars]
        closes    = [float(b["close"]) for b in bars]
        highs     = [float(b["high"])  for b in bars]
        lows      = [float(b["low"])   for b in bars]

        # Locate entry and exit bars
        entry_idx = next((i for i, t in enumerate(bar_times) if t >= opened_at), len(bars) - 1)
        exit_idx  = next((i for i, t in enumerate(bar_times) if t >= closed_at), len(bars) - 1)

        entry_price = _safe_float(trade.get("entryPrice") or trade.get("entry_price"))
        pip = _pip_size(symbol)

        # Real MAE / MFE from actual trade bars
        trade_highs = highs[entry_idx : exit_idx + 1]
        trade_lows  = lows[entry_idx  : exit_idx + 1]
        if trade_highs and trade_lows:
            if side == "long":
                mae_pips = round((min(trade_lows)  - entry_price) / pip, 1)
                mfe_pips = round((max(trade_highs) - entry_price) / pip, 1)
            else:
                mae_pips = round((entry_price - max(trade_highs)) / pip, 1)
                mfe_pips = round((entry_price - min(trade_lows))  / pip, 1)
        else:
            mae_pips = mfe_pips = 0.0

        # Pre-entry context — last 20 H1 bars
        pre_closes = closes[max(0, entry_idx - 20) : entry_idx]
        trend = "sideways"
        if len(pre_closes) >= 5:
            slope = pre_closes[-1] - pre_closes[0]
            threshold = pip * 15  # 15 pips to call a trend
            if slope > threshold:
                trend = "uptrend"
            elif slope < -threshold:
                trend = "downtrend"

        # EMA200 at entry
        ema200_str = "unknown"
        pre200 = closes[max(0, entry_idx - 200) : entry_idx + 1]
        if len(pre200) >= 20:
            ema200_val = _ema(pre200, min(200, len(pre200)))
            ema200_str = "above_ema200" if entry_price > ema200_val else "below_ema200"

        # RSI at entry
        rsi_at_entry = _rsi(closes[max(0, entry_idx - 30) : entry_idx + 1])

        # Entry alignment with trend
        if trend == "uptrend" and side == "long":
            alignment = "with_trend"
        elif trend == "downtrend" and side == "short":
            alignment = "with_trend"
        elif trend in ("uptrend", "downtrend"):
            alignment = "against_trend"
        else:
            alignment = "neutral"

        # Post-exit: did price continue against us or reverse?
        post_closes = closes[exit_idx : min(exit_idx + 6, len(closes))]
        post_move = None
        if len(post_closes) >= 2:
            delta = post_closes[-1] - post_closes[0]
            if side == "long":
                post_move = "reversed_up"   if delta > 0 else "continued_down"
            else:
                post_move = "reversed_down" if delta < 0 else "continued_up"

        # Duration
        duration_h = round((closed_at - opened_at).total_seconds() / 3600, 1)

        # Verdict — plain English reasons
        reasons = []
        if alignment == "against_trend":
            reasons.append(f"entered {side} into a {trend} — trading against momentum")
        if mae_pips < -30:
            reasons.append(f"price moved {abs(mae_pips):.0f} pips against us immediately after entry")
        if mfe_pips > 0 and mae_pips < 0 and abs(mae_pips) > mfe_pips * 1.5:
            reasons.append("adverse excursion was much larger than favorable — entry timing was poor")
        if post_move in ("reversed_up", "reversed_down") and pnl < 0:
            reasons.append("price reversed in our direction after we were stopped — premature exit or SL too tight")
        if mfe_pips > 20 and pnl < 0:
            reasons.append(f"trade reached +{mfe_pips:.0f} pips in profit before reversing — missed TP or exit too early")
        if not reasons:
            if pnl > 0:
                reasons.append("conditions aligned, trade followed the signal correctly")
            else:
                reasons.append("market moved against the signal without clear structural trigger")

        verdict = ("WIN" if pnl > 0 else "LOSS") + ": " + "; ".join(reasons)

        return {
            "mae_pips":        mae_pips,
            "mfe_pips":        mfe_pips,
            "duration_hours":  duration_h,
            "trend_at_entry":  trend,
            "entry_alignment": alignment,
            "ema200":          ema200_str,
            "rsi_at_entry":    rsi_at_entry,
            "post_exit_move":  post_move,
            "bars_analyzed":   len(bars),
            "verdict":         verdict,
            "analyzed_at":     datetime.utcnow().isoformat() + "Z",
        }

    async def _post_report(self, report: Dict) -> bool:
        """Save the report to the API server."""
        url = f"{self.api_url}/analytics/brain-gym/report"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    json={"lookback": self.analytics_lookback_window, "report": report, "tradeCount": str(report.get("total_trades", 0))},
                    timeout=aiohttp.ClientTimeout(total=15)
                ) as resp:
                    return resp.status in (200, 201)
        except Exception as e:
            log.error(f"Brain Gym: could not save report: {e}")
            return False

    async def run(self, lookback: Optional[str] = None, emit_log=None) -> Optional[Dict]:
        """
        Run the full analytics pipeline.
        Returns the report dict (also posted to API).
        """
        lb = lookback or self.analytics_lookback_window
        self.analytics_lookback_window = lb

        def _log(msg: str):
            log.info(f"[brain_gym] {msg}")
            if emit_log:
                asyncio.ensure_future(emit_log("brain_gym", msg))

        _log(f"Starting Brain Gym analysis — lookback={lb}")
        trades = await self._fetch_trades(lb)

        if not trades:
            _log("No closed trades found — skipping analysis")
            return None

        # Annotate session if not stored
        for t in trades:
            if not t.get("session"):
                opened = t.get("openedAt") or t.get("opened_at") or ""
                try:
                    dt = datetime.fromisoformat(opened.replace("Z", "+00:00"))
                    t["session"] = _session(dt)
                except Exception:
                    t["session"] = "unknown"

        wins   = [t for t in trades if _safe_float(t.get("pnl")) > 0]
        losses = [t for t in trades if _safe_float(t.get("pnl")) <= 0]
        n = len(trades)

        _log(f"Analysing {n} trades: {len(wins)} wins / {len(losses)} losses")

        total_pnl = sum(_safe_float(t.get("pnl")) for t in trades)
        win_pnls  = [_safe_float(t.get("pnl")) for t in wins]
        loss_pnls = [abs(_safe_float(t.get("pnl"))) for t in losses]
        avg_win   = _mean(win_pnls)
        avg_loss  = _mean(loss_pnls)
        profit_factor = sum(win_pnls) / sum(loss_pnls) if sum(loss_pnls) > 0 else float("inf")

        # Channel A: post-mortem
        loss_distributions = _indicator_distribution(losses)
        # Channel B: alpha analysis
        win_distributions  = _indicator_distribution(wins)

        session_data = _session_matrix(trades)
        mae_mfe      = _mae_mfe_analysis(wins, losses)
        corr_clusters = _correlation_clusters(losses)
        blacklist    = _derive_blacklist(wins, losses, session_data)
        thresholds   = _derive_thresholds(wins)

        report: Dict[str, Any] = {
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "lookback": lb,
            "total_trades": n,
            "sufficient_data": n >= MIN_TRADES_FOR_CONCLUSIONS,
            "summary": {
                "wins": len(wins),
                "losses": len(losses),
                "win_rate": round(len(wins) / n, 3) if n > 0 else 0,
                "total_pnl": round(total_pnl, 2),
                "avg_win": round(avg_win, 2),
                "avg_loss": round(avg_loss, 2),
                "profit_factor": round(profit_factor, 3) if profit_factor != float("inf") else "∞",
                "expectancy": round(len(wins)/n * avg_win - len(losses)/n * avg_loss, 2) if n > 0 else 0,
            },
            "channel_a_post_mortem": {
                "description": "Indicator distributions at entry for losing trades",
                "loss_indicator_distributions": loss_distributions,
                "correlation_clusters": corr_clusters,
            },
            "channel_b_alpha": {
                "description": "Indicator distributions at entry for winning trades",
                "win_indicator_distributions": win_distributions,
            },
            "session_matrix": session_data,
            "mae_mfe_analysis": mae_mfe,
            "blacklisted_conditions": blacklist,
            "high_confidence_thresholds": thresholds,
        }

        saved = await self._post_report(report)
        _log(f"Brain Gym complete — win_rate={report['summary']['win_rate']:.0%}, "
             f"profit_factor={report['summary']['profit_factor']}, "
             f"report {'saved' if saved else 'FAILED to save'}")

        # ── Deep per-trade analysis (only when running inside the bot with MT5) ──
        if self.mt5 is not None:
            unanalyzed = [t for t in trades if not t.get("analyzedAt") and not t.get("analyzed_at") and t.get("id")]
            total_un = len(unanalyzed)
            if total_un > 0:
                _log(f"Deep analysis starting — {total_un} trades to examine")
                done = 0
                for t in unanalyzed:
                    analysis = await asyncio.get_event_loop().run_in_executor(
                        None, self._deep_analyze_trade_sync, t
                    )
                    if analysis:
                        await self._post_trade_analysis(int(t["id"]), analysis)
                    done += 1
                    pct = round(done / total_un * 100)
                    if done % 5 == 0 or done == total_un:
                        _log(f"Deep analysis: {done}/{total_un} trades ({pct}%)")
                _log(f"Deep analysis complete — all {total_un} trades dissected")
            else:
                _log("Deep analysis: all trades already analyzed — nothing to do")

        return report
