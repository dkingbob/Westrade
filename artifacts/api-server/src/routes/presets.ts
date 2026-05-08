import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { presetsTable } from "@workspace/db";
import { eq, and, isNull, or } from "drizzle-orm";

const router: IRouter = Router();

router.get("/presets", async (req, res): Promise<void> => {
  const userId = req.user?.id ?? null;
  const rows = await db
    .select()
    .from(presetsTable)
    .where(userId ? or(isNull(presetsTable.userId), eq(presetsTable.userId, userId)) : isNull(presetsTable.userId))
    .orderBy(presetsTable.createdAt);
  res.json(rows);
});

router.get("/presets/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [row] = await db.select().from(presetsTable).where(eq(presetsTable.id, id));
  if (!row) { res.status(404).json({ error: "Preset not found" }); return; }
  res.json(row);
});

router.post("/presets", async (req, res): Promise<void> => {
  const { name, description, data, isDefault } = req.body;
  if (!name || !data) { res.status(400).json({ error: "name and data are required" }); return; }
  const userId = req.user?.id ?? null;
  const [row] = await db
    .insert(presetsTable)
    .values({ name, description: description ?? "", data, isDefault: isDefault ?? false, userId })
    .returning();
  res.status(201).json(row);
});

router.put("/presets/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { name, description, data, isDefault } = req.body;
  const userId = req.user?.id ?? null;
  const whereClause = userId
    ? and(eq(presetsTable.id, id), or(isNull(presetsTable.userId), eq(presetsTable.userId, userId)))
    : eq(presetsTable.id, id);
  const [row] = await db
    .update(presetsTable)
    .set({ ...(name && { name }), ...(description !== undefined && { description }), ...(data && { data }), ...(isDefault !== undefined && { isDefault }), updatedAt: new Date() })
    .where(whereClause!)
    .returning();
  if (!row) { res.status(404).json({ error: "Preset not found" }); return; }
  res.json(row);
});

router.delete("/presets/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(presetsTable).where(eq(presetsTable.id, id));
  res.json({ success: true });
});

router.post("/presets/:id/apply", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [row] = await db.select().from(presetsTable).where(eq(presetsTable.id, id));
  if (!row) { res.status(404).json({ error: "Preset not found" }); return; }
  res.json({ success: true, preset: row });
});

router.post("/presets/:id/duplicate", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [original] = await db.select().from(presetsTable).where(eq(presetsTable.id, id));
  if (!original) { res.status(404).json({ error: "Preset not found" }); return; }
  const userId = req.user?.id ?? null;
  const [copy] = await db
    .insert(presetsTable)
    .values({ name: `${original.name} (Copy)`, description: original.description, data: original.data as Record<string, unknown>, isDefault: false, userId })
    .returning();
  res.status(201).json(copy);
});

export default router;
