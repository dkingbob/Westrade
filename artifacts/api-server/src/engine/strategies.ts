import { generateOhlcv, OhlcvBar } from "./marketData";

export type StrategyType = "mean_reversion" | "momentum" | "statistical";

export interface Signal {
  symbol: string;
  side: "long" | "short";
  strength: number; // 0-1
  zScore?: number;
  reason: string;
  strategyType: StrategyType;
}

export interface StrategyParams {
  lookbackPeriod?: number;
  zScoreThreshold?: number;
  momentumPeriod?: number;
  momentumThreshold?: number;
  atrMultiplier?: number;
  rsiPeriod?: number;
  rsiOverbought?: number;
  rsiOversold?: number;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  const m = mean(values);
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function rsi(closes: number[], period: number): number {
  if (closes.length < period + 1) return 50;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i <= period; i++) {
    const diff = closes[closes.length - i] - closes[closes.length - i - 1];
    if (diff > 0) gains.push(diff);
    else losses.push(Math.abs(diff));
  }
  const avgGain = gains.length > 0 ? mean(gains) : 0;
  const avgLoss = losses.length > 0 ? mean(losses) : 0.0001;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function meanReversionSignal(symbol: string, params: StrategyParams): Signal | null {
  const lookback = params.lookbackPeriod ?? 20;
  const threshold = params.zScoreThreshold ?? 2.0;
  const bars = generateOhlcv(symbol, "1h", lookback + 5);
  const closes = bars.map((b) => b.close);
  const recentCloses = closes.slice(-lookback);
  const currentPrice = closes[closes.length - 1];

  const m = mean(recentCloses);
  const std = stdDev(recentCloses);
  if (std === 0) return null;

  const zScore = (currentPrice - m) / std;

  if (zScore < -threshold) {
    return {
      symbol,
      side: "long",
      strength: Math.min(Math.abs(zScore) / (threshold * 2), 1),
      zScore,
      reason: `Price ${zScore.toFixed(2)}σ below mean — mean reversion long`,
      strategyType: "mean_reversion",
    };
  }
  if (zScore > threshold) {
    return {
      symbol,
      side: "short",
      strength: Math.min(Math.abs(zScore) / (threshold * 2), 1),
      zScore,
      reason: `Price ${zScore.toFixed(2)}σ above mean — mean reversion short`,
      strategyType: "mean_reversion",
    };
  }
  return null;
}

export function momentumSignal(symbol: string, params: StrategyParams): Signal | null {
  const period = params.momentumPeriod ?? 20;
  const threshold = params.momentumThreshold ?? 0.03;
  const bars = generateOhlcv(symbol, "1d", period + 5);
  const closes = bars.map((b) => b.close);

  const currentPrice = closes[closes.length - 1];
  const pastPrice = closes[closes.length - 1 - period];
  const momentum = (currentPrice - pastPrice) / pastPrice;

  const rsiVal = rsi(closes, params.rsiPeriod ?? 14);

  if (momentum > threshold && rsiVal < (params.rsiOverbought ?? 70)) {
    return {
      symbol,
      side: "long",
      strength: Math.min(momentum / (threshold * 3), 1),
      reason: `${(momentum * 100).toFixed(1)}% momentum + RSI ${rsiVal.toFixed(0)} — trend continuation long`,
      strategyType: "momentum",
    };
  }
  if (momentum < -threshold && rsiVal > (params.rsiOversold ?? 30)) {
    return {
      symbol,
      side: "short",
      strength: Math.min(Math.abs(momentum) / (threshold * 3), 1),
      reason: `${(momentum * 100).toFixed(1)}% momentum + RSI ${rsiVal.toFixed(0)} — trend continuation short`,
      strategyType: "momentum",
    };
  }
  return null;
}

export function statisticalSignal(symbol: string, params: StrategyParams): Signal | null {
  const bars = generateOhlcv(symbol, "1h", 50);
  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);

  // Volume-weighted mean reversion with statistical arbitrage component
  const recentCloses = closes.slice(-30);
  const recentVolumes = volumes.slice(-30);
  const totalVolume = recentVolumes.reduce((a, b) => a + b, 0);
  const vwap = recentCloses.reduce((a, c, i) => a + c * recentVolumes[i], 0) / totalVolume;

  const currentPrice = closes[closes.length - 1];
  const deviation = (currentPrice - vwap) / vwap;

  const rsiVal = rsi(closes, 14);
  const closesStd = stdDev(recentCloses);
  const zScore = (currentPrice - mean(recentCloses)) / (closesStd || 0.0001);

  const threshold = params.zScoreThreshold ?? 1.5;

  if (deviation < -0.015 && rsiVal < 40 && zScore < -threshold) {
    return {
      symbol,
      side: "long",
      strength: Math.min(Math.abs(zScore) / (threshold * 2), 1),
      zScore,
      reason: `VWAP deviation ${(deviation * 100).toFixed(2)}% + RSI oversold ${rsiVal.toFixed(0)} — stat arb long`,
      strategyType: "statistical",
    };
  }
  if (deviation > 0.015 && rsiVal > 60 && zScore > threshold) {
    return {
      symbol,
      side: "short",
      strength: Math.min(Math.abs(zScore) / (threshold * 2), 1),
      zScore,
      reason: `VWAP deviation ${(deviation * 100).toFixed(2)}% + RSI overbought ${rsiVal.toFixed(0)} — stat arb short`,
      strategyType: "statistical",
    };
  }
  return null;
}

export function generateSignal(
  strategyType: StrategyType,
  symbol: string,
  params: StrategyParams,
): Signal | null {
  switch (strategyType) {
    case "mean_reversion":
      return meanReversionSignal(symbol, params);
    case "momentum":
      return momentumSignal(symbol, params);
    case "statistical":
      return statisticalSignal(symbol, params);
    default:
      return null;
  }
}
