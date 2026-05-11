import { eq } from "drizzle-orm";
import { db, dealsTable } from "@workspace/db";
import { stripe } from "./stripe";
import { transitionDeal } from "./deal-transition";
import { logger } from "./logger";

export type RefundOutcome =
  | { ok: true; deal: typeof dealsTable.$inferSelect }
  | { ok: false; error: string };

/**
 * Shared refund logic used by the admin dispute-resolution route.
 * Attempts a Stripe refund (with idempotency key), then transitions the deal
 * to `refunded`. On Stripe failure, captures the error to the DB and returns
 * { ok: false } — the deal stays in its current state so the admin can retry.
 */
export async function refundDeal(
  deal: typeof dealsTable.$inferSelect,
  triggeredBy: string,
  note?: string,
): Promise<RefundOutcome> {
  if (deal.stripePaymentIntentId) {
    try {
      const refund = await stripe.refunds.create(
        {
          payment_intent: deal.stripePaymentIntentId,
          reason: "requested_by_customer",
        },
        { idempotencyKey: `refund:${deal.id}` },
      );
      // Record refund ID immediately for accounting reconciliation
      await db.update(dealsTable).set({ stripeRefundId: refund.id }).where(eq(dealsTable.id, deal.id));
      logger.info({ dealId: deal.id, refundId: refund.id, piId: deal.stripePaymentIntentId }, "Stripe refund created");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      logger.error({ dealId: deal.id, err: msg }, "Stripe refund failed — deal left in disputed, admin can retry");
      await db.update(dealsTable).set({ stripeTransferError: msg }).where(eq(dealsTable.id, deal.id));
      return { ok: false, error: msg };
    }
  }

  const updated = await transitionDeal(
    deal.id,
    deal.version,
    deal.state,
    "refunded",
    { stripeTransferError: null },
    triggeredBy,
    note ?? "Buyer refunded by admin",
  );

  return { ok: true, deal: updated };
}
