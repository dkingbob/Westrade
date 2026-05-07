import { logger } from "../lib/logger";

export interface RiskConfig {
  maxDailyLossPct: number;
  maxDrawdownPct: number;
  maxExposurePct: number;
  riskPerTradePct: number;
  maxOpenPositions: number;
  correlationThreshold: number;
  slippagePct: number;
  feesPct: number;
}

export interface RiskState {
  dailyPnl: number;
  dailyLossLimit: number;
  currentDrawdown: number;
  maxDrawdownLimit: number;
  exposure: number;
  exposureCap: number;
  killSwitchActive: boolean;
  dailyLossBreached: boolean;
  drawdownBreached: boolean;
  exposureBreached: boolean;
  riskScore: number;
}

class RiskEngine {
  private config: RiskConfig = {
    maxDailyLossPct: 0.02,
    maxDrawdownPct: 0.10,
    maxExposurePct: 0.80,
    riskPerTradePct: 0.01,
    maxOpenPositions: 5,
    correlationThreshold: 0.70,
    slippagePct: 0.001,
    feesPct: 0.001,
  };

  private equity = 100_000;
  private peakEquity = 100_000;
  private dailyPnl = 0;
  private exposure = 0;
  private killSwitchActive = false;
  private openPositionCount = 0;

  updateConfig(config: Partial<RiskConfig>) {
    this.config = { ...this.config, ...config };
  }

  getConfig(): RiskConfig {
    return { ...this.config };
  }

  updateEquity(equity: number, dailyPnl: number, exposure: number) {
    this.equity = equity;
    this.dailyPnl = dailyPnl;
    this.exposure = exposure;
    if (equity > this.peakEquity) this.peakEquity = equity;
  }

  setOpenPositionCount(count: number) {
    this.openPositionCount = count;
  }

  activateKillSwitch() {
    this.killSwitchActive = true;
    logger.warn("KILL SWITCH ACTIVATED — all trading halted");
  }

  deactivateKillSwitch() {
    this.killSwitchActive = false;
    logger.info("Kill switch deactivated");
  }

  getState(): RiskState {
    const drawdown = this.peakEquity > 0
      ? (this.peakEquity - this.equity) / this.peakEquity
      : 0;

    const dailyLossLimit = this.equity * this.config.maxDailyLossPct;
    const dailyLossBreached = this.dailyPnl < -dailyLossLimit;
    const drawdownBreached = drawdown > this.config.maxDrawdownPct;
    const exposureBreached = this.exposure > this.config.maxExposurePct;

    // Auto-activate kill switch on critical breaches
    if ((dailyLossBreached || drawdownBreached) && !this.killSwitchActive) {
      this.activateKillSwitch();
    }

    // Risk score: weighted combination of limit utilization
    const dailyRisk = Math.min(Math.abs(this.dailyPnl) / dailyLossLimit, 1);
    const drawdownRisk = Math.min(drawdown / this.config.maxDrawdownPct, 1);
    const exposureRisk = Math.min(this.exposure / this.config.maxExposurePct, 1);
    const positionRisk = Math.min(this.openPositionCount / this.config.maxOpenPositions, 1);
    const riskScore = (dailyRisk * 0.35 + drawdownRisk * 0.35 + exposureRisk * 0.2 + positionRisk * 0.1);

    return {
      dailyPnl: this.dailyPnl,
      dailyLossLimit,
      currentDrawdown: drawdown,
      maxDrawdownLimit: this.config.maxDrawdownPct,
      exposure: this.exposure,
      exposureCap: this.config.maxExposurePct,
      killSwitchActive: this.killSwitchActive,
      dailyLossBreached,
      drawdownBreached,
      exposureBreached,
      riskScore: parseFloat(riskScore.toFixed(4)),
    };
  }

  canTrade(openPositions: number): { allowed: boolean; reason?: string } {
    if (this.killSwitchActive) {
      return { allowed: false, reason: "Kill switch active" };
    }
    const state = this.getState();
    if (state.dailyLossBreached) {
      return { allowed: false, reason: "Daily loss limit breached" };
    }
    if (state.drawdownBreached) {
      return { allowed: false, reason: "Max drawdown breached" };
    }
    if (state.exposureBreached) {
      return { allowed: false, reason: "Exposure cap breached" };
    }
    if (openPositions >= this.config.maxOpenPositions) {
      return { allowed: false, reason: "Max open positions reached" };
    }
    return { allowed: true };
  }

  /**
   * Position sizing: (Equity × Risk%) / Stop Loss Distance
   */
  calculatePositionSize(
    entryPrice: number,
    stopLossPrice: number,
    equity: number,
    sentimentMultiplier = 1.0,
  ): number {
    const stopDistance = Math.abs(entryPrice - stopLossPrice);
    if (stopDistance === 0) return 0;
    const riskAmount = equity * this.config.riskPerTradePct * sentimentMultiplier;
    const rawSize = riskAmount / stopDistance;
    return parseFloat(rawSize.toFixed(6));
  }

  applySlippage(price: number, side: "long" | "short"): number {
    const slipFactor = side === "long" ? 1 + this.config.slippagePct : 1 - this.config.slippagePct;
    return price * slipFactor;
  }

  calculateFees(notional: number): number {
    return notional * this.config.feesPct;
  }

  /**
   * Correlation adjustment — reduce size if portfolio is already correlated
   */
  correlationAdjustment(newSymbol: string, existingSymbols: string[]): number {
    // Simplified: assume tech stocks have 0.7 correlation, cross-sector 0.3
    const techSymbols = new Set(["AAPL", "MSFT", "GOOGL", "NVDA", "META"]);
    const newIsTech = techSymbols.has(newSymbol);
    let correlatedCount = 0;

    for (const s of existingSymbols) {
      const isCorrelated = techSymbols.has(s) && newIsTech;
      if (isCorrelated) correlatedCount++;
    }

    if (correlatedCount >= 2) return 0.5;
    if (correlatedCount >= 1) return 0.75;
    return 1.0;
  }
}

export const riskEngine = new RiskEngine();
