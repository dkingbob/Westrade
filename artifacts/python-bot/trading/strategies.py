"""
Trading strategies — Python implementations matching the backend simulation.
Each strategy generates signals (buy/sell/hold) based on price data.
"""

import asyncio
import logging
import random
import math
from datetime import datetime
from typing import List, Dict, Optional

log = logging.getLogger("algodesk.strategies")

# Simulated price store for paper mode
_price_cache: Dict[str, List[float]] = {}

BASE_PRICES = {
    "AAPL": 170.0, "MSFT": 380.0, "GOOGL": 165.0, "NVDA": 550.0,
    "TSLA": 200.0, "AMZN": 185.0, "SPY": 510.0, "QQQ": 430.0, "JPM": 195.0,
}


async def fetch_price(symbol: str) -> float:
    """
    Fetch current price. In live mode this would call MT5 or a market data API.
    In simulation mode we use GBM (Geometric Brownian Motion).
    """
    if symbol not in _price_cache:
        base = BASE_PRICES.get(symbol, 100.0)
        _price_cache[symbol] = [base * (1 + random.gauss(0, 0.002)) for _ in range(50)]

    last = _price_cache[symbol][-1]
    drift = 0.0001
    sigma = 0.002
    dt = 1 / 252
    change = last * math.exp((drift - 0.5 * sigma ** 2) * dt + sigma * math.sqrt(dt) * random.gauss(0, 1))
    _price_cache[symbol].append(change)
    if len(_price_cache[symbol]) > 200:
        _price_cache[symbol] = _price_cache[symbol][-200:]
    return change


def z_score(prices: List[float], window: int = 20) -> float:
    if len(prices) < window:
        return 0.0
    window_prices = prices[-window:]
    mean = sum(window_prices) / len(window_prices)
    variance = sum((p - mean) ** 2 for p in window_prices) / len(window_prices)
    std = variance ** 0.5
    if std == 0:
        return 0.0
    return (prices[-1] - mean) / std


def rsi(prices: List[float], period: int = 14) -> float:
    if len(prices) < period + 1:
        return 50.0
    deltas = [prices[i] - prices[i - 1] for i in range(1, len(prices))]
    gains = [d if d > 0 else 0 for d in deltas[-period:]]
    losses = [-d if d < 0 else 0 for d in deltas[-period:]]
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


class MeanReversionStrategy:
    name = "mean_reversion"

    def __init__(self, symbols: List[str], risk_pct: float = 0.01, lookback: int = 20, z_threshold: float = 2.0):
        self.symbols = symbols
        self.risk_pct = risk_pct
        self.lookback = lookback
        self.z_threshold = z_threshold

    async def generate_signals(self) -> List[Dict]:
        signals = []
        for symbol in self.symbols:
            price = await fetch_price(symbol)
            prices = _price_cache.get(symbol, [price])
            z = z_score(prices, self.lookback)

            if z < -self.z_threshold:
                signals.append({
                    "symbol": symbol, "side": "long", "strategy": self.name,
                    "price": price, "risk_pct": self.risk_pct, "z_score": round(z, 4),
                    "reason": f"Z-score {z:.2f} below -{self.z_threshold}",
                })
            elif z > self.z_threshold:
                signals.append({
                    "symbol": symbol, "side": "short", "strategy": self.name,
                    "price": price, "risk_pct": self.risk_pct, "z_score": round(z, 4),
                    "reason": f"Z-score {z:.2f} above +{self.z_threshold}",
                })
        return signals


class MomentumStrategy:
    name = "momentum"

    def __init__(self, symbols: List[str], risk_pct: float = 0.012, rsi_period: int = 14):
        self.symbols = symbols
        self.risk_pct = risk_pct
        self.rsi_period = rsi_period

    async def generate_signals(self) -> List[Dict]:
        signals = []
        for symbol in self.symbols:
            price = await fetch_price(symbol)
            prices = _price_cache.get(symbol, [price])
            r = rsi(prices, self.rsi_period)

            if r < 30:
                signals.append({
                    "symbol": symbol, "side": "long", "strategy": self.name,
                    "price": price, "risk_pct": self.risk_pct, "z_score": None,
                    "reason": f"RSI {r:.1f} oversold",
                })
            elif r > 70:
                signals.append({
                    "symbol": symbol, "side": "short", "strategy": self.name,
                    "price": price, "risk_pct": self.risk_pct, "z_score": None,
                    "reason": f"RSI {r:.1f} overbought",
                })
        return signals


class StatArbStrategy:
    name = "statistical_arb"

    def __init__(self, symbols: List[str], risk_pct: float = 0.008, vwap_threshold: float = 0.005):
        self.symbols = symbols
        self.risk_pct = risk_pct
        self.vwap_threshold = vwap_threshold

    async def generate_signals(self) -> List[Dict]:
        signals = []
        for symbol in self.symbols:
            price = await fetch_price(symbol)
            prices = _price_cache.get(symbol, [price])

            # VWAP approximation (equal-weight average as proxy)
            vwap = sum(prices[-20:]) / min(len(prices), 20)
            deviation = (price - vwap) / vwap

            if deviation < -self.vwap_threshold:
                signals.append({
                    "symbol": symbol, "side": "long", "strategy": self.name,
                    "price": price, "risk_pct": self.risk_pct, "z_score": round(deviation * 100, 4),
                    "reason": f"Price {deviation * 100:.2f}% below VWAP",
                })
            elif deviation > self.vwap_threshold:
                signals.append({
                    "symbol": symbol, "side": "short", "strategy": self.name,
                    "price": price, "risk_pct": self.risk_pct, "z_score": round(deviation * 100, 4),
                    "reason": f"Price {deviation * 100:.2f}% above VWAP",
                })
        return signals
