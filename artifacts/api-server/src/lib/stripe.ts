import Stripe from "stripe";
import { logger } from "./logger";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  throw new Error(
    "STRIPE_SECRET_KEY is required — set sk_live_... in production, sk_test_... in development/test",
  );
}
if (process.env.NODE_ENV === "production" && !key.startsWith("sk_live_")) {
  throw new Error(
    "STRIPE_SECRET_KEY is a test key (sk_test_...) but NODE_ENV=production. " +
    "Real payments cannot be processed. Set a live key (sk_live_...) in production secrets.",
  );
}

export const stripe = new Stripe(key, {
  apiVersion: "2026-04-22.dahlia",
});
