import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tabletopRouter from "./tabletop";
import combatRouter from "./combat";
import voiceRouter from "./voice";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tabletopRouter);
router.use(combatRouter);
router.use(voiceRouter);

export default router;
