import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dealsRouter from "./deals";
import trackingRouter from "./tracking";
import sellersRouter from "./sellers";
import adminRouter from "./admin";

// Note: webhook routes are mounted separately in app.ts with express.raw()
// so they receive the raw body needed for HMAC signature validation.

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(dealsRouter);
router.use(trackingRouter);
router.use(sellersRouter);
router.use(adminRouter);

export default router;
