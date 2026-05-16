import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { wsServer } from "./ws/server";
import { tradingEngine } from "./engine/tradingEngine";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

// Attach WebSocket server
wsServer.attach(server);

server.listen(port, async () => {
  logger.info({ port }, "Server listening");

  // Initialize trading engine (reset kill switch, seed strategies) — user starts it manually
  try {
    await tradingEngine.init();
  } catch (err) {
    logger.warn({ err }, "Trading engine init failed");
  }
});

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});
