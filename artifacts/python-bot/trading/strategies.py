"""
Trading strategies — uses real MT5 H1 OHLC bars for indicator calculations.

Key rules:
  - _price_cache / _high_cache / _low_cache hold H1 closes ONLY (never tick data)
  - _current_price holds the latest tick mid-price for order entry
  - Signals have a 4-hour per-symbol cooldown to avoid over-trading
  - Minimum 50 H1 bars required before any strategy fires
"""

import logging
import math
import time
from typing import List, Dict, Optional, Tuple

log = logging.getLogger("algodesk.strategies")

_mt5 = None

# H1 OHLC caches — populated by initialize_history(), NEVER written by fetch_price
_price_cache: Dict[str, List[float]] = {}   # H1 closes
_high_cache:  Dict[str, List[float]] = {}   # H1 highs
_low_cache:   Dict[str, List[float]] = {}   # H1 lows

# Current tick price for order entry — separate from indicator data
_current_price: Dict[str, float] = {}

# Cooldown: track when the last signal was *generated* per symbol (unix timestamp)
_last_signal_time: Dict[str, float] = {}
SIGNAL_COOLDOWN_SECONDS = 2 * 3600  # 2 hours minimum between signals per symbol

MIN_BARS = 50  # minimum H1 bars before any strategy fires


def set_mt5(mt5_module):
    global _mt5
    _mt5 = mt5_module


def initialize_history(symbols: List[str]):
    """Fetch 200 H1 bars from MT5 for each symbol on startup."""
    if _mt5 is None:
        return
    for symbol in symbols:
        rates = _mt5.copy_rates_from_pos(symbol, _mt5.TIMEFRAME_H1, 0, 200)
        if rates is not None and len(rates) > 0:
            _price_cache[symbol] = [float(r[4]) for r in rates]  # close
            _high_cache[symbol]  = [float(r[2]) for r in rates]  # high
            _low_cache[symbol]   = [float(r[3]) for r in rates]  # low
            log.info(f"Loaded {len(rates)} H1 bars for {symbol}")
        else:
            log.warning(f"Could not load H1 history for {symbol}")


def refresh_latest_h1(symbols: List[str]):
    """Pull the last 3 H1 bars and update the tail of the cache (call hourly)."""
    if _mt5 is None:
        return
    for symbol in symbols:
        if symbol not in _price_cache:
            continue
        rates = _mt5.copy_rates_from_pos(symbol, _mt5.TIMEFRAME_H1, 0, 3)
        if rates is not None and len(rates) > 0:
            for r in rates:
                close = float(r[4])
                high  = float(r[2])
                low   = float(r[3])
                # Append only if this is a newer close than the last stored value
                if close != _price_cache[symbol][-1]:
                    _price_cache[symbol].append(close)
                    _high_cache[symbol].append(high)
                    _low_cache[symbol].append(low)
                    if len(_price_cache[symbol]) > 500:
                        _price_cache[symbol] = _price_cache[symbol][-300:]
                        _high_cache[symbol]  = _high_cache[symbol][-300:]
                        _low_cache[symbol]   = _low_cache[symbol][-300:]


async def fetch_price(symbol: str) -> Optional[float]:
    """Get current mid-price from MT5 tick. Stores in _current_price only — never touches H1 cache."""
    if _mt5 is not None:
        tick = _mt5.symbol_info_tick(symbol)
        if tick is not None:
            price = (tick.ask + tick.bid) / 2
            _current_price[symbol] = price
            return price
    return None


def _on_cooldown(symbol: str) -> bool:
    last = _last_signal_time.get(symbol, 0)
    return (time.time() - last) < SIGNAL_COOLDOWN_SECONDS


def _set_cooldown(symbol: str):
    _last_signal_time[symbol] = time.time()


# ── Indicators (operate on H1 closes only) ───────────────────────────────────

def ema(prices: List[float], period: int) -> float:
    if len(prices) < period:
        return prices[-1] if prices else 0.0
    k = 2 / (period + 1)
    val = sum(prices[:period]) / period
    for p in prices[period:]:
        val = p * k + val * (1 - k)
    return val


def rsi(prices: List[float], period: int = 14) -> float:
    if len(prices) < period + 1:
        return 50.0
    deltas = [prices[i] - prices[i - 1] for i in range(1, len(prices))]
    gains  = [d if d > 0 else 0.0 for d in deltas[-period:]]
    losses = [-d if d < 0 else 0.0 for d in deltas[-period:]]
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100.0
    return 100.0 - (100.0 / (1.0 + avg_gain / avg_loss))


