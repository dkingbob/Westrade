import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tradesTable, analyticsReportsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { GetTimeBreakdownQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

function calcSharpe(returns: number[]): number {
  if (returns.length < 2) return 0;
  const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
  const std = Math.sqrt(returns.reduce((a, b) => a + (b - avg) ** 2, 0) / returns.length);
  if (std === 0) return 0;
  return parseFloat(((avg / std) * Math.sqrt(252)).toFixed(4));
}

function calcSortino(returns: number[]): number {
  if (returns.length < 2) return 0;
  const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
  const downside = returns.filter((r) => r < 0);
  if (downside.length === 0) return 3.0;
  const downStd = Math.sqrt(downside.reduce((a, b) => a + b ** 2, 0) / downside.length);
  if (downStd === 0) return 3.0;
  return parseFloat(((avg / downStd) * Math.sqrt(252)).toFixed(4));
}

router.get("/analytics/performance", async (req, res): Promise<void> => {
  const trades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"))
    .orderBy(tradesTable.closedAt);

  if (trades.length === 0) {
    res.json({
      sharpeRatio: 0, sortinoRatio: 0, calmarRatio: 0, winRate: 0,
      profitFactor: 0, avgWin: 0, avgLoss: 0, avgRR: 0,
      maxConsecWins: 0, maxConsecLosses: 0, expectancy: 0,
      totalReturn: 0, annualizedReturn: 0, volatility: 0,
      maxDrawdown: 0, recoveryFactor: 0, totalTrades: 0, avgTradeDuration: 0,
    });
    return;
  }

  const pnls = trades.map((t) => parseFloat((t.pnl as string) ?? "0"));
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p <= 0);
  const winRate = pnls.length > 0 ? wins.length / pnls.length : 0;
  const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0;
  const totalWins = wins.reduce((a, b) => a + b, 0);
  const totalLosses = Math.abs(losses.reduce((a, b) => a + b, 0));
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 1;
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;
  const avgRR = avgLoss > 0 ? avgWin / avgLoss : avgWin;

  // Consecutive wins/losses
  let maxConsecWins = 0, maxConsecLosses = 0;
  let curWins = 0, curLosses = 0;
  for (const p of pnls) {
    if (p > 0) { curWins++; curLosses = 0; maxConsecWins = Math.max(maxConsecWins, curWins); }
    else { curLosses++; curWins = 0; maxConsecLosses = Math.max(maxConsecLosses, curLosses); }
  }

  // Returns for Sharpe
  const initialEquity = 100_000;
  let runningEquity = initialEquity;
  const returns: number[] = [];
  for (const p of pnls) {
    const ret = p / runningEquity;
    returns.push(ret);
    runningEquity += p;
  }

  const totalReturn = (runningEquity - initialEquity) / initialEquity;
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const volatility = Math.sqrt(returns.reduce((a, b) => a + (b - avgReturn) ** 2, 0) / returns.length) * Math.sqrt(252);

  // Max drawdown from equity curve
  let peak = initialEquity;
  let maxDD = 0;
  let cur = initialEquity;
  for (const p of pnls) {
    cur += p;
    if (cur > peak) peak = cur;
    const dd = (peak - cur) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  // Average trade duration in hours
  const durations: number[] = [];
  for (const t of trades) {
    if (t.closedAt) {
      const dur = (t.closedAt.getTime() - t.openedAt.getTime()) / 3_600_000;
      durations.push(dur);
    }
  }
  const avgTradeDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  const calmarRatio = maxDD > 0 ? totalReturn / maxDD : 0;
  const recoveryFactor = maxDD > 0 ? totalReturn / maxDD : 1;
  const annualizedReturn = totalReturn; // simplification

  res.json({
    sharpeRatio: calcSharpe(returns),
    sortinoRatio: calcSortino(returns),
    calmarRatio: parseFloat(calmarRatio.toFixed(4)),
    winRate: parseFloat(winRate.toFixed(4)),
    profitFactor: parseFloat(profitFactor.toFixed(4)),
    avgWin: parseFloat(avgWin.toFixed(4)),
    avgLoss: parseFloat(avgLoss.toFixed(4)),
    avgRR: parseFloat(avgRR.toFixed(4)),
    maxConsecWins,
    maxConsecLosses,
    expectancy: parseFloat(expectancy.toFixed(4)),
    totalReturn: parseFloat(totalReturn.toFixed(6)),
    annualizedReturn: parseFloat(annualizedReturn.toFixed(6)),
    volatility: parseFloat(volatility.toFixed(6)),
    maxDrawdown: parseFloat(maxDD.toFixed(6)),
    recoveryFactor: parseFloat(recoveryFactor.toFixed(4)),
    totalTrades: trades.length,
    avgTradeDuration: parseFloat(avgTradeDuration.toFixed(2)),
  });
});

router.get("/analytics/time-breakdown", async (req, res): Promise<void> => {
  const parsed = GetTimeBreakdownQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const period = parsed.data.period ?? "monthly";
  const trades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"))
    .orderBy(tradesTable.closedAt);

  const groupMap: Record<string, { pnl: number; trades: number; wins: number }> = {};

  for (const trade of trades) {
    if (!trade.closedAt) continue;
    const d = trade.closedAt;
    let key: string;
    if (period === "daily") key = d.toISOString().split("T")[0];
    else if (period === "weekly") {
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      key = weekStart.toISOString().split("T")[0];
    } else if (period === "monthly") {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    } else {
      key = String(d.getFullYear());
    }

    const pnl = parseFloat((trade.pnl as string) ?? "0");
    if (!groupMap[key]) groupMap[key] = { pnl: 0, trades: 0, wins: 0 };
    groupMap[key].pnl += pnl;
    groupMap[key].trades++;
    if (pnl > 0) groupMap[key].wins++;
  }

  const result = Object.entries(groupMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, data]) => ({
      period,
      pnl: parseFloat(data.pnl.toFixed(2)),
      pnlPct: parseFloat((data.pnl / 100_000).toFixed(6)),
      trades: data.trades,
      winRate: data.trades > 0 ? parseFloat((data.wins / data.trades).toFixed(4)) : 0,
    }));

  res.json(result);
});

