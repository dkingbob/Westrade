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

router.patch("/trades/:id/deep-analysis", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }
  const analysis = req.body?.analysis;
  if (!analysis) { res.status(400).json({ error: "analysis required" }); return; }
  await db.update(tradesTable).set({
    deepAnalysis: analysis,
    analyzedAt: new Date(),
  }).where(eq(tradesTable.id, id));
  res.json({ ok: true });
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

// Bulk upsert of real MT5 closed trade history sent by the bot on startup.
// Skips trades already present by mt5TicketId. Also purges obviously-wrong
// paper test data (|pnl| > $50,000 with no mt5TicketId).
router.post("/trades/sync-history", async (req, res): Promise<void> => {
  const incoming: Array<{
    mt5_ticket_id: string;
    symbol: string;
    side: string;
    strategy: string;
    entry_price: string;
    exit_price: string;
    quantity: string;
    pnl: string;
    fees: string;
    opened_at: string;
    closed_at: string;
  }> = req.body?.trades ?? [];

  if (!incoming.length) {
    res.json({ inserted: 0, purged: 0 });
    return;
  }

  // Purge ALL trades that are clearly old test/paper data:
  // - no mt5TicketId (never came from a real MT5 sync)
  // - OR retired strategy name that no longer exists
  const RETIRED_STRATEGIES = new Set([
    "momentum", "mean_reversion", "statistical_arb", "statistical",
    "Momentum", "MeanReversion", "StatArb", "Statist", "Momentu", "Mean_re",
  ]);
  const allTrades = await db.select({ id: tradesTable.id, strategy: tradesTable.strategy, mt5TicketId: tradesTable.mt5TicketId }).from(tradesTable);
  const badIds = allTrades
    .filter(t => !t.mt5TicketId || RETIRED_STRATEGIES.has(t.strategy))
    .map(t => t.id);
  if (badIds.length) {
    for (const id of badIds) await db.delete(tradesTable).where(eq(tradesTable.id, id));
  }

  // Find which ticket IDs are already in the DB
  const existing = await db.select({ mt5TicketId: tradesTable.mt5TicketId }).from(tradesTable);
  const existingTickets = new Set(existing.map(r => r.mt5TicketId).filter(Boolean));

  const toInsert = incoming.filter(t => !existingTickets.has(t.mt5_ticket_id));
  if (toInsert.length) {
    await db.insert(tradesTable).values(
      toInsert.map(t => ({
        symbol: t.symbol,
        side: t.side as "long" | "short",
        status: "closed" as const,
        strategy: t.strategy || "mt5",
        orderType: "market" as const,
        entryPrice: t.entry_price,
        exitPrice: t.exit_price,
        quantity: t.quantity,
        pnl: t.pnl,
        fees: t.fees || "0",
        slippage: "0",
        tags: ["mt5", "history"],
        mt5TicketId: t.mt5_ticket_id,
        openedAt: new Date(t.opened_at),
        closedAt: new Date(t.closed_at),
      }))
    );
  }

  res.json({ inserted: toInsert.length, purged: badIds.length, total: incoming.length });
});

export default router;
