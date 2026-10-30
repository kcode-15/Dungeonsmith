import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tabletopRouter from "./tabletop";
import combatRouter from "./combat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tabletopRouter);
router.use(combatRouter);

export default router;
