import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { userProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/user/profile", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, req.user.id));
  res.json(profile ?? { userId: req.user.id, username: null, bio: null, bannerUrl: null, timezone: "UTC", theme: "dark" });
});

router.put("/user/profile", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { username, bio, bannerUrl, timezone, theme } = req.body;
  const existing = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, req.user.id));

  if (existing.length === 0) {
    const [created] = await db
      .insert(userProfilesTable)
      .values({ userId: req.user.id, username, bio, bannerUrl, timezone, theme, updatedAt: new Date() })
      .returning();
    res.json(created);
  } else {
    const [updated] = await db
      .update(userProfilesTable)
      .set({
        ...(username !== undefined && { username }),
        ...(bio !== undefined && { bio }),
        ...(bannerUrl !== undefined && { bannerUrl }),
        ...(timezone !== undefined && { timezone }),
        ...(theme !== undefined && { theme }),
        updatedAt: new Date(),
      })
      .where(eq(userProfilesTable.userId, req.user.id))
      .returning();
    res.json(updated);
  }
});

export default router;
