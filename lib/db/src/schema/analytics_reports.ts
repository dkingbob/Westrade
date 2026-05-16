import { pgTable, serial, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const analyticsReportsTable = pgTable("analytics_reports", {
  id: serial("id").primaryKey(),
  lookback: text("lookback").notNull(), // all_time | 30d | 7d | 1d
  report: jsonb("report").notNull(),    // full StrategyOptimizationReport
  tradeCount: text("trade_count").notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAnalyticsReportSchema = createInsertSchema(analyticsReportsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAnalyticsReport = z.infer<typeof insertAnalyticsReportSchema>;
export type AnalyticsReport = typeof analyticsReportsTable.$inferSelect;
