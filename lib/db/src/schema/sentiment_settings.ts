import { pgTable, serial, text, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sentimentSettingsTable = pgTable("sentiment_settings", {
  id: serial("id").primaryKey(),
  mode: text("mode").notNull().default("clean"), // clean | hype | custom
  institutionalWeight: numeric("institutional_weight", { precision: 6, scale: 4 }).notNull().default("0.60"),
  retailWeight: numeric("retail_weight", { precision: 6, scale: 4 }).notNull().default("0.20"),
  momentumWeight: numeric("momentum_weight", { precision: 6, scale: 4 }).notNull().default("0.20"),
  enabled: boolean("enabled").notNull().default(true),
  maxMultiplier: numeric("max_multiplier", { precision: 6, scale: 4 }).notNull().default("1.50"),
  minMultiplier: numeric("min_multiplier", { precision: 6, scale: 4 }).notNull().default("0.50"),
});

export const insertSentimentSettingsSchema = createInsertSchema(sentimentSettingsTable).omit({ id: true });
export type InsertSentimentSettings = z.infer<typeof insertSentimentSettingsSchema>;
export type SentimentSettings = typeof sentimentSettingsTable.$inferSelect;
