import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { alertsTable, notificationSettingsTable, botConfigTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { UpdateNotificationSettingsBody } from "@workspace/api-zod";
import nodemailer from "nodemailer";

const router: IRouter = Router();

router.get("/notifications/alerts", async (req, res): Promise<void> => {
  const alerts = await db
    .select()
    .from(alertsTable)
    .orderBy(desc(alertsTable.createdAt))
    .limit(50);

  res.json(alerts.map((a) => ({
    id: a.id,
    type: a.type,
    message: a.message,
    severity: a.severity,
    acknowledged: a.acknowledged,
    symbol: a.symbol,
    createdAt: a.createdAt.toISOString(),
  })));
});

router.get("/notifications/settings", async (req, res): Promise<void> => {
  const [settings] = await db.select().from(notificationSettingsTable).limit(1);
  if (!settings) {
    res.json({
      profitThresholdPct: 0.05,
      lossThresholdPct: 0.02,
      marginRiskPct: 0.80,
      drawdownWarningPct: 0.05,
      emailEnabled: false,
      dashboardEnabled: true,
    });
    return;
  }

  res.json({
    profitThresholdPct: parseFloat(settings.profitThresholdPct as string),
    lossThresholdPct: parseFloat(settings.lossThresholdPct as string),
    marginRiskPct: parseFloat(settings.marginRiskPct as string),
    drawdownWarningPct: parseFloat(settings.drawdownWarningPct as string),
    emailEnabled: settings.emailEnabled,
    dashboardEnabled: settings.dashboardEnabled,
  });
});

router.patch("/notifications/settings", async (req, res): Promise<void> => {
  const body = UpdateNotificationSettingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [existing] = await db.select().from(notificationSettingsTable).limit(1);

  let updated;
  const updateData: Record<string, unknown> = {};
  if (body.data.profitThresholdPct !== undefined) updateData.profitThresholdPct = body.data.profitThresholdPct.toFixed(6);
  if (body.data.lossThresholdPct !== undefined) updateData.lossThresholdPct = body.data.lossThresholdPct.toFixed(6);
  if (body.data.marginRiskPct !== undefined) updateData.marginRiskPct = body.data.marginRiskPct.toFixed(6);
  if (body.data.drawdownWarningPct !== undefined) updateData.drawdownWarningPct = body.data.drawdownWarningPct.toFixed(6);
  if (body.data.emailEnabled !== undefined) updateData.emailEnabled = body.data.emailEnabled;
  if (body.data.dashboardEnabled !== undefined) updateData.dashboardEnabled = body.data.dashboardEnabled;

  if (existing) {
    [updated] = await db.update(notificationSettingsTable).set(updateData).where(undefined as any).returning();
  } else {
    [updated] = await db.insert(notificationSettingsTable).values({
      profitThresholdPct: (body.data.profitThresholdPct ?? 0.05).toFixed(6),
      lossThresholdPct: (body.data.lossThresholdPct ?? 0.02).toFixed(6),
      marginRiskPct: (body.data.marginRiskPct ?? 0.80).toFixed(6),
      drawdownWarningPct: (body.data.drawdownWarningPct ?? 0.05).toFixed(6),
      emailEnabled: body.data.emailEnabled ?? false,
      dashboardEnabled: body.data.dashboardEnabled ?? true,
    }).returning();
  }

  res.json({
    profitThresholdPct: parseFloat(updated.profitThresholdPct as string),
    lossThresholdPct: parseFloat(updated.lossThresholdPct as string),
    marginRiskPct: parseFloat(updated.marginRiskPct as string),
    drawdownWarningPct: parseFloat(updated.drawdownWarningPct as string),
    emailEnabled: updated.emailEnabled,
    dashboardEnabled: updated.dashboardEnabled,
  });
});

// ── Email settings ────────────────────────────────────────────────────────────

async function getEmailSettings() {
  const [cfg] = await db.select().from(botConfigTable).limit(1);
  return (cfg?.botExtra as Record<string, unknown>)?.emailSettings as Record<string, unknown> ?? {};
}

async function saveEmailSettings(data: Record<string, unknown>) {
  const [cfg] = await db.select().from(botConfigTable).limit(1);
  const existing = (cfg?.botExtra as Record<string, unknown>) ?? {};
  const newExtra = { ...existing, emailSettings: data };
  if (cfg) {
    await db.update(botConfigTable).set({ botExtra: newExtra, updatedAt: new Date() });
  } else {
    await db.insert(botConfigTable).values({ botExtra: newExtra });
  }
}

export async function sendAlertEmail(subject: string, body: string) {
  const s = await getEmailSettings() as any;
  if (!s?.email || !s?.smtpHost || !s?.smtpUser || !s?.smtpPass) return;
  try {
    const transporter = nodemailer.createTransport({
      host: s.smtpHost,
      port: s.smtpPort ?? 587,
      secure: (s.smtpPort ?? 587) === 465,
      auth: { user: s.smtpUser, pass: s.smtpPass },
    });
    await transporter.sendMail({
      from: `"AlgoDesk" <${s.smtpUser}>`,
      to: s.email,
      subject: `[AlgoDesk] ${subject}`,
      text: body,
      html: `<pre style="font-family:monospace">${body}</pre>`,
    });
  } catch (err: any) {
    // Non-fatal — log but don't crash
    console.warn("Email send failed:", err?.message);
  }
}

router.get("/notifications/email-settings", async (_req, res): Promise<void> => {
  const s = await getEmailSettings() as any;
  res.json({
    email: s.email ?? "",
    smtpHost: s.smtpHost ?? "smtp.gmail.com",
    smtpPort: s.smtpPort ?? 587,
    smtpUser: s.smtpUser ?? "",
    events: s.events ?? { killSwitch: true, sessionLimit: true, profitTarget: true, newTrade: false },
  });
});

router.put("/notifications/email-settings", async (req, res): Promise<void> => {
  const { email, smtpHost, smtpPort, smtpUser, smtpPass, events } = req.body;
  const existing = await getEmailSettings() as any;
  const updated: Record<string, unknown> = {
    ...existing,
    ...(email !== undefined && { email }),
    ...(smtpHost !== undefined && { smtpHost }),
    ...(smtpPort !== undefined && { smtpPort }),
    ...(smtpUser !== undefined && { smtpUser }),
    // Only overwrite password if a new non-empty one is provided
    ...(smtpPass && { smtpPass }),
    ...(events !== undefined && { events }),
  };
  await saveEmailSettings(updated);
  res.json({ success: true });
});

router.post("/notifications/email-test", async (_req, res): Promise<void> => {
  try {
    await sendAlertEmail("Test Alert", "This is a test email from your AlgoDesk trading dashboard.\n\nIf you received this, email alerts are working correctly.");
    res.json({ success: true });
  } catch (err: any) {
    res.json({ success: false, error: err?.message });
  }
});

export default router;
