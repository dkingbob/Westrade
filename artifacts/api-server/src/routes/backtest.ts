import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { backtestResultsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { runBacktest } from "../engine/backtester";
import { RunBacktestBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/backtest/run", async (req, res): Promise<void> => {
  const body = RunBacktestBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { strategyType, symbol, startDate, endDate, initialCapital, parameters, walkForward, monteCarlo, monteCarloRuns } = body.data;

  const result = runBacktest({
    strategyType: strategyType as "mean_reversion" | "momentum" | "statistical",
    symbol,
    startDate,
    endDate,
    initialCapital,
    parameters: parameters ?? {},
    walkForward: walkForward ?? false,
    monteCarlo: monteCarlo ?? false,
    monteCarloRuns: monteCarloRuns ?? 100,
  });

  // Save to DB
  const [saved] = await db.insert(backtestResultsTable).values({
    strategyType,
    symbol,
    startDate,
    endDate,
    initialCapital: initialCapital.toFixed(8),
    finalCapital: result.finalCapital.toFixed(8),
    totalReturn: result.totalReturn.toFixed(8),
    sharpeRatio: result.sharpeRatio.toFixed(8),
    sortinoRatio: result.sortinoRatio.toFixed(8),
    maxDrawdown: result.maxDrawdown.toFixed(8),
    winRate: result.winRate.toFixed(6),
    profitFactor: result.profitFactor.toFixed(6),
    totalTrades: result.totalTrades,
    equityCurve: result.equityCurve as any,
    trades: result.trades as any,
    monteCarloPaths: result.monteCarloPaths as any,
    walkForwardResults: result.walkForwardResults as any,
    parameterSensitivity: result.parameterSensitivity as any,
    overfitScore: result.overfitScore?.toFixed(6) ?? null,
    parameters: (parameters ?? {}) as any,
  }).returning();

  res.json({
    id: saved.id,
    strategyType: saved.strategyType,
    symbol: saved.symbol,
    startDate: saved.startDate,
    endDate: saved.endDate,
    initialCapital: parseFloat(saved.initialCapital as string),
    finalCapital: parseFloat(saved.finalCapital as string),
    totalReturn: parseFloat(saved.totalReturn as string),
    sharpeRatio: parseFloat(saved.sharpeRatio as string),
    sortinoRatio: parseFloat(saved.sortinoRatio as string),
    maxDrawdown: parseFloat(saved.maxDrawdown as string),
    winRate: parseFloat(saved.winRate as string),
    profitFactor: parseFloat(saved.profitFactor as string),
    totalTrades: saved.totalTrades,
    equityCurve: saved.equityCurve,
    trades: saved.trades,
    monteCarloPaths: saved.monteCarloPaths,
    walkForwardResults: saved.walkForwardResults,
    parameterSensitivity: saved.parameterSensitivity,
    overfitScore: saved.overfitScore ? parseFloat(saved.overfitScore as string) : null,
    parameters: saved.parameters,
    createdAt: saved.createdAt.toISOString(),
  });
});

router.get("/backtest/results", async (req, res): Promise<void> => {
  const results = await db
    .select()
    .from(backtestResultsTable)
    .orderBy(desc(backtestResultsTable.createdAt))
    .limit(20);

  res.json(results.map((r) => ({
    id: r.id,
    strategyType: r.strategyType,
    symbol: r.symbol,
    startDate: r.startDate,
    endDate: r.endDate,
    totalReturn: parseFloat(r.totalReturn as string),
    sharpeRatio: parseFloat(r.sharpeRatio as string),
    maxDrawdown: parseFloat(r.maxDrawdown as string),
    winRate: parseFloat(r.winRate as string),
    totalTrades: r.totalTrades,
    createdAt: r.createdAt.toISOString(),
  })));
});

export default router;
