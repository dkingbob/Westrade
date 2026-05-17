import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tradesTable, analyticsReportsTable, portfolioSnapshotsTable } from "@workspace/db";
import { eq, desc, and, gte } from "drizzle-orm";
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

// ── Brain Gym server-side analytics ──────────────────────────────────────────

const CORRELATED_GROUPS = [
  { name: "USD_strength", pairs: ["EURUSD","GBPUSD","AUDUSD","NZDUSD","USDCAD","USDCHF","USDJPY"] },
  { name: "JPY_crosses",  pairs: ["USDJPY","EURJPY","GBPJPY","AUDJPY","CADJPY","NZDJPY"] },
  { name: "GBP_crosses",  pairs: ["GBPUSD","GBPJPY","GBPCHF","GBPAUD","GBPCAD","GBPNZD"] },
  { name: "commodity_fx", pairs: ["AUDUSD","NZDUSD","USDCAD","XAUUSD","XAGUSD"] },
];
const MIN_TRADES = 15;

function sfloat(v: unknown): number {
  const n = parseFloat(String(v ?? 0));
  return isNaN(n) ? 0 : n;
}
function mean(arr: number[]) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function pctile(arr: number[], p: number) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx), hi = Math.min(lo + 1, s.length - 1);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}
function indStats(vals: number[]) {
  if (!vals.length) return { n: 0, mean: 0, std: 0, p25: 0, p50: 0, p75: 0 };
  const m = mean(vals);
  const std = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
  return { n: vals.length, mean: +m.toFixed(3), std: +std.toFixed(3), p25: +pctile(vals,25).toFixed(3), p50: +pctile(vals,50).toFixed(3), p75: +pctile(vals,75).toFixed(3) };
}
function detectSession(hour: number) {
  if (hour >= 13 && hour < 17) return "ny_london_overlap";
  if (hour >= 7 && hour < 13) return "london";
  if (hour >= 13 && hour < 22) return "ny";
  return "asian";
}

type TradeRow = typeof tradesTable.$inferSelect;

function indicatorDistributions(trades: TradeRow[]) {
  const rsi: number[] = [], adx: number[] = [], bbPct: number[] = [], macd: number[] = [], atr: number[] = [];
  for (const t of trades) {
    const ind = (t.entryIndicators ?? {}) as Record<string, unknown>;
    if (!Object.keys(ind).length) continue;
    const r = sfloat(ind.rsi_14); if (r > 0) rsi.push(r);
    const a = sfloat(ind.adx); if (a > 0) adx.push(a);
    const b = sfloat(ind.bb_position_pct); if (b > 0) bbPct.push(b);
    const m = sfloat(ind.macd_hist); macd.push(m);
    const at = sfloat(ind.atr); if (at > 0) atr.push(at);
  }
  return { rsi: indStats(rsi), adx: indStats(adx), bb_pct: indStats(bbPct), macd_hist: indStats(macd), atr: indStats(atr) };
}

function sessionMatrix(trades: TradeRow[]) {
  const map: Record<string, { session: string; strategy: string; wins: number; losses: number; pnl: number; trades: number }> = {};
  for (const t of trades) {
    const session = t.session ?? detectSession(t.openedAt.getUTCHours());
    const strategy = t.strategy ?? "unknown";
    const key = `${session}:${strategy}`;
    if (!map[key]) map[key] = { session, strategy, wins: 0, losses: 0, pnl: 0, trades: 0 };
    const pnl = sfloat(t.pnl);
    map[key].trades++;
    map[key].pnl = +(map[key].pnl + pnl).toFixed(4);
    if (pnl > 0) map[key].wins++; else map[key].losses++;
  }
  return Object.values(map).map(c => ({
    ...c,
    win_rate: c.trades > 0 ? +(c.wins / c.trades).toFixed(3) : 0,
    avg_pnl: c.trades > 0 ? +(c.pnl / c.trades).toFixed(4) : 0,
  })).sort((a, b) => b.pnl - a.pnl);
}

