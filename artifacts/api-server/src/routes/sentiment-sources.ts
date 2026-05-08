import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sentimentSourcesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

async function seedDefaultSources() {
  const count = await db.$count(sentimentSourcesTable);
  if (count > 0) return;
  await db.insert(sentimentSourcesTable).values([
    { name: "Twitter / X", type: "twitter", enabled: false, weight: "1.0", mode: "controlled", config: {} },
    { name: "Reddit", type: "reddit", enabled: false, weight: "0.8", mode: "controlled", config: {} },
    { name: "NewsAPI", type: "news", enabled: false, weight: "1.2", mode: "controlled", config: { sources: ["bloomberg", "reuters", "financial-times"] } },
    { name: "CryptoPanic", type: "news", enabled: false, weight: "0.9", mode: "open", config: {} },
  ]);
}

router.get("/sentiment/sources", async (req, res): Promise<void> => {
  await seedDefaultSources();
  const rows = await db.select().from(sentimentSourcesTable).orderBy(sentimentSourcesTable.id);
  res.json(rows);
});

router.post("/sentiment/sources", async (req, res): Promise<void> => {
  const { name, type, enabled, apiKey, apiSecret, endpoint, weight, mode, config } = req.body;
  if (!name || !type) { res.status(400).json({ error: "name and type are required" }); return; }
  const [row] = await db
    .insert(sentimentSourcesTable)
    .values({ name, type, enabled: enabled ?? true, apiKey, apiSecret, endpoint, weight: weight ?? "1.0", mode: mode ?? "controlled", config: config ?? {} })
    .returning();
  res.status(201).json(row);
});

router.put("/sentiment/sources/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { name, enabled, apiKey, apiSecret, endpoint, weight, mode, config } = req.body;
  const [row] = await db
    .update(sentimentSourcesTable)
    .set({
      ...(name !== undefined && { name }),
      ...(enabled !== undefined && { enabled }),
      ...(apiKey !== undefined && { apiKey }),
      ...(apiSecret !== undefined && { apiSecret }),
      ...(endpoint !== undefined && { endpoint }),
      ...(weight !== undefined && { weight }),
      ...(mode !== undefined && { mode }),
      ...(config !== undefined && { config }),
    })
    .where(eq(sentimentSourcesTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Source not found" }); return; }
  res.json(row);
});

router.delete("/sentiment/sources/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(sentimentSourcesTable).where(eq(sentimentSourcesTable.id, id));
  res.json({ success: true });
});

export default router;
