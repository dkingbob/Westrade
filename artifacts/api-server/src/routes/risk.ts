import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { riskSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { riskEngine } from "../engine/risk";
import { tradingEngine } from "../engine/tradingEngine";
import { UpdateRiskSettingsBody } from "@workspace/api-zod";
import { wsServer } from "../ws/server";

const router: IRouter = Router();

router.get("/risk/state", async (req, res): Promise<void> => {
  const state = riskEngine.getState();
  res.json(state);
});

router.get("/risk/settings", async (req, res): Promise<void> => {
  const [settings] = await db.select().from(riskSettingsTable).limit(1);
  if (!settings) {
    res.json(riskEngine.getConfig());
    return;
  }

  res.json({
    maxDailyLossPct: parseFloat(settings.maxDailyLossPct as string),
    maxDrawdownPct: parseFloat(settings.maxDrawdownPct as string),
    maxExposurePct: parseFloat(settings.maxExposurePct as string),
    riskPerTradePct: parseFloat(settings.riskPerTradePct as string),
    maxOpenPositions: settings.maxOpenPositions,
    correlationThreshold: parseFloat(settings.correlationThreshold as string),
    slippagePct: parseFloat(settings.slippagePct as string),
    feesPct: parseFloat(settings.feesPct as string),
  });
});

router.patch("/risk/settings", async (req, res): Promise<void> => {
  const body = UpdateRiskSettingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [existing] = await db.select().from(riskSettingsTable).limit(1);

  let updated;
  if (existing) {
    const updateData: Record<string, unknown> = {};
    if (body.data.maxDailyLossPct !== undefined) updateData.maxDailyLossPct = body.data.maxDailyLossPct.toFixed(6);
    if (body.data.maxDrawdownPct !== undefined) updateData.maxDrawdownPct = body.data.maxDrawdownPct.toFixed(6);
    if (body.data.maxExposurePct !== undefined) updateData.maxExposurePct = body.data.maxExposurePct.toFixed(6);
    if (body.data.riskPerTradePct !== undefined) updateData.riskPerTradePct = body.data.riskPerTradePct.toFixed(6);
    if (body.data.maxOpenPositions !== undefined) updateData.maxOpenPositions = body.data.maxOpenPositions;
    if (body.data.correlationThreshold !== undefined) updateData.correlationThreshold = body.data.correlationThreshold.toFixed(6);
    if (body.data.slippagePct !== undefined) updateData.slippagePct = body.data.slippagePct.toFixed(6);
    if (body.data.feesPct !== undefined) updateData.feesPct = body.data.feesPct.toFixed(6);
    [updated] = await db.update(riskSettingsTable).set(updateData).where(eq(riskSettingsTable.id, existing.id)).returning();
  } else {
    [updated] = await db.insert(riskSettingsTable).values({
      maxDailyLossPct: (body.data.maxDailyLossPct ?? 0.02).toFixed(6),
      maxDrawdownPct: (body.data.maxDrawdownPct ?? 0.10).toFixed(6),
      maxExposurePct: (body.data.maxExposurePct ?? 0.80).toFixed(6),
      riskPerTradePct: (body.data.riskPerTradePct ?? 0.01).toFixed(6),
      maxOpenPositions: body.data.maxOpenPositions ?? 5,
      correlationThreshold: (body.data.correlationThreshold ?? 0.70).toFixed(6),
      slippagePct: (body.data.slippagePct ?? 0.001).toFixed(6),
      feesPct: (body.data.feesPct ?? 0.001).toFixed(6),
    }).returning();
  }

  const riskConfig = {
    maxDailyLossPct: parseFloat(updated.maxDailyLossPct as string),
    maxDrawdownPct: parseFloat(updated.maxDrawdownPct as string),
    maxExposurePct: parseFloat(updated.maxExposurePct as string),
    riskPerTradePct: parseFloat(updated.riskPerTradePct as string),
    maxOpenPositions: updated.maxOpenPositions,
    correlationThreshold: parseFloat(updated.correlationThreshold as string),
    slippagePct: parseFloat(updated.slippagePct as string),
    feesPct: parseFloat(updated.feesPct as string),
  };

  // Apply to risk engine
  riskEngine.updateConfig(riskConfig);

  // Broadcast to connected bots
  wsServer.broadcast("config_update", { riskSettings: riskConfig });

  res.json({
    maxDailyLossPct: parseFloat(updated.maxDailyLossPct as string),
    maxDrawdownPct: parseFloat(updated.maxDrawdownPct as string),
    maxExposurePct: parseFloat(updated.maxExposurePct as string),
    riskPerTradePct: parseFloat(updated.riskPerTradePct as string),
    maxOpenPositions: updated.maxOpenPositions,
    correlationThreshold: parseFloat(updated.correlationThreshold as string),
    slippagePct: parseFloat(updated.slippagePct as string),
    feesPct: parseFloat(updated.feesPct as string),
  });
});

router.post("/risk/kill-switch", async (req, res): Promise<void> => {
  const result = await tradingEngine.emergencyKillSwitch();
  wsServer.broadcast("kill_switch", { reason: "Risk engine kill switch activated" });
  res.json({
    success: true,
    closedPositions: result.closedPositions,
    message: `Kill switch activated. ${result.closedPositions} positions closed.`,
  });
});

export default router;
