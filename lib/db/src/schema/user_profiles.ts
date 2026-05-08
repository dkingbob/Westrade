import { pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userProfilesTable = pgTable("user_profiles", {
  userId: varchar("user_id").primaryKey(),
  username: text("username"),
  bio: text("bio"),
  bannerUrl: text("banner_url"),
  timezone: text("timezone").notNull().default("UTC"),
  theme: text("theme").notNull().default("dark"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserProfileSchema = createInsertSchema(userProfilesTable);
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfilesTable.$inferSelect;
