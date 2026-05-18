import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { strategiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  GetStrategyParams,
  UpdateStrategyParams,
  UpdateStrategyBody,
  ToggleStrategyParams,
} from "@workspace/api-zod";
import { wsServer } from "../ws/server";

async function broadcastStrategyRiskPcts() {
  const all = await db.select().from(strategiesTable);
  const map: Record<string, number> = {};
  for (const s of all) map[s.type] = parseFloat(s.riskPct as string);
  wsServer.broadcast("config_update", { strategyRiskPct: map });
}

const router: IRouter = Router();

function serializeStrategy(s: typeof strategiesTable.$inferSelect) {
  return {
    id: s.id,
    name: s.name,
    type: s.type,
    active: s.active,
    symbols: s.symbols as string[],
    parameters: s.parameters as Record<string, unknown>,
    riskPct: parseFloat(s.riskPct as string),
    description: s.description,
    winRate: parseFloat(s.winRate as string),
    totalTrades: s.totalTrades,
    pnl: parseFloat(s.pnl as string),
  };
}

router.get("/strategies", async (req, res): Promise<void> => {
  const strategies = await db.select().from(strategiesTable);
  res.json(strategies.map(serializeStrategy));
});

router.get("/strategies/:id", async (req, res): Promise<void> => {
  const params = GetStrategyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [strategy] = await db
    .select()
    .from(strategiesTable)
    .where(eq(strategiesTable.id, params.data.id));

  if (!strategy) {
    res.status(404).json({ error: "Strategy not found" });
    return;
  }

  res.json(serializeStrategy(strategy));
});

router.patch("/strategies/:id", async (req, res): Promise<void> => {
  const params = UpdateStrategyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateStrategyBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (body.data.active !== undefined) updateData.active = body.data.active;
  if (body.data.riskPct !== undefined) updateData.riskPct = body.data.riskPct.toFixed(6);
  if (body.data.parameters !== undefined) updateData.parameters = body.data.parameters;
  if (body.data.symbols !== undefined) updateData.symbols = body.data.symbols;

  const [strategy] = await db
    .update(strategiesTable)
    .set(updateData)
    .where(eq(strategiesTable.id, params.data.id))
    .returning();

  if (!strategy) {
    res.status(404).json({ error: "Strategy not found" });
    return;
  }

  await broadcastStrategyRiskPcts();
  res.json(serializeStrategy(strategy));
});

router.post("/strategies/:id/toggle", async (req, res): Promise<void> => {
  const params = ToggleStrategyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(strategiesTable)
    .where(eq(strategiesTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Strategy not found" });
    return;
  }

  const [strategy] = await db
    .update(strategiesTable)
    .set({ active: !existing.active })
    .where(eq(strategiesTable.id, params.data.id))
    .returning();

  res.json(serializeStrategy(strategy));
});

export default router;