function maeMfeAnalysis(wins: TradeRow[], losses: TradeRow[]) {
  const winMaes = wins.map(t => sfloat(t.mae)).filter(v => v > 0);
  const lossMfes = losses.map(t => sfloat(t.mfe)).filter(v => v > 0);
  const wStats = winMaes.length ? { n: winMaes.length, mean: +mean(winMaes).toFixed(4), p50_median: +pctile(winMaes,50).toFixed(4), p90: +pctile(winMaes,90).toFixed(4) } : { n: 0 };
  const lStats = lossMfes.length ? { n: lossMfes.length, mean: +mean(lossMfes).toFixed(4), p50_median: +pctile(lossMfes,50).toFixed(4), p75: +pctile(lossMfes,75).toFixed(4) } : { n: 0 };
  return {
    winner_mae: wStats,
    loser_mfe: lStats,
    sl_recommendation: winMaes.length ? `SL should be at least ${pctile(winMaes,90).toFixed(4)} from entry (p90 MAE of winning trades)` : null,
    tp_recommendation: lossMfes.length ? `Consider tightening TP — 75% of losing trades reached within ${pctile(lossMfes,75).toFixed(4)} of entry before reversing` : null,
    note: "MAE/MFE approximated from H1 OHLC bars — sub-hour precision not available",
  };
}

function correlationClusters(losses: TradeRow[]) {
  const clusters: unknown[] = [];
  for (const group of CORRELATED_GROUPS) {
    const groupLosses = losses.filter(t => group.pairs.includes(t.symbol));
    if (groupLosses.length < 2) continue;
    const buckets: Record<string, TradeRow[]> = {};
    for (const t of groupLosses) {
      const h = t.openedAt.getUTCHours();
      const bucket = `${t.openedAt.toISOString().slice(0,10)}-${String(Math.floor(h/4)*4).padStart(2,"0")}`;
      (buckets[bucket] ??= []).push(t);
    }
    for (const [window, bt] of Object.entries(buckets)) {
      if (bt.length < 2) continue;
      const totalLoss = bt.reduce((s, t) => s + sfloat(t.pnl), 0);
      clusters.push({ group: group.name, window, simultaneous_losses: bt.length, pairs: bt.map(t => t.symbol), total_pnl: +totalLoss.toFixed(2), risk: bt.length >= 3 ? "HIGH" : "MEDIUM" });
    }
  }
  return (clusters as Array<{total_pnl: number}>).sort((a, b) => a.total_pnl - b.total_pnl);
}

function deriveBlacklist(wins: TradeRow[], losses: TradeRow[], sessionData: ReturnType<typeof sessionMatrix>) {
  const n = wins.length + losses.length;
  if (n < MIN_TRADES) return [`Insufficient data (${n} trades) — need ${MIN_TRADES} minimum for statistical rules`];
  const rules: string[] = [];

  const tpHighAdxW = wins.filter(t => t.strategy === "trend_pullback" && sfloat((t.entryIndicators as Record<string,unknown>)?.adx) > 50);
  const tpHighAdxL = losses.filter(t => t.strategy === "trend_pullback" && sfloat((t.entryIndicators as Record<string,unknown>)?.adx) > 50);
  if (tpHighAdxW.length + tpHighAdxL.length >= 5) {
    const wr = tpHighAdxW.length / (tpHighAdxW.length + tpHighAdxL.length);
    if (wr < 0.40) rules.push(`Block trend_pullback when ADX > 50 (win rate: ${(wr*100).toFixed(0)}% from ${tpHighAdxW.length+tpHighAdxL.length} trades)`);
  }

  for (const cell of sessionData) {
    if (cell.strategy === "bb_reversion" && cell.trades >= 5 && cell.win_rate < 0.35)
      rules.push(`Block bb_reversion during ${cell.session} session (win rate: ${(cell.win_rate*100).toFixed(0)}%, ${cell.trades} trades, avg PnL: $${cell.avg_pnl.toFixed(2)})`);
  }

  const pairStats: Record<string, {wins: number; losses: number}> = {};
  for (const t of [...wins, ...losses]) {
    pairStats[t.symbol] ??= { wins: 0, losses: 0 };
    if (sfloat(t.pnl) > 0) pairStats[t.symbol].wins++; else pairStats[t.symbol].losses++;
  }
  for (const [sym, s] of Object.entries(pairStats)) {
    const total = s.wins + s.losses;
    if (total >= 4 && s.wins / total < 0.30)
      rules.push(`Consider disabling ${sym} (win rate: ${(s.wins/total*100).toFixed(0)}% over ${total} trades)`);
  }
  return rules.length ? rules : ["No blacklist conditions detected — strategy is performing within norms"];
}

