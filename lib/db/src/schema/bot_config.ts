import { pgTable, serial, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botConfigTable = pgTable("bot_config", {
  id: serial("id").primaryKey(),
  killSwitchActive: boolean("kill_switch_active").notNull().default(false),
  limitOrderOnly: boolean("limit_order_only").notNull().default(false),
  waitForPriceEntry: boolean("wait_for_price_entry").notNull().default(false),
  adaptiveSentiment: boolean("adaptive_sentiment").notNull().default(true),
  newsHaltMode: boolean("news_halt_mode").notNull().default(false),
  longTermMode: boolean("long_term_mode").notNull().default(false),
  pausedSymbols: text("paused_symbols").array().notNull().default([]),
  restrictedAssets: text("restricted_assets").array().notNull().default([]),
  mt5Connected: boolean("mt5_connected").notNull().default(false),
  mt5AccountId: text("mt5_account_id"),
  mt5Server: text("mt5_server"),
  pythonBotConnected: boolean("python_bot_connected").notNull().default(false),
  lastBotHeartbeat: timestamp("last_bot_heartbeat", { withTimezone: true }),
  botExtra: jsonb("bot_extra").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBotConfigSchema = createInsertSchema(botConfigTable).omit({ id: true });
export type InsertBotConfig = z.infer<typeof insertBotConfigSchema>;
export type BotConfig = typeof botConfigTable.$inferSelect;
