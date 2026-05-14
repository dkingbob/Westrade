import { logger } from "../lib/logger";
import { riskEngine } from "./risk";
import { sentimentEngine } from "./sentiment";
import { executionEngine } from "./execution";
import { generateSignal } from "./strategies";
import { tickPrice, getCurrentPrice } from "./marketData";
import { db } from "@workspace/db";
import {
  tradesTable,
  strategiesTable,
  portfolioSnapshotsTable,
  alertsTable,
  notificationSettingsTable,
  riskSettingsTable,
  sentimentSettingsTable,
  botConfigTable,
} from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { wsServer } from "../ws/server";

class TradingEngine {
  private running = false;
  private startTime: Date | null = null;
  private tickInterval: NodeJS.Timeout | null = null;
  private snapshotInterval: NodeJS.Timeout | null = null;
  private equityRefreshInterval: NodeJS.Timeout | null = null;
  private initialEquity = 100_000;
  private mode: "live" | "paper" | "backtest" = "paper";

  async start() {
    if (this.running) return;
    this.running = true;
    this.startTime = new Date();
    logger.info("Trading engine started (paper mode)");

    // Load settings from DB
    await this.loadSettings();

    // Seed strategies if none exist
    await this.seedStrategies();

    // Tick every 2 seconds
    this.tickInterval = setInterval(() => this.tick(), 2000);

    // Snapshot every 30 seconds
    this.snapshotInterval = setInterval(() => this.takeSnapshot(), 30_000);

    // Refresh equity from bot heartbeat every 60 seconds
    this.equityRefreshInterval = setInterval(() => this.refreshEquityFromBot(), 60_000);

    // Immediately take first snapshot
    setTimeout(() => this.takeSnapshot(), 1000);
  }

