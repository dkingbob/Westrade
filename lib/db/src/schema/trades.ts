import {
  pgTable,
  serial,
  text,
  numeric,
  timestamp,
  boolean,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tradesTable = pgTable("trades", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(), // long | short
  status: text("status").notNull().default("open"), // open | closed | cancelled
  strategy: text("strategy").notNull(),
  orderType: text("order_type").notNull().default("market"), // market | limit
  entryPrice: numeric("entry_price", { precision: 18, scale: 8 }).notNull(),
  exitPrice: numeric("exit_price", { precision: 18, scale: 8 }),
  quantity: numeric("quantity", { precision: 18, scale: 8 }).notNull(),
  pnl: numeric("pnl", { precision: 18, scale: 8 }),
  pnlPct: numeric("pnl_pct", { precision: 10, scale: 6 }),
  fees: numeric("fees", { precision: 18, scale: 8 }).notNull().default("0"),
  slippage: numeric("slippage", { precision: 18, scale: 8 }).notNull().default("0"),
  mae: numeric("mae", { precision: 18, scale: 8 }), // max adverse excursion
  mfe: numeric("mfe", { precision: 18, scale: 8 }), // max favorable excursion
  stopLoss: numeric("stop_loss", { precision: 18, scale: 8 }),
  takeProfit: numeric("take_profit", { precision: 18, scale: 8 }),
  notes: text("notes"),
  tags: text("tags").array().notNull().default([]),
  zScore: numeric("z_score", { precision: 10, scale: 6 }),
  sentimentMultiplier: numeric("sentiment_multiplier", { precision: 10, scale: 6 }),
  session: text("session"),                 // asian | london | ny | off
  entryIndicators: jsonb("entry_indicators"), // {rsi, adx, bb_pct, macd_hist, atr, ema_trend}
  mt5TicketId: text("mt5_ticket_id"),         // MT5 position_id — used for dedup on history sync
  deepAnalysis: jsonb("deep_analysis"),        // per-trade bar-level analysis from Brain Gym
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }), // when deep analysis ran
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const insertTradeSchema = createInsertSchema(tradesTable).omit({
  id: true,
  openedAt: true,
});
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof tradesTable.$inferSelect;
