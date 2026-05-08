import { pgTable, serial, text, boolean, jsonb, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sentimentSourcesTable = pgTable("sentiment_sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // twitter | reddit | news | custom
  enabled: boolean("enabled").notNull().default(true),
  apiKey: text("api_key"),
  apiSecret: text("api_secret"),
  endpoint: text("endpoint"),
  weight: numeric("weight", { precision: 5, scale: 3 }).notNull().default("1.0"),
  mode: text("mode").notNull().default("controlled"), // controlled | open
  config: jsonb("config").notNull().default({}),
  lastFetched: timestamp("last_fetched", { withTimezone: true }),
  lastScore: numeric("last_score", { precision: 6, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSentimentSourceSchema = createInsertSchema(sentimentSourcesTable).omit({ id: true, createdAt: true });
export type InsertSentimentSource = z.infer<typeof insertSentimentSourceSchema>;
export type SentimentSource = typeof sentimentSourcesTable.$inferSelect;