  async stop() {
    if (!this.running) return;
    this.running = false;
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.snapshotInterval) clearInterval(this.snapshotInterval);
    if (this.equityRefreshInterval) clearInterval(this.equityRefreshInterval);
    this.tickInterval = null;
    this.snapshotInterval = null;
    this.equityRefreshInterval = null;
    logger.info("Trading engine stopped");
  }

  isRunning() {
    return this.running;
  }

  getStatus() {
    const uptime = this.startTime
      ? Math.floor((Date.now() - this.startTime.getTime()) / 1000)
      : 0;
    return {
      running: this.running,
      uptime,
      lastTick: this.running ? new Date().toISOString() : null,
      activeStrategies: 3,
      mode: this.mode,
    };
  }

  private async seedStrategies() {
    const existing = await db.select().from(strategiesTable).limit(1);
    if (existing.length > 0) return;
    await db.insert(strategiesTable).values([
      {
        name: "Mean Reversion",
        type: "mean_reversion",
        active: true,
        symbols: ["EURUSD", "GBPUSD", "AUDUSD"],
        parameters: { lookback: 20, zThreshold: 2.0 },
        riskPct: "0.01",
        description: "Fades price deviations using Z-score",
      },
      {
        name: "Momentum",
        type: "momentum",
        active: true,
        symbols: ["USDJPY", "USDCAD", "NZDUSD"],
        parameters: { rsiPeriod: 14 },
        riskPct: "0.012",
        description: "RSI-based trend following",
      },
      {
        name: "Statistical Arb",
        type: "statistical",
        active: true,
        symbols: ["EURJPY", "GBPJPY", "EURGBP"],
        parameters: { vwapThreshold: 0.005 },
        riskPct: "0.008",
        description: "VWAP deviation mean reversion",
      },
    ]);
    logger.info("Seeded 3 default strategies");
  }

  private async refreshEquityFromBot() {
    try {
      const [cfg] = await db.select().from(botConfigTable).limit(1);
      if (!cfg) return;
      const extra = cfg.botExtra as Record<string, unknown> | null;
      const equity = extra?.mt5Equity;
      if (typeof equity === "number" && equity > 0) {
        this.initialEquity = equity;
        logger.debug({ equity }, "Updated initialEquity from bot heartbeat");
      }
    } catch (err) {
      logger.warn({ err }, "Could not refresh equity from bot config");
    }
  }

  private async loadSettings() {
    try {
      // Load MT5 equity from last bot heartbeat
      const [cfg] = await db.select().from(botConfigTable).limit(1);
      if (cfg) {
        const extra = cfg.botExtra as Record<string, unknown> | null;
        const equity = extra?.mt5Equity;
        if (typeof equity === "number" && equity > 0) {
          this.initialEquity = equity;
          logger.info({ equity }, "Loaded initialEquity from bot config");
        }
      }

      const [riskRow] = await db.select().from(riskSettingsTable).limit(1);
      if (riskRow) {
        riskEngine.updateConfig({
          maxDailyLossPct: parseFloat(riskRow.maxDailyLossPct as string),
          maxDrawdownPct: parseFloat(riskRow.maxDrawdownPct as string),
          maxExposurePct: parseFloat(riskRow.maxExposurePct as string),
          riskPerTradePct: parseFloat(riskRow.riskPerTradePct as string),
          maxOpenPositions: riskRow.maxOpenPositions,
          correlationThreshold: parseFloat(riskRow.correlationThreshold as string),
          slippagePct: parseFloat(riskRow.slippagePct as string),
          feesPct: parseFloat(riskRow.feesPct as string),
        });
      }

      const [sentRow] = await db.select().from(sentimentSettingsTable).limit(1);
      if (sentRow) {
        sentimentEngine.updateConfig({
          mode: sentRow.mode as "clean" | "hype" | "custom",
          institutionalWeight: parseFloat(sentRow.institutionalWeight as string),
          retailWeight: parseFloat(sentRow.retailWeight as string),
          momentumWeight: parseFloat(sentRow.momentumWeight as string),
          enabled: sentRow.enabled,
          maxMultiplier: parseFloat(sentRow.maxMultiplier as string),
          minMultiplier: parseFloat(sentRow.minMultiplier as string),
        });
      }
    } catch (err) {
      logger.warn({ err }, "Could not load settings from DB");
    }
  }

  private async tick() {
    try {
      // Tick market data
      const symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "SPY", "QQQ"];
      for (const sym of symbols) tickPrice(sym);

      // Update sentiment
      sentimentEngine.tick();

      // Update open positions P&L + risk
      await this.updateOpenPositions();

      // Try to generate signals and enter trades
      await this.processSignals();

      // Update risk engine
      await this.updateRiskState();

      // Broadcast WebSocket update
      const riskState = riskEngine.getState();
      const sentiment = sentimentEngine.getState();
      wsServer.broadcast("tick", {
        timestamp: new Date().toISOString(),
        riskState,
        sentiment,
        tickers: symbols.map((s) => ({
          symbol: s,
          price: getCurrentPrice(s),
        })),
      });
    } catch (err) {
      logger.error({ err }, "Engine tick error");
    }
  }

  private async updateOpenPositions() {
    const openTrades = await db
      .select()
      .from(tradesTable)
      .where(eq(tradesTable.status, "open"));

    let totalPnl = 0;
    let totalExposure = 0;
    const equity = this.initialEquity;

    for (const trade of openTrades) {
      const currentPrice = getCurrentPrice(trade.symbol);
      const entryPrice = parseFloat(trade.entryPrice as string);
      const qty = parseFloat(trade.quantity as string);
      const pnl =
        trade.side === "long"
          ? (currentPrice - entryPrice) * qty
          : (entryPrice - currentPrice) * qty;
      const pnlPct = pnl / (entryPrice * qty);
      totalPnl += pnl;
      totalExposure += (entryPrice * qty) / equity;

      // Update MAE/MFE
      const currentMae = parseFloat((trade.mae as string) ?? "0");
      const currentMfe = parseFloat((trade.mfe as string) ?? "0");
      const newMae = Math.min(currentMae, pnl);
      const newMfe = Math.max(currentMfe, pnl);

      await db
        .update(tradesTable)
        .set({
          pnl: pnl.toFixed(8),
          pnlPct: pnlPct.toFixed(8),
          mae: newMae.toFixed(8),
          mfe: newMfe.toFixed(8),
        })
        .where(eq(tradesTable.id, trade.id));
    }

    riskEngine.setOpenPositionCount(openTrades.length);
    riskEngine.updateEquity(equity + totalPnl, totalPnl, totalExposure);

    // Broadcast positions update
    wsServer.broadcast("positions", { positions: openTrades, totalPnl });
  }

  private async processSignals() {
    const strategies = await db
      .select()
      .from(strategiesTable)
      .where(eq(strategiesTable.active, true));

    for (const strategy of strategies) {
      const symbols = strategy.symbols as string[];
      const params = strategy.parameters as Record<string, number>;

      for (const symbol of symbols) {
        // Check risk before trading
        const openTrades = await db
          .select()
          .from(tradesTable)
          .where(eq(tradesTable.status, "open"));

        const check = riskEngine.canTrade(openTrades.length);
        if (!check.allowed) continue;

        // Already have position in this symbol?
        const existing = openTrades.find((t) => t.symbol === symbol);
        if (existing) continue;

        const signal = generateSignal(
          strategy.type as "mean_reversion" | "momentum" | "statistical",
          symbol,
          params,
        );

        if (!signal || signal.strength < 0.3) continue;

        // Get sentiment multiplier
        const sentMultiplier = sentimentEngine.getPositionMultiplier();

        // Calculate position size
        const currentPrice = getCurrentPrice(symbol);
        const stopDist = currentPrice * 0.02;
        const stopLoss =
          signal.side === "long" ? currentPrice - stopDist : currentPrice + stopDist;
        const takeProfit =
          signal.side === "long" ? currentPrice + stopDist * 2 : currentPrice - stopDist * 2;

        const correlationAdj = riskEngine.correlationAdjustment(
          symbol,
          openTrades.map((t) => t.symbol),
        );

        const qty = riskEngine.calculatePositionSize(
          currentPrice,
          stopLoss,
          this.initialEquity,
          sentMultiplier * correlationAdj,
        );

        if (qty <= 0) continue;

        // Execute order
        const result = await executionEngine.submitMarketOrder(
          symbol,
          signal.side,
          qty,
          strategy.name,
        );

        if (!result.success || !result.fillPrice) continue;

        const fees = result.fees ?? 0;
        const slippage = result.slippage ?? 0;

        // Save trade to DB
        const [newTrade] = await db
          .insert(tradesTable)
          .values({
            symbol,
            side: signal.side,
            status: "open",
            strategy: strategy.name,
            orderType: "market",
            entryPrice: result.fillPrice.toFixed(8),
            quantity: qty.toFixed(8),
            fees: fees.toFixed(8),
            slippage: slippage.toFixed(8),
            mae: "0",
            mfe: "0",
            stopLoss: stopLoss.toFixed(8),
            takeProfit: takeProfit.toFixed(8),
            tags: [strategy.type],
            zScore: signal.zScore?.toFixed(6) ?? null,
            sentimentMultiplier: sentMultiplier.toFixed(6),
          })
          .returning();

        logger.info({ trade: newTrade.id, symbol, side: signal.side }, "New trade opened");

        // Broadcast new trade
        wsServer.broadcast("trade_opened", { trade: newTrade });

        // Check notifications
        await this.checkAlerts();
      }
    }
  }

  private async updateRiskState() {
    const state = riskEngine.getState();
    if (state.killSwitchActive) {
      // Close all open positions
      const openTrades = await db
        .select()
        .from(tradesTable)
        .where(eq(tradesTable.status, "open"));

      for (const trade of openTrades) {
        const currentPrice = getCurrentPrice(trade.symbol);
        const entryPrice = parseFloat(trade.entryPrice as string);
        const qty = parseFloat(trade.quantity as string);
        const pnl =
          trade.side === "long"
            ? (currentPrice - entryPrice) * qty
            : (entryPrice - currentPrice) * qty;

        await db
          .update(tradesTable)
          .set({
            status: "closed",
            exitPrice: currentPrice.toFixed(8),
            pnl: pnl.toFixed(8),
            pnlPct: (pnl / (entryPrice * qty)).toFixed(8),
            closedAt: new Date(),
          })
          .where(eq(tradesTable.id, trade.id));
      }
    }
  }

  private async takeSnapshot() {
    try {
      const openTrades = await db
        .select()
        .from(tradesTable)
        .where(eq(tradesTable.status, "open"));

      let totalPnl = 0;
      let totalExposure = 0;

      for (const trade of openTrades) {
        const currentPrice = getCurrentPrice(trade.symbol);
        const entryPrice = parseFloat(trade.entryPrice as string);
        const qty = parseFloat(trade.quantity as string);
        const pnl =
          trade.side === "long"
            ? (currentPrice - entryPrice) * qty
            : (entryPrice - currentPrice) * qty;
        totalPnl += pnl;
        totalExposure += (entryPrice * qty) / this.initialEquity;
      }

      const equity = this.initialEquity + totalPnl;
      const riskState = riskEngine.getState();

      await db.insert(portfolioSnapshotsTable).values({
        equity: equity.toFixed(8),
        cash: (this.initialEquity * 0.3).toFixed(8),
        totalPnl: totalPnl.toFixed(8),
        dailyPnl: (totalPnl * 0.3).toFixed(8),
        openPositions: openTrades.length,
        drawdown: riskState.currentDrawdown.toFixed(8),
        exposure: totalExposure.toFixed(8),
        benchmark: equity.toFixed(8),
      });

      // Broadcast equity update
      wsServer.broadcast("equity_update", { equity, totalPnl, openPositions: openTrades.length });
    } catch (err) {
      logger.warn({ err }, "Snapshot failed");
    }
  }

  private async checkAlerts() {
    try {
      const [notifSettings] = await db
        .select()
        .from(notificationSettingsTable)
        .limit(1);

      if (!notifSettings?.dashboardEnabled) return;

      const riskState = riskEngine.getState();
      const profitThreshold = parseFloat(notifSettings.profitThresholdPct as string);
      const lossThreshold = parseFloat(notifSettings.lossThresholdPct as string);
      const drawdownWarning = parseFloat(notifSettings.drawdownWarningPct as string);

      if (riskState.dailyPnl > this.initialEquity * profitThreshold) {
        await db.insert(alertsTable).values({
          type: "profit_threshold",
          message: `Daily profit target reached: ${(riskState.dailyPnl).toFixed(2)}`,
          severity: "info",
          acknowledged: false,
        });
      }

      if (riskState.dailyLossBreached) {
        await db.insert(alertsTable).values({
          type: "loss_threshold",
          message: `Daily loss limit breached: ${riskState.dailyPnl.toFixed(2)}`,
          severity: "critical",
          acknowledged: false,
        });
        wsServer.broadcast("alert", { type: "loss_threshold", severity: "critical" });
      }

      if (riskState.currentDrawdown >= drawdownWarning && !riskState.drawdownBreached) {
        await db.insert(alertsTable).values({
          type: "drawdown_warning",
          message: `Drawdown warning: ${(riskState.currentDrawdown * 100).toFixed(2)}%`,
          severity: "warning",
          acknowledged: false,
        });
      }
    } catch (err) {
      logger.warn({ err }, "Alert check failed");
    }
  }

  async emergencyKillSwitch(): Promise<{ closedPositions: number }> {
    riskEngine.activateKillSwitch();
    await this.updateRiskState();

    const openTrades = await db
      .select()
      .from(tradesTable)
      .where(eq(tradesTable.status, "open"));

    for (const trade of openTrades) {
      const currentPrice = getCurrentPrice(trade.symbol);
      const entryPrice = parseFloat(trade.entryPrice as string);
      const qty = parseFloat(trade.quantity as string);
      const pnl =
        trade.side === "long"
          ? (currentPrice - entryPrice) * qty
          : (entryPrice - currentPrice) * qty;

      await db
        .update(tradesTable)
        .set({
          status: "closed",
          exitPrice: currentPrice.toFixed(8),
          pnl: pnl.toFixed(8),
          pnlPct: (pnl / (entryPrice * qty)).toFixed(8),
          closedAt: new Date(),
        })
        .where(eq(tradesTable.id, trade.id));
    }

    await db.insert(alertsTable).values({
      type: "kill_switch",
      message: `Emergency kill switch activated. ${openTrades.length} positions closed.`,
      severity: "critical",
      acknowledged: false,
    });

    wsServer.broadcast("kill_switch", { closedPositions: openTrades.length });

    return { closedPositions: openTrades.length };
  }
}

export const tradingEngine = new TradingEngine();
