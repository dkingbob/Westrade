import { pgTable, serial, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const notificationSettingsTable = pgTable("notification_settings", {
  id: serial("id").primaryKey(),
  profitThresholdPct: numeric("profit_threshold_pct", { precision: 6, scale: 4 }).notNull().default("0.05"),
  lossThresholdPct: numeric("loss_threshold_pct", { precision: 6, scale: 4 }).notNull().default("0.02"),
  marginRiskPct: numeric("margin_risk_pct", { precision: 6, scale: 4 }).notNull().default("0.80"),
  drawdownWarningPct: numeric("drawdown_warning_pct", { precision: 6, scale: 4 }).notNull().default("0.05"),
  emailEnabled: boolean("email_enabled").notNull().default(false),
  dashboardEnabled: boolean("dashboard_enabled").notNull().default(true),
});

export const insertNotificationSettingsSchema = createInsertSchema(notificationSettingsTable).omit({ id: true });
export type InsertNotificationSettings = z.infer<typeof insertNotificationSettingsSchema>;
export type NotificationSettings = typeof notificationSettingsTable.$inferSelect;
