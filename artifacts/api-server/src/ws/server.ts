import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server } from "http";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { tradesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { sendAlertEmail } from "../routes/notifications";

interface AiDecisionRecord {
  symbol: string;
  side: string;
  strategy: string;
  decision: string;
  reason: string;
  price: number;
  timestamp: string;
  votes?: Record<string, string>;
}

class WsServer {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private aiDecisions: AiDecisionRecord[] = [];

  attach(server: Server) {
    this.wss = new WebSocketServer({ server, path: "/api/ws" });

    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      this.clients.add(ws);
      logger.info({ clientsCount: this.clients.size }, "WS client connected");

      ws.send(JSON.stringify({ type: "connected", message: "Trading platform WebSocket connected" }));

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          logger.debug({ msg }, "WS message received");

          if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }));
          } else if (msg.type === "bot_trade") {
            this.handleBotTrade(msg.data).catch((err) =>
              logger.warn({ err }, "Failed to save bot trade")
            );
          } else if (msg.type === "bot_positions") {
            this.handleBotPositions(msg.data).catch((err) =>
              logger.warn({ err }, "Failed to sync bot positions")
            );
          }
        } catch (err) {
          logger.warn({ err }, "Invalid WS message");
        }
      });

      ws.on("close", () => {
        this.clients.delete(ws);
        logger.info({ clientsCount: this.clients.size }, "WS client disconnected");
      });

      ws.on("error", (err) => {
        logger.warn({ err }, "WS error");
        this.clients.delete(ws);
      });
    });

    logger.info("WebSocket server attached at /api/ws");
  }

  private async handleBotTrade(data: Record<string, unknown>) {
    const action = data?.action as string;
    const trade = data?.trade as Record<string, unknown> | undefined;

    if (action === "bot_log") {
      this.broadcast("bot_log", {
        category: data.category as string,
        message: data.message as string,
        level: data.level as string ?? "info",
        timestamp: data.timestamp as string ?? new Date().toISOString(),
      });
      return;
    }

    if (action === "ai_decision") {
      const record: AiDecisionRecord = {
        symbol: data.symbol as string,
        side: data.side as string,
        strategy: data.strategy as string,
        decision: data.decision as string,
        reason: data.reason as string,
        price: data.price as number,
        timestamp: new Date().toISOString(),
        votes: data.votes as Record<string, string> | undefined,
      };
      // Keep last 200 decisions in memory so late-connecting browsers can catch up
      this.aiDecisions.unshift(record);
      if (this.aiDecisions.length > 200) this.aiDecisions.length = 200;
      // Broadcast to all connected dashboard clients
      this.broadcast("ai_decision", record);
      return;
    }

    if (action === "open" && trade) {
      const [saved] = await db.insert(tradesTable).values({
        symbol: String(trade.symbol ?? "UNKNOWN"),
        side: String(trade.side ?? "long") as "long" | "short",
        status: "open",
        strategy: String(trade.strategy ?? "bot"),
        orderType: "market",
        entryPrice: String(trade.entry_price ?? "0"),
        quantity: String(trade.quantity ?? "0"),
        fees: "0",
        slippage: "0",
        mae: "0",
        mfe: "0",
        tags: ["bot", "mt5"],
        sentimentMultiplier: trade.sentiment_multiplier
          ? String(trade.sentiment_multiplier)
          : null,
        zScore: trade.z_score ? String(trade.z_score) : null,
        session: trade.session ? String(trade.session) : null,
        entryIndicators: trade.entry_indicators ?? null,
      }).returning();
      logger.info({ id: saved.id, symbol: saved.symbol }, "Bot trade saved to DB");
      this.broadcast("trade_opened", { trade: saved });
      sendAlertEmail(
        `New Trade: ${saved.side.toUpperCase()} ${saved.symbol}`,
        `A new trade was opened by the bot.\n\nSymbol: ${saved.symbol}\nSide: ${saved.side}\nEntry: $${saved.entryPrice}\nStrategy: ${saved.strategy}\nTime: ${new Date().toUTCString()}`
      ).catch(() => {});
    } else if (action === "closed" && trade) {
      // Find open trade in DB by symbol+side and mark it closed with real MT5 P&L
      const { eq, and } = await import("drizzle-orm");
      const open = await db.select().from(tradesTable)
        .where(and(eq(tradesTable.symbol, String(trade.symbol)), eq(tradesTable.status, "open")))
        .orderBy(tradesTable.createdAt)
        .limit(1);
      if (open.length > 0) {
        await db.update(tradesTable)
          .set({
            status: "closed",
            pnl: String((trade.pnl as number ?? 0).toFixed(2)),
            exitPrice: String(trade.exit_price ?? "0"),
            closedAt: new Date(),
          })
          .where(eq(tradesTable.id, open[0].id));
        logger.info({ symbol: trade.symbol, pnl: trade.pnl }, "Closed trade P&L saved to DB");
        this.broadcast("trade_closed", { symbol: trade.symbol, pnl: trade.pnl });
      }
    } else if (action === "session_stopped") {
      const reason = data?.reason as string;
      const pnl = data?.pnl as number;
      const subject = reason === "profit_target" ? "Profit Target Reached" : "Loss Limit Hit";
      const msg = reason === "profit_target"
        ? `Daily profit target reached!\n\nSession P&L: $${pnl?.toFixed(2)}\nBot has stopped trading for this session.`
        : `Daily loss limit hit!\n\nSession P&L: $${pnl?.toFixed(2)}\nBot has stopped trading and closed all positions.`;
      sendAlertEmail(subject, msg).catch(() => {});
    }
  }

  private async handleBotPositions(positions: unknown) {
    if (!Array.isArray(positions)) return;

    // Update P&L for each open MT5 position in DB
    for (const pos of positions) {
      if (!pos.symbol) continue;
      const openTrades = await db
        .select()
        .from(tradesTable)
        .where(and(eq(tradesTable.symbol, pos.symbol), eq(tradesTable.status, "open")));

      for (const trade of openTrades) {
        await db.update(tradesTable).set({
          pnl: pos.pnl != null ? String(pos.pnl) : trade.pnl,
          ...(pos.sl != null ? { stopLoss: String(pos.sl) } : {}),
          ...(pos.tp != null ? { takeProfit: String(pos.tp) } : {}),
        }).where(eq(tradesTable.id, trade.id));
      }
    }

    // Close any DB trades whose symbol is no longer in MT5 positions
    const openDbTrades = await db
      .select()
      .from(tradesTable)
      .where(eq(tradesTable.status, "open"));

    const activeSymbols = new Set((positions as any[]).map((p) => p.symbol));
    for (const trade of openDbTrades) {
      if (!activeSymbols.has(trade.symbol)) {
        await db.update(tradesTable).set({
          status: "closed",
          closedAt: new Date(),
        }).where(eq(tradesTable.id, trade.id));
      }
    }

    this.broadcast("bot_positions", positions);
  }

  getAiDecisions(): AiDecisionRecord[] {
    return this.aiDecisions;
  }

  broadcast(type: string, data: unknown) {
    if (this.clients.size === 0) return;
    const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }
}

export const wsServer = new WsServer();
