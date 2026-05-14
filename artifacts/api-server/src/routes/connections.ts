import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { botConfigTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/connections/status", async (req, res): Promise<void> => {
  const rows = await db.select().from(botConfigTable).limit(1);
  const cfg = rows[0];

  const now = Date.now();
  const heartbeatAge = cfg?.lastBotHeartbeat
    ? now - new Date(cfg.lastBotHeartbeat).getTime()
    : null;
  const botAlive = heartbeatAge !== null && heartbeatAge < 30_000;

  res.json({
    mt5: {
      connected: cfg?.mt5Connected ?? false,
      accountId: cfg?.mt5AccountId ?? null,
      server: cfg?.mt5Server ?? null,
      lastSync: cfg?.lastBotHeartbeat ?? null,
    },
    pythonBot: {
      connected: botAlive,
      lastHeartbeat: cfg?.lastBotHeartbeat ?? null,
      heartbeatAge: heartbeatAge,
    },
    websocket: {
      connected: true,
      endpoint: "/api/ws",
    },
    database: {
      connected: true,
    },
    sentimentApis: {
      twitter: false,
      reddit: false,
      newsApi: false,
    },
    updatedAt: new Date().toISOString(),
  });
});

router.post("/connections/bot/heartbeat", async (req, res): Promise<void> => {
  const { mt5Connected, mt5AccountId, mt5Server, mt5Equity } = req.body;
  const rows = await db.select().from(botConfigTable).limit(1);
  const existingExtra = (rows[0]?.botExtra as Record<string, unknown>) ?? {};
  const newExtra = mt5Equity != null
    ? { ...existingExtra, mt5Equity: parseFloat(mt5Equity) }
    : existingExtra;

  if (rows.length === 0) {
    await db.insert(botConfigTable).values({
      pythonBotConnected: true,
      lastBotHeartbeat: new Date(),
      mt5Connected: mt5Connected ?? false,
      mt5AccountId: mt5AccountId ?? null,
      mt5Server: mt5Server ?? null,
      botExtra: newExtra,
    });
  } else {
    await db
      .update(botConfigTable)
      .set({
        pythonBotConnected: true,
        lastBotHeartbeat: new Date(),
        mt5Connected: mt5Connected ?? rows[0].mt5Connected,
        mt5AccountId: mt5AccountId ?? rows[0].mt5AccountId,
        mt5Server: mt5Server ?? rows[0].mt5Server,
        botExtra: newExtra,
        updatedAt: new Date(),
      });
  }
  res.json({ success: true, timestamp: new Date().toISOString() });
});

export default router;
