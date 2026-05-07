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

  // Auto-start trading engine
  try {
    await tradingEngine.start();
    logger.info("Trading engine auto-started");
  } catch (err) {
    logger.warn({ err }, "Trading engine failed to start on boot");
  }
});

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});