function deriveThresholds(wins: TradeRow[]) {
  if (wins.length < MIN_TRADES) return [`Insufficient winning trades (${wins.length}) for threshold analysis`];
  const thresholds: string[] = [];

  const tpLongWins = wins.filter(t => t.strategy === "trend_pullback" && t.side === "long");
  if (tpLongWins.length >= 5) {
    const rsiVals = tpLongWins.map(t => sfloat((t.entryIndicators as Record<string,unknown>)?.rsi_14)).filter(v => v > 0);
    if (rsiVals.length) thresholds.push(`trend_pullback LONG: winning RSI sweet spot ${pctile(rsiVals,25).toFixed(1)}–${pctile(rsiVals,75).toFixed(1)} (p25–p75 of ${rsiVals.length} winning entries)`);
  }

  const xauWins = wins.filter(t => t.symbol === "XAUUSD");
  if (xauWins.length >= 3) {
    const atrVals = xauWins.map(t => sfloat((t.entryIndicators as Record<string,unknown>)?.atr)).filter(v => v > 0);
    if (atrVals.length) thresholds.push(`XAUUSD: optimal ATR range ${pctile(atrVals,25).toFixed(2)}–${pctile(atrVals,75).toFixed(2)} (p25–p75 of ${atrVals.length} winning trades)`);
  }

  const pf: Record<string, {wins: number; totalWin: number}> = {};
  for (const t of wins) { pf[t.symbol] ??= { wins: 0, totalWin: 0 }; pf[t.symbol].wins++; pf[t.symbol].totalWin += sfloat(t.pnl); }
  const topPf = Object.entries(pf).filter(([,d]) => d.wins >= 3).sort((a,b) => b[1].totalWin - a[1].totalWin).slice(0,3);
  for (const [sym, d] of topPf) thresholds.push(`Priority pair: ${sym} — $${d.totalWin.toFixed(2)} total profit from winning trades`);

  return thresholds.length ? thresholds : ["No high-confidence thresholds yet — more trades needed"];
}

async function runBrainGym(lookback: string) {
  const cutoffs: Record<string, number> = { "30d": 30, "7d": 7, "1d": 1 };
  const days = cutoffs[lookback];
  const cutoff = days ? new Date(Date.now() - days * 86_400_000) : null;

  const trades = await db.select().from(tradesTable).where(
    cutoff
      ? and(eq(tradesTable.status, "closed"), gte(tradesTable.openedAt, cutoff))
      : eq(tradesTable.status, "closed")
  );

  const wins = trades.filter(t => sfloat(t.pnl) > 0);
  const losses = trades.filter(t => sfloat(t.pnl) <= 0);
  const n = trades.length;

  const winPnls = wins.map(t => sfloat(t.pnl));
  const lossPnls = losses.map(t => Math.abs(sfloat(t.pnl)));
  const totalPnl = winPnls.reduce((a, b) => a + b, 0) - lossPnls.reduce((a, b) => a + b, 0);
  const totalWins = winPnls.reduce((a, b) => a + b, 0);
  const totalLosses = lossPnls.reduce((a, b) => a + b, 0);
  const avgWin = mean(winPnls);
  const avgLoss = mean(lossPnls);
  const profitFactor = totalLosses > 0 ? +(totalWins / totalLosses).toFixed(3) : "∞";

  const sessionData = sessionMatrix(trades);

  return {
    generated_at: new Date().toISOString(),
    lookback,
    total_trades: n,
    sufficient_data: n >= MIN_TRADES,
    summary: {
      wins: wins.length,
      losses: losses.length,
      win_rate: n > 0 ? +(wins.length / n).toFixed(3) : 0,
      total_pnl: +totalPnl.toFixed(2),
      avg_win: +avgWin.toFixed(2),
      avg_loss: +avgLoss.toFixed(2),
      profit_factor: profitFactor,
      expectancy: n > 0 ? +((wins.length/n * avgWin) - (losses.length/n * avgLoss)).toFixed(2) : 0,
    },
    channel_a_post_mortem: {
      description: "Indicator distributions at entry for losing trades",
      loss_indicator_distributions: indicatorDistributions(losses),
      correlation_clusters: correlationClusters(losses),
    },
    channel_b_alpha: {
      description: "Indicator distributions at entry for winning trades",
      win_indicator_distributions: indicatorDistributions(wins),
    },
    session_matrix: sessionData,
    mae_mfe_analysis: maeMfeAnalysis(wins, losses),
    blacklisted_conditions: deriveBlacklist(wins, losses, sessionData),
    high_confidence_thresholds: deriveThresholds(wins),
  };
}

