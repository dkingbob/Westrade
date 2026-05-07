import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sentimentSettingsTable } from "@workspace/db";
import { sentimentEngine } from "../engine/sentiment";
import { UpdateSentimentSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/sentiment/state", async (req, res): Promise<void> => {
  res.json(sentimentEngine.getState());
});

router.get("/sentiment/settings", async (req, res): Promise<void> => {
  const [settings] = await db.select().from(sentimentSettingsTable).limit(1);
  if (!settings) {
    res.json(sentimentEngine.getConfig());
    return;
  }

  res.json({
    mode: settings.mode,
    institutionalWeight: parseFloat(settings.institutionalWeight as string),
    retailWeight: parseFloat(settings.retailWeight as string),
    momentumWeight: parseFloat(settings.momentumWeight as string),
    enabled: settings.enabled,
    maxMultiplier: parseFloat(settings.maxMultiplier as string),
    minMultiplier: parseFloat(settings.minMultiplier as string),
  });
});

router.patch("/sentiment/settings", async (req, res): Promise<void> => {
  const body = UpdateSentimentSettingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [existing] = await db.select().from(sentimentSettingsTable).limit(1);

  let updated;
  const updateData: Record<string, unknown> = {};
  if (body.data.mode !== undefined) updateData.mode = body.data.mode;
  if (body.data.institutionalWeight !== undefined) updateData.institutionalWeight = body.data.institutionalWeight.toFixed(6);
  if (body.data.retailWeight !== undefined) updateData.retailWeight = body.data.retailWeight.toFixed(6);
  if (body.data.momentumWeight !== undefined) updateData.momentumWeight = body.data.momentumWeight.toFixed(6);
  if (body.data.enabled !== undefined) updateData.enabled = body.data.enabled;
  if (body.data.maxMultiplier !== undefined) updateData.maxMultiplier = body.data.maxMultiplier.toFixed(6);
  if (body.data.minMultiplier !== undefined) updateData.minMultiplier = body.data.minMultiplier.toFixed(6);

  if (existing) {
    [updated] = await db.update(sentimentSettingsTable).set(updateData).where(undefined as any).returning();
  } else {
    [updated] = await db.insert(sentimentSettingsTable).values({
      mode: body.data.mode ?? "clean",
      institutionalWeight: (body.data.institutionalWeight ?? 0.60).toFixed(6),
      retailWeight: (body.data.retailWeight ?? 0.20).toFixed(6),
      momentumWeight: (body.data.momentumWeight ?? 0.20).toFixed(6),
      enabled: body.data.enabled ?? true,
      maxMultiplier: (body.data.maxMultiplier ?? 1.50).toFixed(6),
      minMultiplier: (body.data.minMultiplier ?? 0.50).toFixed(6),
    }).returning();
  }

  sentimentEngine.updateConfig({
    mode: updated.mode as "clean" | "hype" | "custom",
    institutionalWeight: parseFloat(updated.institutionalWeight as string),
    retailWeight: parseFloat(updated.retailWeight as string),
    momentumWeight: parseFloat(updated.momentumWeight as string),
    enabled: updated.enabled,
    maxMultiplier: parseFloat(updated.maxMultiplier as string),
    minMultiplier: parseFloat(updated.minMultiplier as string),
  });

  res.json({
    mode: updated.mode,
    institutionalWeight: parseFloat(updated.institutionalWeight as string),
    retailWeight: parseFloat(updated.retailWeight as string),
    momentumWeight: parseFloat(updated.momentumWeight as string),
    enabled: updated.enabled,
    maxMultiplier: parseFloat(updated.maxMultiplier as string),
    minMultiplier: parseFloat(updated.minMultiplier as string),
  });
});

export default router;
