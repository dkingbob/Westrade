import { Router, type IRouter } from "express";
import healthRouter from "./health";
import portfolioRouter from "./portfolio";
import tradesRouter from "./trades";
import analyticsRouter from "./analytics";
import strategiesRouter from "./strategies";
import riskRouter from "./risk";
import marketRouter from "./market";
import backtestRouter from "./backtest";
import sentimentRouter from "./sentiment";
import notificationsRouter from "./notifications";
import engineRouter from "./engine";

const router: IRouter = Router();

router.use(healthRouter);
router.use(portfolioRouter);
router.use(tradesRouter);
router.use(analyticsRouter);
router.use(strategiesRouter);
router.use(riskRouter);
router.use(marketRouter);
router.use(backtestRouter);
router.use(sentimentRouter);
router.use(notificationsRouter);
router.use(engineRouter);

export default router;
