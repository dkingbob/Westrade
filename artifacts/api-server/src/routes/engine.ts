import { Router, type IRouter } from "express";
import { tradingEngine } from "../engine/tradingEngine";

const router: IRouter = Router();

router.get("/engine/status", async (req, res): Promise<void> => {
  res.json(tradingEngine.getStatus());
});

router.post("/engine/start", async (req, res): Promise<void> => {
  await tradingEngine.start();
  res.json(tradingEngine.getStatus());
});

router.post("/engine/stop", async (req, res): Promise<void> => {
  await tradingEngine.stop();
  res.json(tradingEngine.getStatus());
});

export default router;
