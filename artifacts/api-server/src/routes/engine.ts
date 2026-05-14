import { Router, type IRouter } from "express";
import { tradingEngine } from "../engine/tradingEngine";
import { wsServer } from "../ws/server";

const router: IRouter = Router();

router.get("/engine/status", async (req, res): Promise<void> => {
  res.json(tradingEngine.getStatus());
});

router.post("/engine/start", async (req, res): Promise<void> => {
  await tradingEngine.start();
  // Tell bot to resume (deactivate kill switch if it was on)
  wsServer.broadcast("config_update", { killSwitchActive: false });
  res.json(tradingEngine.getStatus());
});

router.post("/engine/stop", async (req, res): Promise<void> => {
  await tradingEngine.stop();
  // Tell bot to stop trading
  wsServer.broadcast("kill_switch", { reason: "Engine stopped from dashboard" });
  res.json(tradingEngine.getStatus());
});

export default router;
