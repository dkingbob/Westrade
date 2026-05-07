import { pgTable, serial, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const riskSettingsTable = pgTable("risk_settings", {
  id: serial("id").primaryKey(),
  maxDailyLossPct: numeric("max_daily_loss_pct", { precision: 6, scale: 4 }).notNull().default("0.02"),
  maxDrawdownPct: numeric("max_drawdown_pct", { precision: 6, scale: 4 }).notNull().default("0.10"),
  maxExposurePct: numeric("max_exposure_pct", { precision: 6, scale: 4 }).notNull().default("0.80"),
  riskPerTradePct: numeric("risk_per_trade_pct", { precision: 6, scale: 4 }).notNull().default("0.01"),
  maxOpenPositions: integer("max_open_positions").notNull().default(5),
  correlationThreshold: numeric("correlation_threshold", { precision: 6, scale: 4 }).notNull().default("0.70"),
  slippagePct: numeric("slippage_pct", { precision: 6, scale: 4 }).notNull().default("0.001"),
  feesPct: numeric("fees_pct", { precision: 6, scale: 4 }).notNull().default("0.001"),
});

export const insertRiskSettingsSchema = createInsertSchema(riskSettingsTable).omit({ id: true });
export type InsertRiskSettings = z.infer<typeof insertRiskSettingsSchema>;
export type RiskSettings = typeof riskSettingsTable.$inferSelect;
