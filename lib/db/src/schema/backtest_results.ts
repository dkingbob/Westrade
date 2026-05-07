import { pgTable, serial, text, numeric, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const backtestResultsTable = pgTable("backtest_results", {
  id: serial("id").primaryKey(),
  strategyType: text("strategy_type").notNull(),
  symbol: text("symbol").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  initialCapital: numeric("initial_capital", { precision: 18, scale: 8 }).notNull(),
  finalCapital: numeric("final_capital", { precision: 18, scale: 8 }).notNull(),
  totalReturn: numeric("total_return", { precision: 10, scale: 6 }).notNull(),
  sharpeRatio: numeric("sharpe_ratio", { precision: 10, scale: 6 }).notNull(),
  sortinoRatio: numeric("sortino_ratio", { precision: 10, scale: 6 }).notNull(),
  maxDrawdown: numeric("max_drawdown", { precision: 10, scale: 6 }).notNull(),
  winRate: numeric("win_rate", { precision: 6, scale: 4 }).notNull(),
  profitFactor: numeric("profit_factor", { precision: 10, scale: 6 }).notNull(),
  totalTrades: integer("total_trades").notNull(),
  equityCurve: jsonb("equity_curve").notNull().default([]),
  trades: jsonb("trades").notNull().default([]),
  monteCarloPaths: jsonb("monte_carlo_paths"),
  walkForwardResults: jsonb("walk_forward_results"),
  parameterSensitivity: jsonb("parameter_sensitivity"),
  overfitScore: numeric("overfit_score", { precision: 6, scale: 4 }),
  parameters: jsonb("parameters").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBacktestResultSchema = createInsertSchema(backtestResultsTable).omit({ id: true, createdAt: true });
export type InsertBacktestResult = z.infer<typeof insertBacktestResultSchema>;
export type BacktestResult = typeof backtestResultsTable.$inferSelect;
