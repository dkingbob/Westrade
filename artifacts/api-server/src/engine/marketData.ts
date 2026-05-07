import { logger } from "../lib/logger";

export interface OhlcvBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Ticker {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  timestamp: string;
}

export interface SymbolInfo {
  symbol: string;
  name: string;
  sector: string;
  currentPrice: number;
  change24h: number;
  change24hPct: number;
  volume: number;
}

const SYMBOLS: SymbolInfo[] = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technology", currentPrice: 187.5, change24h: 2.3, change24hPct: 1.24, volume: 45_000_000 },
  { symbol: "MSFT", name: "Microsoft Corp.", sector: "Technology", currentPrice: 374.2, change24h: -1.8, change24hPct: -0.48, volume: 22_000_000 },
  { symbol: "GOOGL", name: "Alphabet Inc.", sector: "Technology", currentPrice: 142.1, change24h: 0.9, change24hPct: 0.64, volume: 18_000_000 },
  { symbol: "AMZN", name: "Amazon.com Inc.", sector: "Consumer Discretionary", currentPrice: 178.3, change24h: 3.1, change24hPct: 1.77, volume: 30_000_000 },
  { symbol: "NVDA", name: "NVIDIA Corp.", sector: "Technology", currentPrice: 495.8, change24h: 12.4, change24hPct: 2.57, volume: 55_000_000 },
  { symbol: "JPM", name: "JPMorgan Chase", sector: "Financials", currentPrice: 198.6, change24h: -0.7, change24hPct: -0.35, volume: 8_000_000 },
  { symbol: "GS", name: "Goldman Sachs", sector: "Financials", currentPrice: 432.1, change24h: 4.2, change24hPct: 0.98, volume: 3_000_000 },
  { symbol: "SPY", name: "S&P 500 ETF", sector: "ETF", currentPrice: 467.3, change24h: 1.2, change24hPct: 0.26, volume: 75_000_000 },
  { symbol: "QQQ", name: "Nasdaq 100 ETF", sector: "ETF", currentPrice: 395.8, change24h: 2.1, change24hPct: 0.53, volume: 40_000_000 },
  { symbol: "TSLA", name: "Tesla Inc.", sector: "Consumer Discretionary", currentPrice: 248.5, change24h: -5.3, change24hPct: -2.09, volume: 60_000_000 },
];

const priceCache = new Map<string, number>();

function initPriceCache() {
  for (const s of SYMBOLS) {
    priceCache.set(s.symbol, s.currentPrice);
  }
}
initPriceCache();

function randomNormal(mean = 0, std = 1): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + std * z;
}

export function tickPrice(symbol: string): number {
  const prev = priceCache.get(symbol) ?? 100;
  const drift = 0.00005;
  const volatility = 0.002;
  const newPrice = prev * Math.exp(drift + volatility * randomNormal());
  priceCache.set(symbol, Math.max(newPrice, 0.01));
  return newPrice;
}

export function getCurrentPrice(symbol: string): number {
  return priceCache.get(symbol) ?? 100;
}

export function getSymbols(): SymbolInfo[] {
  return SYMBOLS.map((s) => ({
    ...s,
    currentPrice: priceCache.get(s.symbol) ?? s.currentPrice,
    change24h: (priceCache.get(s.symbol) ?? s.currentPrice) - s.currentPrice + s.change24h,
    change24hPct: (((priceCache.get(s.symbol) ?? s.currentPrice) - s.currentPrice) / s.currentPrice) * 100 + s.change24hPct,
  }));
}

export function getTickers(): Ticker[] {
  return SYMBOLS.map((s) => {
    const price = priceCache.get(s.symbol) ?? s.currentPrice;
    const change = price - s.currentPrice;
    return {
      symbol: s.symbol,
      price,
      change,
      changePct: (change / s.currentPrice) * 100,
      volume: s.volume * (0.8 + Math.random() * 0.4),
      timestamp: new Date().toISOString(),
    };
  });
}

export function generateOhlcv(symbol: string, timeframe: string, limit: number): OhlcvBar[] {
  const bars: OhlcvBar[] = [];
  let price = priceCache.get(symbol) ?? 100;

  const msPerBar: Record<string, number> = {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
  };

  const ms = msPerBar[timeframe] ?? 3_600_000;
  const startTime = Date.now() - limit * ms;

  for (let i = 0; i < limit; i++) {
    const open = price;
    const change = randomNormal(0, 0.015);
    const close = open * (1 + change);
    const high = Math.max(open, close) * (1 + Math.abs(randomNormal(0, 0.005)));
    const low = Math.min(open, close) * (1 - Math.abs(randomNormal(0, 0.005)));
    const volume = 1_000_000 * (0.5 + Math.random() * 1.5);

    bars.push({
      timestamp: new Date(startTime + i * ms).toISOString(),
      open: parseFloat(open.toFixed(4)),
      high: parseFloat(high.toFixed(4)),
      low: parseFloat(low.toFixed(4)),
      close: parseFloat(close.toFixed(4)),
      volume: parseFloat(volume.toFixed(0)),
    });

    price = close;
  }

  priceCache.set(symbol, price);
  return bars;
}

export function generateHistoricalOhlcv(symbol: string, startDate: string, endDate: string): OhlcvBar[] {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const dayMs = 86_400_000;
  const numBars = Math.floor((end - start) / dayMs);

  const basePrice = priceCache.get(symbol) ?? 100;
  const bars: OhlcvBar[] = [];
  let price = basePrice * 0.7; // start lower

  for (let i = 0; i < numBars; i++) {
    const open = price;
    const change = randomNormal(0.0003, 0.018);
    const close = open * (1 + change);
    const high = Math.max(open, close) * (1 + Math.abs(randomNormal(0, 0.007)));
    const low = Math.min(open, close) * (1 - Math.abs(randomNormal(0, 0.007)));
    const volume = 5_000_000 * (0.5 + Math.random() * 1.5);

    bars.push({
      timestamp: new Date(start + i * dayMs).toISOString(),
      open: parseFloat(open.toFixed(4)),
      high: parseFloat(high.toFixed(4)),
      low: parseFloat(low.toFixed(4)),
      close: parseFloat(close.toFixed(4)),
      volume: parseFloat(volume.toFixed(0)),
    });

    price = close;
  }

  return bars;
}

logger.info("Market data engine initialized");
