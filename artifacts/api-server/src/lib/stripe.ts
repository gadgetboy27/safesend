import Stripe from "stripe";
import { logger } from "./logger";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  throw new Error(
    "STRIPE_SECRET_KEY is required — set sk_live_... in production, sk_test_... in development/test",
  );
}
if (process.env.NODE_ENV === "production" && !key.startsWith("sk_live_")) {
  logger.warn(
    "STRIPE_SECRET_KEY is a test key in a production environment — " +
    "no real payments will be processed. Replace with sk_live_... before going live.",
  );
}

export const stripe = new Stripe(key, {
  apiVersion: "2026-04-22.dahlia",
});
