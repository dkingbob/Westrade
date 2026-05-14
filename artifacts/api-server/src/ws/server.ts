import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server } from "http";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { tradesTable } from "@workspace/db";

class WsServer {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();

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
            // broadcast live positions to dashboard clients
            this.broadcast("bot_positions", msg.data);
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
      }).returning();
      logger.info({ id: saved.id, symbol: saved.symbol }, "Bot trade saved to DB");
      this.broadcast("trade_opened", { trade: saved });
    }
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
