import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tabletopRouter from "./tabletop";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tabletopRouter);

export default router;