def macd(prices: List[float], fast: int = 12, slow: int = 26, signal: int = 9) -> Tuple[float, float, float]:
    """Returns (macd_line, signal_line, histogram)."""
    if len(prices) < slow + signal:
        return 0.0, 0.0, 0.0
    fast_ema = ema(prices, fast)
    slow_ema = ema(prices, slow)
    macd_line = fast_ema - slow_ema

    macd_series = []
    for i in range(signal + 5):
        idx = -(signal + 5 - i)
        subset = prices[:idx] if idx < 0 else prices
        if len(subset) >= slow:
            f = ema(subset, fast)
            s = ema(subset, slow)
            macd_series.append(f - s)
    signal_line = ema(macd_series, signal) if len(macd_series) >= signal else macd_line
    return macd_line, signal_line, macd_line - signal_line


def bollinger(prices: List[float], period: int = 20, num_std: float = 2.0) -> Tuple[float, float, float]:
    """Returns (upper, middle, lower)."""
    if len(prices) < period:
        p = prices[-1]
        return p, p, p
    window = prices[-period:]
    mid = sum(window) / period
    std = math.sqrt(sum((p - mid) ** 2 for p in window) / period)
    return mid + num_std * std, mid, mid - num_std * std


def atr(highs: List[float], lows: List[float], closes: List[float], period: int = 14) -> float:
    if len(closes) < period + 1:
        return 0.0
    trs = []
    for i in range(1, len(closes)):
        tr = max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
        trs.append(tr)
    return sum(trs[-period:]) / period


def z_score(prices: List[float], window: int = 20) -> float:
    if len(prices) < window:
        return 0.0
    w = prices[-window:]
    mean = sum(w) / len(w)
    std = math.sqrt(sum((p - mean) ** 2 for p in w) / len(w))
    if std == 0:
        return 0.0
    return (prices[-1] - mean) / std


def build_indicator_snapshot(symbol: str) -> dict:
    """Build a full indicator snapshot for Gemini context (uses H1 data only)."""
    prices = _price_cache.get(symbol, [])
    highs  = _high_cache.get(symbol, prices)
    lows   = _low_cache.get(symbol, prices)
    if not prices:
        return {}
    r = rsi(prices)
    macd_line, sig_line, hist = macd(prices)
    upper, mid, lower = bollinger(prices)
    ema20 = ema(prices, 20)
    ema50 = ema(prices, 50) if len(prices) >= 50 else ema20
    at    = atr(highs, lows, prices)
    z     = z_score(prices)
    last  = prices[-1]
    last10 = [round(p, 5) for p in prices[-10:]]
    return {
        "price": round(last, 5),
        "last_10_h1_closes": last10,
        "rsi_14": round(r, 2),
        "macd_line": round(macd_line, 6),
        "macd_signal": round(sig_line, 6),
        "macd_hist": round(hist, 6),
        "ema_20": round(ema20, 5),
        "ema_50": round(ema50, 5),
        "trend": "bullish" if ema20 > ema50 else "bearish",
        "bb_upper": round(upper, 5),
        "bb_mid": round(mid, 5),
        "bb_lower": round(lower, 5),
        "bb_position_pct": round((last - lower) / (upper - lower) * 100, 1) if upper != lower else 50.0,
        "atr": round(at, 6),
        "z_score": round(z, 3),
    }


# ── Strategies ────────────────────────────────────────────────────────────────

class MeanReversionStrategy:
    name = "mean_reversion"

    def __init__(self, symbols: List[str], risk_pct: float = 0.05, z_threshold: float = 1.8):
        self.symbols = symbols
        self.risk_pct = risk_pct
        self.z_threshold = z_threshold

    async def generate_signals(self) -> List[Dict]:
        signals = []
        for symbol in self.symbols:
            prices = _price_cache.get(symbol, [])
            if len(prices) < MIN_BARS:
                log.debug(f"[{self.name}] {symbol}: only {len(prices)} H1 bars, need {MIN_BARS}")
                continue
            if _on_cooldown(symbol):
                continue

            price = await fetch_price(symbol)
            if price is None:
                continue

            z = z_score(prices)
            r = rsi(prices)
            _, _, macd_hist = macd(prices)
            ema20 = ema(prices, 20)
            ema50 = ema(prices, 50) if len(prices) >= 50 else ema20

            # Long: stretched down + RSI oversold + MACD turning up
            if z < -self.z_threshold and r < 42 and macd_hist > 0:
                log.info(f"[{self.name}] LONG signal {symbol}: z={z:.2f}, rsi={r:.1f}, macd_hist={macd_hist:.6f}")
                _set_cooldown(symbol)
                signals.append({
                    "symbol": symbol, "side": "long", "strategy": self.name,
                    "price": price, "risk_pct": self.risk_pct,
                    "z_score": round(z, 4), "rsi": round(r, 1),
                    "indicators": build_indicator_snapshot(symbol),
                })

            # Short: stretched up + RSI overbought + MACD turning down
            elif z > self.z_threshold and r > 58 and macd_hist < 0:
                log.info(f"[{self.name}] SHORT signal {symbol}: z={z:.2f}, rsi={r:.1f}, macd_hist={macd_hist:.6f}")
                _set_cooldown(symbol)
                signals.append({
                    "symbol": symbol, "side": "short", "strategy": self.name,
                    "price": price, "risk_pct": self.risk_pct,
                    "z_score": round(z, 4), "rsi": round(r, 1),
                    "indicators": build_indicator_snapshot(symbol),
                })
        return signals


