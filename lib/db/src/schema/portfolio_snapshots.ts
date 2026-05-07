import { pgTable, serial, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const portfolioSnapshotsTable = pgTable("portfolio_snapshots", {
  id: serial("id").primaryKey(),
  equity: numeric("equity", { precision: 18, scale: 8 }).notNull(),
  cash: numeric("cash", { precision: 18, scale: 8 }).notNull(),
  totalPnl: numeric("total_pnl", { precision: 18, scale: 8 }).notNull().default("0"),
  dailyPnl: numeric("daily_pnl", { precision: 18, scale: 8 }).notNull().default("0"),
  openPositions: integer("open_positions").notNull().default(0),
  drawdown: numeric("drawdown", { precision: 10, scale: 6 }).notNull().default("0"),
  exposure: numeric("exposure", { precision: 10, scale: 6 }).notNull().default("0"),
  benchmark: numeric("benchmark", { precision: 18, scale: 8 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPortfolioSnapshotSchema = createInsertSchema(portfolioSnapshotsTable).omit({ id: true, createdAt: true });
export type InsertPortfolioSnapshot = z.infer<typeof insertPortfolioSnapshotSchema>;
export type PortfolioSnapshot = typeof portfolioSnapshotsTable.$inferSelect;