router.get("/analytics/strategy-breakdown", async (req, res): Promise<void> => {
  const trades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"));

  const stratMap: Record<string, { pnl: number; trades: number; wins: number; returns: number[] }> = {};

  for (const trade of trades) {
    const strat = trade.strategy;
    const pnl = parseFloat((trade.pnl as string) ?? "0");
    const entryNotional = parseFloat(trade.entryPrice as string) * parseFloat(trade.quantity as string);
    const ret = entryNotional > 0 ? pnl / entryNotional : 0;

    if (!stratMap[strat]) stratMap[strat] = { pnl: 0, trades: 0, wins: 0, returns: [] };
    stratMap[strat].pnl += pnl;
    stratMap[strat].trades++;
    if (pnl > 0) stratMap[strat].wins++;
    stratMap[strat].returns.push(ret);
  }

  const result = Object.entries(stratMap).map(([strategy, data]) => {
    const wins = data.pnl > 0 ? data.wins : 0;
    const losses = data.trades - data.wins;
    const totalWins = data.returns.filter((r) => r > 0).reduce((a, b) => a + b, 0) * 100_000;
    const totalLosses = Math.abs(data.returns.filter((r) => r <= 0).reduce((a, b) => a + b, 0) * 100_000);
    const pf = totalLosses > 0 ? totalWins / totalLosses : 1;
    const avgPnl = data.trades > 0 ? data.pnl / data.trades : 0;
    const sharpe = calcSharpe(data.returns);
    return {
      strategy,
      totalTrades: data.trades,
      winRate: data.trades > 0 ? parseFloat((data.wins / data.trades).toFixed(4)) : 0,
      pnl: parseFloat(data.pnl.toFixed(4)),
      profitFactor: parseFloat(pf.toFixed(4)),
      avgPnl: parseFloat(avgPnl.toFixed(4)),
      sharpe,
    };
  });

  res.json(result);
});

// ── Brain Gym endpoints ───────────────────────────────────────────────────────

router.post("/analytics/brain-gym/report", async (req, res): Promise<void> => {
  const { lookback, report, tradeCount } = req.body ?? {};
  if (!lookback || !report) {
    res.status(400).json({ error: "lookback and report are required" });
    return;
  }
  const [saved] = await db.insert(analyticsReportsTable).values({
    lookback: String(lookback),
    report,
    tradeCount: String(tradeCount ?? "0"),
  }).returning();
  res.status(201).json(saved);
});

router.get("/analytics/brain-gym/reports", async (req, res): Promise<void> => {
  const reports = await db
    .select()
    .from(analyticsReportsTable)
    .orderBy(desc(analyticsReportsTable.createdAt))
    .limit(20);
  res.json(reports);
});

router.get("/analytics/brain-gym/latest", async (req, res): Promise<void> => {
  const [latest] = await db
    .select()
    .from(analyticsReportsTable)
    .orderBy(desc(analyticsReportsTable.createdAt))
    .limit(1);
  if (!latest) {
    res.status(404).json({ error: "No reports yet" });
    return;
  }
  res.json(latest);
});

export default router;