// ── Brain Gym endpoints ───────────────────────────────────────────────────────

router.post("/analytics/brain-gym/run", async (req, res): Promise<void> => {
  const lookback = String(req.body?.lookback ?? req.query.lookback ?? "7d");
  const report = await runBrainGym(lookback);
  const [saved] = await db.insert(analyticsReportsTable).values({
    lookback,
    report,
    tradeCount: String(report.total_trades),
  }).returning();
  res.status(201).json(saved);
});

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

router.get("/analytics/brain-gym/progress", async (req, res): Promise<void> => {
  const lookback = String(req.query.lookback ?? "7d");
  const cutoffs: Record<string, number> = { "30d": 30, "7d": 7, "1d": 1 };
  const days = cutoffs[lookback];
  const cutoff = days ? new Date(Date.now() - days * 86_400_000) : null;

  const trades = await db.select({
    id: tradesTable.id,
    analyzedAt: tradesTable.analyzedAt,
  }).from(tradesTable).where(
    cutoff
      ? and(eq(tradesTable.status, "closed"), gte(tradesTable.openedAt, cutoff))
      : eq(tradesTable.status, "closed")
  );

  const total = trades.length;
  const analyzed = trades.filter(t => t.analyzedAt !== null).length;
  const pct = total > 0 ? Math.round((analyzed / total) * 100) : 0;
  res.json({ total, analyzed, pct, lookback });
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

// In-memory store for the latest market briefing (no DB needed — refreshes each session)
let latestMarketBriefing: {
  briefing: string;
  equity: number;
  symbols: string[];
  generatedAt: string;
} | null = null;

router.post("/analytics/market-briefing", async (req, res): Promise<void> => {
  const { briefing, equity, symbols } = req.body ?? {};
  if (!briefing) {
    res.status(400).json({ error: "briefing required" });
    return;
  }
  latestMarketBriefing = {
    briefing: String(briefing),
    equity: parseFloat(equity ?? 0),
    symbols: symbols ?? [],
    generatedAt: new Date().toISOString(),
  };
  res.json({ ok: true });
});

router.get("/analytics/market-briefing", async (req, res): Promise<void> => {
  if (!latestMarketBriefing) {
    res.status(404).json({ error: "No briefing yet — start the bot to generate one" });
    return;
  }
  res.json(latestMarketBriefing);
});

router.get("/analytics/session-equity", async (req, res): Promise<void> => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const snapshots = await db
    .select({ createdAt: portfolioSnapshotsTable.createdAt, equity: portfolioSnapshotsTable.equity })
    .from(portfolioSnapshotsTable)
    .where(gte(portfolioSnapshotsTable.createdAt, since))
    .orderBy(portfolioSnapshotsTable.createdAt);
  res.json(snapshots.map((s) => ({
    t: s.createdAt.toISOString(),
    equity: parseFloat(s.equity as string),
  })));
});

export default router;
