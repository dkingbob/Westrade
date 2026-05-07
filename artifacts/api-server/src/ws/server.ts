import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server } from "http";
import { logger } from "../lib/logger";

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
          // Echo back for ping/pong
          if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }));
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
