import { pgTable, serial, text, numeric, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const strategiesTable = pgTable("strategies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // mean_reversion | momentum | statistical
  active: boolean("active").notNull().default(true),
  symbols: text("symbols").array().notNull().default([]),
  parameters: jsonb("parameters").notNull().default({}),
  riskPct: numeric("risk_pct", { precision: 6, scale: 4 }).notNull().default("0.01"),
  description: text("description").notNull().default(""),
  winRate: numeric("win_rate", { precision: 6, scale: 4 }).notNull().default("0"),
  totalTrades: integer("total_trades").notNull().default(0),
  pnl: numeric("pnl", { precision: 18, scale: 8 }).notNull().default("0"),
});

export const insertStrategySchema = createInsertSchema(strategiesTable).omit({ id: true });
export type InsertStrategy = z.infer<typeof insertStrategySchema>;
export type Strategy = typeof strategiesTable.$inferSelect;
