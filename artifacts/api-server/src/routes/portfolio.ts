import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tradesTable,
  portfolioSnapshotsTable,
} from "@workspace/db";
import { eq, desc, and, gte } from "drizzle-orm";
import { riskEngine } from "../engine/risk";
import { getCurrentPrice } from "../engine/marketData";

const router: IRouter = Router();

router.get("/portfolio/summary", async (req, res): Promise<void> => {
  const openTrades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "open"));

  const closedTrades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"));

  const initialEquity = 100_000;
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
    totalExposure += (entryPrice * qty) / initialEquity;
  }

  const equity = initialEquity + totalPnl;
  const riskState = riskEngine.getState();

  // Calculate performance metrics from closed trades
  const wins = closedTrades.filter((t) => parseFloat((t.pnl as string) ?? "0") > 0);
  const totalWins = wins.reduce((a, t) => a + parseFloat((t.pnl as string) ?? "0"), 0);
  const losses = closedTrades.filter((t) => parseFloat((t.pnl as string) ?? "0") <= 0);
  const totalLosses = Math.abs(losses.reduce((a, t) => a + parseFloat((t.pnl as string) ?? "0"), 0));

  const winRate = closedTrades.length > 0 ? wins.length / closedTrades.length : 0;
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 1.0;

  // Rough Sharpe from snapshots
  const snapshots = await db
    .select()
    .from(portfolioSnapshotsTable)
    .orderBy(desc(portfolioSnapshotsTable.createdAt))
    .limit(30);

  const equities = snapshots.map((s) => parseFloat(s.equity as string)).reverse();
  let sharpeRatio = 1.2;
  let sortinoRatio = 1.8;

  if (equities.length > 1) {
    const returns = equities.slice(1).map((e, i) => (e - equities[i]) / equities[i]);
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(returns.reduce((a, b) => a + (b - avg) ** 2, 0) / returns.length) || 0.0001;
    sharpeRatio = (avg / std) * Math.sqrt(252 * 48);
    const downside = returns.filter((r) => r < 0);
    const downStd = downside.length > 0
      ? Math.sqrt(downside.reduce((a, b) => a + b ** 2, 0) / downside.length)
      : 0.0001;
    sortinoRatio = (avg / downStd) * Math.sqrt(252 * 48);
  }

  res.json({
    equity: parseFloat(equity.toFixed(2)),
    cash: parseFloat((equity * 0.3).toFixed(2)),
    totalPnl: parseFloat(totalPnl.toFixed(2)),
    dailyPnl: parseFloat((riskState.dailyPnl).toFixed(2)),
    dailyPnlPct: parseFloat((riskState.dailyPnl / initialEquity).toFixed(6)),
    totalPnlPct: parseFloat((totalPnl / initialEquity).toFixed(6)),
    openPositions: openTrades.length,
    winRate: parseFloat(winRate.toFixed(4)),
    profitFactor: parseFloat(profitFactor.toFixed(4)),
    sharpeRatio: parseFloat(Math.max(-5, Math.min(10, sharpeRatio)).toFixed(4)),
    sortinoRatio: parseFloat(Math.max(-5, Math.min(15, sortinoRatio)).toFixed(4)),
    maxDrawdown: parseFloat(riskState.currentDrawdown.toFixed(6)),
    currentDrawdown: parseFloat(riskState.currentDrawdown.toFixed(6)),
    totalTrades: closedTrades.length + openTrades.length,
    exposure: parseFloat(totalExposure.toFixed(6)),
    riskScore: riskState.riskScore,
  });
});

router.get("/portfolio/equity-curve", async (req, res): Promise<void> => {
  const snapshots = await db
    .select()
    .from(portfolioSnapshotsTable)
    .orderBy(portfolioSnapshotsTable.createdAt)
    .limit(200);

  const curve = snapshots.map((s) => ({
    timestamp: s.createdAt.toISOString(),
    equity: parseFloat(s.equity as string),
    benchmark: parseFloat(s.benchmark as string),
  }));

  // If no snapshots yet, generate seed data
  if (curve.length === 0) {
    const now = Date.now();
    let equity = 100_000;
    let benchmark = 100_000;
    for (let i = 30; i >= 0; i--) {
      equity *= 1 + (Math.random() - 0.46) * 0.008;
      benchmark *= 1 + (Math.random() - 0.48) * 0.006;
      curve.push({
        timestamp: new Date(now - i * 3_600_000).toISOString(),
        equity: parseFloat(equity.toFixed(2)),
        benchmark: parseFloat(benchmark.toFixed(2)),
      });
    }
  }

  res.json(curve);
});

