import { Router, type IRouter } from "express";
import {
  generateOhlcv,
  getSymbols,
  getTickers,
} from "../engine/marketData";
import { GetMarketDataQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/market/data", async (req, res): Promise<void> => {
  const parsed = GetMarketDataQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { symbol, timeframe, limit } = parsed.data;
  const bars = generateOhlcv(symbol, timeframe ?? "1h", limit ?? 100);
  res.json(bars);
});

router.get("/market/symbols", async (req, res): Promise<void> => {
  res.json(getSymbols());
});

router.get("/market/ticker", async (req, res): Promise<void> => {
  res.json(getTickers());
});

export default router;
