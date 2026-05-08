import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { botConfigTable, tradesTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";

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
    mt5AccountId, mt5Server,
  } = req.body;

  const cfg = await getOrCreateConfig();
  void cfg;
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
      updatedAt: new Date(),
    })
    .returning();
  res.json(updated);
});

router.post("/bot/kill-switch", async (req, res): Promise<void> => {
  const { active } = req.body;
  await getOrCreateConfig();
  const [updated] = await db
    .update(botConfigTable)
    .set({ killSwitchActive: active ?? true, updatedAt: new Date() })
    .returning();
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