router.get("/portfolio/drawdown", async (req, res): Promise<void> => {
  const snapshots = await db
    .select()
    .from(portfolioSnapshotsTable)
    .orderBy(portfolioSnapshotsTable.createdAt)
    .limit(200);

  const drawdowns = snapshots.map((s) => ({
    timestamp: s.createdAt.toISOString(),
    drawdown: -Math.abs(parseFloat(s.drawdown as string)),
  }));

  if (drawdowns.length === 0) {
    const now = Date.now();
    let dd = 0;
    for (let i = 30; i >= 0; i--) {
      dd = Math.max(0, dd + (Math.random() - 0.6) * 0.005);
      drawdowns.push({
        timestamp: new Date(now - i * 3_600_000).toISOString(),
        drawdown: -parseFloat(Math.min(dd, 0.15).toFixed(6)),
      });
    }
  }

  res.json(drawdowns);
});

router.get("/portfolio/positions", async (req, res): Promise<void> => {
  const openTrades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "open"));

  const positions = openTrades.map((t) => {
    const currentPrice = getCurrentPrice(t.symbol);
    const entryPrice = parseFloat(t.entryPrice as string);
    const qty = parseFloat(t.quantity as string);
    const pnl =
      t.side === "long"
        ? (currentPrice - entryPrice) * qty
        : (entryPrice - currentPrice) * qty;
    const pnlPct = pnl / (entryPrice * qty);

    return {
      id: t.id,
      symbol: t.symbol,
      side: t.side as "long" | "short",
      entryPrice,
      currentPrice,
      quantity: qty,
      pnl: parseFloat(pnl.toFixed(4)),
      pnlPct: parseFloat(pnlPct.toFixed(6)),
      strategy: t.strategy,
      openedAt: t.openedAt.toISOString(),
      stopLoss: t.stopLoss ? parseFloat(t.stopLoss as string) : null,
      takeProfit: t.takeProfit ? parseFloat(t.takeProfit as string) : null,
      mae: parseFloat((t.mae as string) ?? "0"),
      mfe: parseFloat((t.mfe as string) ?? "0"),
      exposure: (entryPrice * qty) / 100_000,
    };
  });

  res.json(positions);
});

router.get("/portfolio/allocation", async (req, res): Promise<void> => {
  const openTrades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "open"));

  const totalEquity = 100_000;
  const allocation = openTrades.map((t) => {
    const entryPrice = parseFloat(t.entryPrice as string);
    const qty = parseFloat(t.quantity as string);
    const value = entryPrice * qty;
    return {
      symbol: t.symbol,
      value: parseFloat(value.toFixed(2)),
      pct: parseFloat((value / totalEquity).toFixed(4)),
      side: t.side,
      strategy: t.strategy,
    };
  });

  res.json(allocation);
});

router.get("/portfolio/correlation", async (req, res): Promise<void> => {
  const openTrades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "open"));

  const symbols = [...new Set(openTrades.map((t) => t.symbol))];

  if (symbols.length === 0) {
    res.json({ symbols: [], matrix: [] });
    return;
  }

  // Simulated correlation matrix
  const matrix: number[][] = symbols.map((s1) =>
    symbols.map((s2) => {
      if (s1 === s2) return 1.0;
      const techSymbols = new Set(["AAPL", "MSFT", "GOOGL", "NVDA", "META"]);
      if (techSymbols.has(s1) && techSymbols.has(s2)) {
        return parseFloat((0.6 + Math.random() * 0.3).toFixed(2));
      }
      return parseFloat((Math.random() * 0.5 - 0.1).toFixed(2));
    }),
  );

  res.json({ symbols, matrix });
});

export default router;
