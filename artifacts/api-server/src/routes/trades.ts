import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tradesTable, portfolioSnapshotsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  GetTradeParams,
  GetTradesQueryParams,
  UpdateTradeNotesParams,
  UpdateTradeNotesBody,
  GetTradeCalendarQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/trades", async (req, res): Promise<void> => {
  const parsed = GetTradesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { limit, offset, strategy, status } = parsed.data;

  let query = db.select().from(tradesTable);
  const conditions: any[] = [];

  if (strategy) conditions.push(eq(tradesTable.strategy, strategy));
  if (status) conditions.push(eq(tradesTable.status, status));

  const trades = await db
    .select()
    .from(tradesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(tradesTable.openedAt))
    .limit(limit ?? 50)
    .offset(offset ?? 0);

  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tradesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const total = countResult[0]?.count ?? 0;

  const serialized = trades.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    side: t.side,
    status: t.status,
    strategy: t.strategy,
    orderType: t.orderType,
    entryPrice: parseFloat(t.entryPrice as string),
    exitPrice: t.exitPrice ? parseFloat(t.exitPrice as string) : null,
    quantity: parseFloat(t.quantity as string),
    pnl: t.pnl ? parseFloat(t.pnl as string) : null,
    pnlPct: t.pnlPct ? parseFloat(t.pnlPct as string) : null,
    fees: parseFloat((t.fees as string) ?? "0"),
    slippage: parseFloat((t.slippage as string) ?? "0"),
    mae: t.mae ? parseFloat(t.mae as string) : null,
    mfe: t.mfe ? parseFloat(t.mfe as string) : null,
    openedAt: t.openedAt.toISOString(),
    closedAt: t.closedAt ? t.closedAt.toISOString() : null,
    notes: t.notes,
    tags: t.tags ?? [],
    stopLoss: t.stopLoss ? parseFloat(t.stopLoss as string) : null,
    takeProfit: t.takeProfit ? parseFloat(t.takeProfit as string) : null,
    zScore: t.zScore ? parseFloat(t.zScore as string) : null,
    sentimentMultiplier: t.sentimentMultiplier ? parseFloat(t.sentimentMultiplier as string) : null,
  }));

  res.json({ trades: serialized, total });
});

router.get("/trades/calendar", async (req, res): Promise<void> => {
  const parsed = GetTradeCalendarQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const year = parsed.data.year ?? new Date().getFullYear();
  const month = parsed.data.month ?? new Date().getMonth() + 1;

  const closedTrades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"));

  // Group by date
  const dayMap: Record<string, { pnl: number; wins: number; losses: number; trades: number }> = {};

  for (const trade of closedTrades) {
    if (!trade.closedAt) continue;
    const d = trade.closedAt;
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue;

    const dateStr = d.toISOString().split("T")[0];
    const pnl = parseFloat((trade.pnl as string) ?? "0");
    if (!dayMap[dateStr]) dayMap[dateStr] = { pnl: 0, wins: 0, losses: 0, trades: 0 };
    dayMap[dateStr].pnl += pnl;
    dayMap[dateStr].trades++;
    if (pnl > 0) dayMap[dateStr].wins++;
    else dayMap[dateStr].losses++;
  }

  const calendarData = Object.entries(dayMap).map(([date, data]) => ({
    date,
    pnl: parseFloat(data.pnl.toFixed(2)),
    trades: data.trades,
    wins: data.wins,
    losses: data.losses,
    winRate: data.trades > 0 ? parseFloat((data.wins / data.trades).toFixed(4)) : 0,
  }));

  res.json(calendarData);
});

router.get("/trades/:id", async (req, res): Promise<void> => {
  const params = GetTradeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [trade] = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.id, params.data.id));

  if (!trade) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  res.json({
    id: trade.id,
    symbol: trade.symbol,
    side: trade.side,
    status: trade.status,
    strategy: trade.strategy,
    orderType: trade.orderType,
    entryPrice: parseFloat(trade.entryPrice as string),
    exitPrice: trade.exitPrice ? parseFloat(trade.exitPrice as string) : null,
    quantity: parseFloat(trade.quantity as string),
    pnl: trade.pnl ? parseFloat(trade.pnl as string) : null,
    pnlPct: trade.pnlPct ? parseFloat(trade.pnlPct as string) : null,
    fees: parseFloat((trade.fees as string) ?? "0"),
    slippage: parseFloat((trade.slippage as string) ?? "0"),
    mae: trade.mae ? parseFloat(trade.mae as string) : null,
    mfe: trade.mfe ? parseFloat(trade.mfe as string) : null,
    openedAt: trade.openedAt.toISOString(),
    closedAt: trade.closedAt ? trade.closedAt.toISOString() : null,
    notes: trade.notes,
    tags: trade.tags ?? [],
    stopLoss: trade.stopLoss ? parseFloat(trade.stopLoss as string) : null,
    takeProfit: trade.takeProfit ? parseFloat(trade.takeProfit as string) : null,
    zScore: trade.zScore ? parseFloat(trade.zScore as string) : null,
    sentimentMultiplier: trade.sentimentMultiplier ? parseFloat(trade.sentimentMultiplier as string) : null,
  });
});

router.patch("/trades/:id/notes", async (req, res): Promise<void> => {
  const params = UpdateTradeNotesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateTradeNotesBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (body.data.notes !== undefined) updateData.notes = body.data.notes;
  if (body.data.tags !== undefined) updateData.tags = body.data.tags;

  const [trade] = await db
    .update(tradesTable)
    .set(updateData)
    .where(eq(tradesTable.id, params.data.id))
    .returning();

  if (!trade) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  res.json({
    id: trade.id,
    symbol: trade.symbol,
    side: trade.side,
    status: trade.status,
    strategy: trade.strategy,
    orderType: trade.orderType,
    entryPrice: parseFloat(trade.entryPrice as string),
    exitPrice: trade.exitPrice ? parseFloat(trade.exitPrice as string) : null,
    quantity: parseFloat(trade.quantity as string),
    pnl: trade.pnl ? parseFloat(trade.pnl as string) : null,
    pnlPct: trade.pnlPct ? parseFloat(trade.pnlPct as string) : null,
    fees: parseFloat((trade.fees as string) ?? "0"),
    slippage: parseFloat((trade.slippage as string) ?? "0"),
    mae: trade.mae ? parseFloat(trade.mae as string) : null,
    mfe: trade.mfe ? parseFloat(trade.mfe as string) : null,
    openedAt: trade.openedAt.toISOString(),
    closedAt: trade.closedAt ? trade.closedAt.toISOString() : null,
    notes: trade.notes,
    tags: trade.tags ?? [],
    stopLoss: trade.stopLoss ? parseFloat(trade.stopLoss as string) : null,
    takeProfit: trade.takeProfit ? parseFloat(trade.takeProfit as string) : null,
    zScore: trade.zScore ? parseFloat(trade.zScore as string) : null,
    sentimentMultiplier: trade.sentimentMultiplier ? parseFloat(trade.sentimentMultiplier as string) : null,
  });
});

router.delete("/trades/reset", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  await db.delete(tradesTable);
  await db.delete(portfolioSnapshotsTable);
  res.json({ success: true });
});

export default router;
