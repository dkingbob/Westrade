"""
Trading strategies — uses real MT5 H1 OHLC bars for all indicator calculations.
Signals only fire when multiple indicators align; minimum 50 bars required.
"""

import logging
import math
from typing import List, Dict, Optional, Tuple

log = logging.getLogger("algodesk.strategies")

_mt5 = None
# Stores H1 close prices per symbol, populated by initialize_history()
_price_cache: Dict[str, List[float]] = {}
_high_cache: Dict[str, List[float]] = {}
_low_cache: Dict[str, List[float]] = {}

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
            _high_cache[symbol] = [float(r[2]) for r in rates]   # high
            _low_cache[symbol] = [float(r[3]) for r in rates]    # low
            log.info(f"Loaded {len(rates)} H1 bars for {symbol}")
        else:
            log.warning(f"Could not load H1 history for {symbol}")


async def fetch_price(symbol: str) -> Optional[float]:
    """Get current mid price from MT5 tick and append to H1-seeded cache."""
    if _mt5 is not None:
        tick = _mt5.symbol_info_tick(symbol)
        if tick is not None:
            price = (tick.ask + tick.bid) / 2
            if symbol not in _price_cache:
                _price_cache[symbol] = []
            _price_cache[symbol].append(price)
            if len(_price_cache[symbol]) > 500:
                _price_cache[symbol] = _price_cache[symbol][-300:]
            return price
    return None


# ── Indicators ────────────────────────────────────────────────────────────────

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
    gains = [d if d > 0 else 0.0 for d in deltas[-period:]]
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

    # Signal line = EMA of last `signal` MACD values
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
    """Build a full indicator snapshot for Gemini context."""
    prices = _price_cache.get(symbol, [])
    highs = _high_cache.get(symbol, prices)
    lows = _low_cache.get(symbol, prices)
    if not prices:
        return {}
    r = rsi(prices)
    macd_line, sig_line, hist = macd(prices)
    upper, mid, lower = bollinger(prices)
    ema20 = ema(prices, 20)
    ema50 = ema(prices, 50) if len(prices) >= 50 else ema20
    at = atr(highs, lows, prices)
    z = z_score(prices)
    last = prices[-1]
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

    def __init__(self, symbols: List[str], risk_pct: float = 0.01, z_threshold: float = 2.2):
        self.symbols = symbols
        self.risk_pct = risk_pct
        self.z_threshold = z_threshold

    async def generate_signals(self) -> List[Dict]:
        signals = []
        for symbol in self.symbols:
            prices = _price_cache.get(symbol, [])
            if len(prices) < MIN_BARS:
                log.debug(f"[{self.name}] {symbol}: only {len(prices)} bars, waiting for {MIN_BARS}")
                continue

            price = await fetch_price(symbol)
            if price is None:
                continue

            prices = _price_cache[symbol]
            z = z_score(prices)
            r = rsi(prices)
            _, _, macd_hist = macd(prices)
            ema20 = ema(prices, 20)
            ema50 = ema(prices, 50) if len(prices) >= 50 else ema20

            # Long: price stretched down + RSI oversold + MACD turning up
            if z < -self.z_threshold and r < 38 and macd_hist > -0.00005:
                signals.append({
                    "symbol": symbol, "side": "long", "strategy": self.name,
                    "price": price, "risk_pct": self.risk_pct,
                    "z_score": round(z, 4), "rsi": round(r, 1),
                    "indicators": build_indicator_snapshot(symbol),
                })

            # Short: price stretched up + RSI overbought + MACD turning down
            elif z > self.z_threshold and r > 62 and macd_hist < 0.00005:
                signals.append({
                    "symbol": symbol, "side": "short", "strategy": self.name,
                    "price": price, "risk_pct": self.risk_pct,
                    "z_score": round(z, 4), "rsi": round(r, 1),
                    "indicators": build_indicator_snapshot(symbol),
                })
        return signals


class MomentumStrategy:
    name = "momentum"

    def __init__(self, symbols: List[str], risk_pct: float = 0.012):
        self.symbols = symbols
        self.risk_pct = risk_pct

    async def generate_signals(self) -> List[Dict]:
        signals = []
        for symbol in self.symbols:
            prices = _price_cache.get(symbol, [])
            if len(prices) < MIN_BARS:
                continue

            price = await fetch_price(symbol)
            if price is None:
                continue

            prices = _price_cache[symbol]
            r = rsi(prices)
            macd_line, sig_line, macd_hist = macd(prices)
            ema20 = ema(prices, 20)
            ema50 = ema(prices, 50) if len(prices) >= 50 else ema20

            # Long: RSI recovering from oversold + MACD bullish crossover + price above EMA20
            if r < 32 and macd_hist > 0 and macd_line > sig_line and price > ema20 * 0.999:
                signals.append({
                    "symbol": symbol, "side": "long", "strategy": self.name,
                    "price": price, "risk_pct": self.risk_pct,
                    "z_score": None, "rsi": round(r, 1),
                    "indicators": build_indicator_snapshot(symbol),
                })

            # Short: RSI falling from overbought + MACD bearish + price below EMA20
            elif r > 68 and macd_hist < 0 and macd_line < sig_line and price < ema20 * 1.001:
                signals.append({
                    "symbol": symbol, "side": "short", "strategy": self.name,
                    "price": price, "risk_pct": self.risk_pct,
                    "z_score": None, "rsi": round(r, 1),
                    "indicators": build_indicator_snapshot(symbol),
                })
        return signals


class StatArbStrategy:
    name = "statistical_arb"

    def __init__(self, symbols: List[str], risk_pct: float = 0.008):
        self.symbols = symbols
        self.risk_pct = risk_pct

    async def generate_signals(self) -> List[Dict]:
        signals = []
        for symbol in self.symbols:
            prices = _price_cache.get(symbol, [])
            if len(prices) < MIN_BARS:
                continue

            price = await fetch_price(symbol)
            if price is None:
                continue

            prices = _price_cache[symbol]
            highs = _high_cache.get(symbol, prices)
            lows = _low_cache.get(symbol, prices)
            upper, mid, lower = bollinger(prices)
            r = rsi(prices)
            at = atr(highs, lows, prices)
            _, _, macd_hist = macd(prices)

            # Only trade when volatility is moderate (ATR not extreme)
            avg_price = mid
            atr_pct = at / avg_price if avg_price > 0 else 0

            # Long: price touching lower Bollinger band + RSI not crashing + low ATR
            if price <= lower * 1.001 and r > 25 and r < 45 and atr_pct < 0.008:
                signals.append({
                    "symbol": symbol, "side": "long", "strategy": self.name,
                    "price": price, "risk_pct": self.risk_pct,
                    "z_score": round((price - mid) / (upper - lower) * 2, 4) if upper != lower else 0,
                    "rsi": round(r, 1),
                    "indicators": build_indicator_snapshot(symbol),
                })

            # Short: price touching upper Bollinger band + RSI not spiking + low ATR
            elif price >= upper * 0.999 and r > 55 and r < 75 and atr_pct < 0.008:
                signals.append({
                    "symbol": symbol, "side": "short", "strategy": self.name,
                    "price": price, "risk_pct": self.risk_pct,
                    "z_score": round((price - mid) / (upper - lower) * 2, 4) if upper != lower else 0,
                    "rsi": round(r, 1),
                    "indicators": build_indicator_snapshot(symbol),
                })
        return signals
