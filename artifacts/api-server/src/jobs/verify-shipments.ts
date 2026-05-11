import { db, dealsTable } from "@workspace/db";
import { and, eq, lt, isNotNull } from "drizzle-orm";
import { logger } from "../lib/logger";
import { releaseDealFunds } from "../lib/release-deal-funds";
import { refundDeal } from "../lib/refund-deal";
import { transitionDeal } from "../lib/deal-transition";

/**
 * Runs every 6 hours. Flags deals where:
 *   - state is 'shipped'
 *   - verification status is 'pending'
 *   - shippedAt was more than 48 hours ago
 *
 * Flagged deals appear in the admin console for review.
 * The buyer is shown a cancellation option on the tracking page.
 */
export async function verifyShipments(): Promise<void> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const stale = await db
    .select()
    .from(dealsTable)
    .where(
      and(
        eq(dealsTable.state, "shipped"),
        eq(dealsTable.shipmentVerificationStatus, "pending"),
        lt(dealsTable.shippedAt, cutoff),
      ),
    );

  for (const deal of stale) {
    await db
      .update(dealsTable)
      .set({ shipmentVerificationStatus: "flagged" })
      .where(eq(dealsTable.id, deal.id));

    logger.warn({ dealId: deal.id }, "Deal flagged: 48h elapsed without courier scan");
  }
}

/**
 * Runs every hour. Automatically releases funds for deals where:
 *   - state is 'delivered'
 *   - deliveredAt was more than 48 hours ago
 *   - no dispute has been raised
 *
 * Uses the same Stripe transfer path as the manual release-funds route.
 * Idempotency key on the transfer prevents double-payment if both manual
 * and auto-release fire for the same deal.
 */
export async function autoReleaseDelivered(): Promise<void> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const eligible = await db
    .select()
    .from(dealsTable)
    .where(
      and(
        eq(dealsTable.state, "delivered"),
        lt(dealsTable.deliveredAt, cutoff),
      ),
    );

  for (const deal of eligible) {
    try {
      const result = await releaseDealFunds(deal, "system:auto-release-after-48h");
      if (result.ok) {
        logger.info({ dealId: deal.id }, "Deal auto-released after 48h");
      } else {
        logger.error({ dealId: deal.id, error: result.error }, "Auto-release transfer failed");
      }
    } catch (err) {
      logger.error({ dealId: deal.id, err }, "Auto-release failed with exception");
    }
  }
}

/**
 * Runs every hour. Auto-cancels deals where:
 *   - state is 'created'
 *   - pay_by_deadline has passed (7 days from creation)
 *
 * Buyer never paid — no Stripe funds to refund.
 */
export async function autoCancelUnpaid(): Promise<void> {
  const now = new Date();

  const stale = await db
    .select()
    .from(dealsTable)
    .where(
      and(
        eq(dealsTable.state, "created"),
        isNotNull(dealsTable.payByDeadline),
        lt(dealsTable.payByDeadline, now),
      ),
    );

  for (const deal of stale) {
    try {
      await transitionDeal(
        deal.id,
        deal.version,
        deal.state,
        "cancelled",
        {},
        "system:auto-cancel-unpaid",
        "Buyer did not pay within 7 days — deal auto-cancelled",
      );
      logger.warn({ dealId: deal.id }, "Deal auto-cancelled: buyer did not pay within 7 days");
    } catch (err) {
      logger.error({ dealId: deal.id, err }, "Auto-cancel unpaid failed with exception");
    }
  }
}

/**
 * Runs every hour. Auto-refunds deals where:
 *   - state is 'funded'
 *   - ship_by_deadline has passed (5 business days from funding)
 *
 * Seller was paid but never shipped — buyer gets a full Stripe refund.
 */
export async function autoRefundUnshipped(): Promise<void> {
  const now = new Date();

  const stale = await db
    .select()
    .from(dealsTable)
    .where(
      and(
        eq(dealsTable.state, "funded"),
        isNotNull(dealsTable.shipByDeadline),
        lt(dealsTable.shipByDeadline, now),
      ),
    );

  for (const deal of stale) {
    try {
      const result = await refundDeal(
        deal,
        "system:auto-refund-unshipped",
        "Seller did not ship within 5 business days — buyer refunded automatically",
      );
      if (result.ok) {
        logger.warn({ dealId: deal.id }, "Deal auto-refunded: seller did not ship within 5 business days");
      } else {
        logger.error({ dealId: deal.id, error: result.error }, "Auto-refund (unshipped) Stripe call failed");
      }
    } catch (err) {
      logger.error({ dealId: deal.id, err }, "Auto-refund unshipped failed with exception");
    }
  }
}

/**
 * Runs every hour. Auto-refunds disputes where:
 *   - state is 'disputed'
 *   - dispute_resolve_by has passed (14 days from dispute raised)
 *
 * Admin did not reach a decision in time — buyer automatically refunded.
 * This is logged prominently for post-hoc review.
 */
export async function autoRefundExpiredDispute(): Promise<void> {
  const now = new Date();

  const expired = await db
    .select()
    .from(dealsTable)
    .where(
      and(
        eq(dealsTable.state, "disputed"),
        isNotNull(dealsTable.disputeResolveBy),
        lt(dealsTable.disputeResolveBy, now),
      ),
    );

  for (const deal of expired) {
    try {
      const result = await refundDeal(
        deal,
        "system:auto-refund-expired-dispute",
        "Dispute not resolved within 14 days — buyer refunded automatically per Terms section 6",
      );
      if (result.ok) {
        logger.error(
          { dealId: deal.id },
          "DISPUTE AUTO-REFUNDED: 14-day SLA exceeded — admin review required",
        );
      } else {
        logger.error(
          { dealId: deal.id, error: result.error },
          "DISPUTE AUTO-REFUND FAILED: 14-day SLA exceeded but Stripe refund failed — urgent admin action required",
        );
      }
    } catch (err) {
      logger.error({ dealId: deal.id, err }, "Auto-refund expired dispute failed with exception — urgent admin action required");
    }
  }
}