class MomentumStrategy:
    name = "momentum"

    def __init__(self, symbols: List[str], risk_pct: float = 0.05):
        self.symbols = symbols
        self.risk_pct = risk_pct

    async def generate_signals(self) -> List[Dict]:
        signals = []
        for symbol in self.symbols:
            prices = _price_cache.get(symbol, [])
            if len(prices) < MIN_BARS:
                continue
            if _on_cooldown(symbol):
                continue

            price = await fetch_price(symbol)
            if price is None:
                continue

            r = rsi(prices)
            macd_line, sig_line, macd_hist = macd(prices)
            ema20 = ema(prices, 20)
            ema50 = ema(prices, 50) if len(prices) >= 50 else ema20

            # Long: RSI oversold + MACD positive crossover + price above EMA20
            if r < 38 and macd_hist > 0 and macd_line > sig_line and price > ema20:
                log.info(f"[{self.name}] LONG signal {symbol}: rsi={r:.1f}, macd_hist={macd_hist:.6f}")
                _set_cooldown(symbol)
                signals.append({
                    "symbol": symbol, "side": "long", "strategy": self.name,
                    "price": price, "risk_pct": self.risk_pct,
                    "z_score": None, "rsi": round(r, 1),
                    "indicators": build_indicator_snapshot(symbol),
                })

            # Short: RSI overbought + MACD negative crossover + price below EMA20
            elif r > 62 and macd_hist < 0 and macd_line < sig_line and price < ema20:
                log.info(f"[{self.name}] SHORT signal {symbol}: rsi={r:.1f}, macd_hist={macd_hist:.6f}")
                _set_cooldown(symbol)
                signals.append({
                    "symbol": symbol, "side": "short", "strategy": self.name,
                    "price": price, "risk_pct": self.risk_pct,
                    "z_score": None, "rsi": round(r, 1),
                    "indicators": build_indicator_snapshot(symbol),
                })
        return signals


class StatArbStrategy:
    name = "statistical_arb"

    def __init__(self, symbols: List[str], risk_pct: float = 0.05):
        self.symbols = symbols
        self.risk_pct = risk_pct

    async def generate_signals(self) -> List[Dict]:
        signals = []
        for symbol in self.symbols:
            prices = _price_cache.get(symbol, [])
            if len(prices) < MIN_BARS:
                continue
            if _on_cooldown(symbol):
                continue

            price = await fetch_price(symbol)
            if price is None:
                continue

            highs  = _high_cache.get(symbol, prices)
            lows   = _low_cache.get(symbol, prices)
            upper, mid, lower = bollinger(prices)
            r  = rsi(prices)
            at = atr(highs, lows, prices)
            _, _, macd_hist = macd(prices)
            atr_pct = at / mid if mid > 0 else 0

            # Long: price at/below lower BB + RSI 25-48 + not extreme volatility + MACD turning up
            if price <= lower * 1.002 and 25 < r < 48 and atr_pct < 0.008 and macd_hist > 0:
                log.info(f"[{self.name}] LONG signal {symbol}: price={price:.5f}, lower={lower:.5f}, rsi={r:.1f}")
                _set_cooldown(symbol)
                signals.append({
                    "symbol": symbol, "side": "long", "strategy": self.name,
                    "price": price, "risk_pct": self.risk_pct,
                    "z_score": round((price - mid) / (upper - lower) * 2, 4) if upper != lower else 0,
                    "rsi": round(r, 1),
                    "indicators": build_indicator_snapshot(symbol),
                })

            # Short: price at/above upper BB + RSI 52-75 + not extreme volatility + MACD turning down
            elif price >= upper * 0.998 and 52 < r < 75 and atr_pct < 0.008 and macd_hist < 0:
                log.info(f"[{self.name}] SHORT signal {symbol}: price={price:.5f}, upper={upper:.5f}, rsi={r:.1f}")
                _set_cooldown(symbol)
                signals.append({
                    "symbol": symbol, "side": "short", "strategy": self.name,
                    "price": price, "risk_pct": self.risk_pct,
                    "z_score": round((price - mid) / (upper - lower) * 2, 4) if upper != lower else 0,
                    "rsi": round(r, 1),
                    "indicators": build_indicator_snapshot(symbol),
                })
        return signals
