import { eq } from "drizzle-orm";
import { db, dealsTable, sellersTable } from "@workspace/db";
import { stripe } from "./stripe";
import { nzdToCents } from "./deal-helpers";
import { transitionDeal } from "./deal-transition";
import { logger } from "./logger";

export type ReleaseFundsOutcome =
  | { ok: true; deal: typeof dealsTable.$inferSelect }
  | { ok: false; error: string };

/**
 * Shared release-funds logic used by both the manual buyer route and the
 * 48h auto-release job. Handles the Stripe Connect transfer (with idempotency
 * key so double-calls are safe) and advances the deal to `complete`.
 *
 * Does NOT perform auth checks — callers are responsible for ensuring
 * the deal is in `delivered` state and the caller is authorised.
 */
export async function releaseDealFunds(
  deal: typeof dealsTable.$inferSelect,
  triggeredBy: string,
  note?: string,
): Promise<ReleaseFundsOutcome> {
  const [seller] = await db.select().from(sellersTable).where(eq(sellersTable.email, deal.sellerEmail));

  // Fail closed: every completion path must transfer funds to the seller.
  // If the seller has not connected a verified Stripe account, or the deal has
  // no PaymentIntent to source the transfer from, return an error and leave the
  // deal in `delivered` state so the buyer (or admin) can retry once the seller
  // has completed Stripe onboarding.
  if (!seller?.stripeAccountId) {
    const msg = "Seller has not connected a Stripe account — cannot release funds";
    logger.error({ dealId: deal.id }, msg);
    return { ok: false, error: msg };
  }
  if (!seller.chargesEnabled) {
    const msg = "Seller Stripe account is not yet charges-enabled — cannot release funds";
    logger.error({ dealId: deal.id }, msg);
    return { ok: false, error: msg };
  }
  if (!seller.payoutsEnabled) {
    const msg = "Seller Stripe account payouts are not yet enabled — cannot release funds";
    logger.error({ dealId: deal.id }, msg);
    return { ok: false, error: msg };
  }
  if (!deal.stripePaymentIntentId) {
    const msg = "Deal has no Stripe PaymentIntent — cannot transfer funds";
    logger.error({ dealId: deal.id }, msg);
    return { ok: false, error: msg };
  }

  const amountCents = nzdToCents(Number(deal.amountNzd));
  try {
    const transfer = await stripe.transfers.create(
      {
        amount: amountCents,
        currency: "nzd",
        destination: seller.stripeAccountId,
        transfer_group: deal.id,
        description: `SafeSend release: ${deal.title}`,
        source_transaction: deal.stripePaymentIntentId,
      },
      { idempotencyKey: `transfer:${deal.id}` },
    );
    // Record transfer ID immediately for accounting reconciliation
    await db.update(dealsTable).set({ stripeTransferId: transfer.id }).where(eq(dealsTable.id, deal.id));
    logger.info({ dealId: deal.id, transferId: transfer.id, sellerAccountId: seller.stripeAccountId }, "Stripe transfer created");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ dealId: deal.id, err: msg }, "Stripe transfer failed — deal left in delivered, buyer can retry");
    await db.update(dealsTable).set({ stripeTransferError: msg }).where(eq(dealsTable.id, deal.id));
    return { ok: false, error: msg };
  }

  if (!deal.deliveredAt) {
    const msg = "Deal has no delivery timestamp — cannot complete without courier confirmation";
    logger.error({ dealId: deal.id }, msg);
    return { ok: false, error: msg };
  }

  const updated = await transitionDeal(
    deal.id,
    deal.version,
    deal.state,
    "complete",
    { completedAt: new Date(), deliveredAt: deal.deliveredAt, stripeTransferError: null },
    triggeredBy,
    note ?? "Funds released to seller",
  );

  return { ok: true, deal: updated };
}
