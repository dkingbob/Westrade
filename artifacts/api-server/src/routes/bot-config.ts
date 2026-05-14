import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { botConfigTable, tradesTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";
import { wsServer } from "../ws/server";

const router: IRouter = Router();

async function getOrCreateConfig() {
  const rows = await db.select().from(botConfigTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db.insert(botConfigTable).values({}).returning();
  return created;
}

router.get("/bot/config", async (req, res): Promise<void> => {
  const cfg = await getOrCreateConfig();
  res.json(cfg);
});

router.put("/bot/config", async (req, res): Promise<void> => {
  const {
    limitOrderOnly, waitForPriceEntry, adaptiveSentiment,
    newsHaltMode, longTermMode, pausedSymbols, restrictedAssets,
    mt5AccountId, mt5Server, maxPositionUsd,
  } = req.body;

  const cfg = await getOrCreateConfig();
  const existingExtra = (cfg.botExtra as Record<string, unknown>) ?? {};
  const newExtra = maxPositionUsd !== undefined
    ? { ...existingExtra, maxPositionUsd: maxPositionUsd === null ? null : parseFloat(maxPositionUsd) }
    : existingExtra;

  const [updated] = await db
    .update(botConfigTable)
    .set({
      ...(limitOrderOnly !== undefined && { limitOrderOnly }),
      ...(waitForPriceEntry !== undefined && { waitForPriceEntry }),
      ...(adaptiveSentiment !== undefined && { adaptiveSentiment }),
      ...(newsHaltMode !== undefined && { newsHaltMode }),
      ...(longTermMode !== undefined && { longTermMode }),
      ...(pausedSymbols !== undefined && { pausedSymbols }),
      ...(restrictedAssets !== undefined && { restrictedAssets }),
      ...(mt5AccountId !== undefined && { mt5AccountId }),
      ...(mt5Server !== undefined && { mt5Server }),
      botExtra: newExtra,
      updatedAt: new Date(),
    })
    .returning();

  const extra = (updated.botExtra as Record<string, unknown>) ?? {};

  // Broadcast config update to connected bots
  wsServer.broadcast("config_update", {
    pausedSymbols: updated.pausedSymbols ?? [],
    restrictedAssets: updated.restrictedAssets ?? [],
    killSwitchActive: updated.killSwitchActive,
    limitOrderOnly: updated.limitOrderOnly,
    adaptiveSentiment: updated.adaptiveSentiment,
    newsHaltMode: updated.newsHaltMode,
    longTermMode: updated.longTermMode,
    maxPositionUsd: extra.maxPositionUsd ?? null,
  });

  res.json(updated);
});

router.post("/bot/kill-switch", async (req, res): Promise<void> => {
  const { active } = req.body;
  await getOrCreateConfig();
  const [updated] = await db
    .update(botConfigTable)
    .set({ killSwitchActive: active ?? true, updatedAt: new Date() })
    .returning();

  // Broadcast to connected bots immediately
  if (updated.killSwitchActive) {
    wsServer.broadcast("kill_switch", { reason: "Dashboard kill switch activated" });
  } else {
    wsServer.broadcast("config_update", { killSwitchActive: false });
  }

  res.json({ success: true, killSwitchActive: updated.killSwitchActive });
});

router.post("/bot/symbols/:symbol/pause", async (req, res): Promise<void> => {
  const symbol = req.params.symbol.toUpperCase();
  const cfg = await getOrCreateConfig();
  const paused = cfg.pausedSymbols ?? [];
  if (!paused.includes(symbol)) {
    await db.update(botConfigTable).set({ pausedSymbols: [...paused, symbol], updatedAt: new Date() });
  }
  res.json({ success: true, symbol, status: "paused" });
});

router.post("/bot/symbols/:symbol/resume", async (req, res): Promise<void> => {
  const symbol = req.params.symbol.toUpperCase();
  const cfg = await getOrCreateConfig();
  const paused = (cfg.pausedSymbols ?? []).filter((s) => s !== symbol);
  await db.update(botConfigTable).set({ pausedSymbols: paused, updatedAt: new Date() });
  res.json({ success: true, symbol, status: "active" });
});

router.post("/bot/positions/force-close", async (req, res): Promise<void> => {
  const { symbol } = req.body;
  if (symbol) {
    await db
      .update(tradesTable)
      .set({ status: "closed", closedAt: new Date(), notes: "Force-closed via dashboard" })
      .where(eq(tradesTable.symbol, symbol));
  } else {
    await db
      .update(tradesTable)
      .set({ status: "closed", closedAt: new Date(), notes: "Force-closed via dashboard" })
      .where(isNull(tradesTable.closedAt));
  }
  res.json({ success: true, message: symbol ? `Force-closed all ${symbol} positions` : "Force-closed all open positions" });
});

export default router;
