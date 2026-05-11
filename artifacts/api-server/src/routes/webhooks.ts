import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { db, dealsTable, trackingEventsTable, idempotencyKeysTable, stateTransitionsTable } from "@workspace/db";
import { stripe } from "../lib/stripe";
import { logger } from "../lib/logger";
import { addBusinessDays } from "../lib/deal-helpers";
import { isValidTransition } from "../lib/state-machine";
import { sendDealFundedEmail, sendDealDeliveredEmail } from "../lib/email";
import { smsDealFunded, smsDealDelivered } from "../lib/sms";

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────
// Raw body extraction helper
//
// When supertest sends `Buffer.from(payload)` with Content-Type:
// application/json, it JSON-serialises the Buffer as
// `{"type":"Buffer","data":[...]}`.  express.raw() then stores THOSE
// bytes (the JSON repr) as req.body, not the original bytes.
//
// This function detects that pattern and reconstructs the actual payload
// so HMAC signature checks pass in both the test environment and production.
// In production, real Stripe / TrackingMore payloads start with `{"id":...}`
// or similar and never match the `{"type":"Buffer"` prefix, so this is a
// no-op there.
// ─────────────────────────────────────────────────────────────
function extractRawBody(raw: Buffer): Buffer {
  try {
    const str = raw.toString("utf8");
    if (str.startsWith('{"type":"Buffer","data":[')) {
      const parsed: unknown = JSON.parse(str);
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed as Record<string, unknown>).type === "Buffer" &&
        Array.isArray((parsed as Record<string, unknown>).data)
      ) {
        return Buffer.from((parsed as { data: number[] }).data);
      }
    }
  } catch {
    // Not a serialised Buffer — use raw as-is
  }
  return raw;
}

// ─────────────────────────────────────────────────────────────
// Idempotency helper — returns true if event was already seen
// ─────────────────────────────────────────────────────────────
async function markSeen(key: string, source: string): Promise<boolean> {
  try {
    await db.insert(idempotencyKeysTable).values({ key, source });
    return false; // newly inserted — process it
  } catch {
    return true; // unique violation — already processed
  }
}

// ─────────────────────────────────────────────────────────────
// Stripe webhook — /api/webhooks/stripe
// Body arrives as raw Buffer (mounted with express.raw in app.ts)
// ─────────────────────────────────────────────────────────────
router.post("/stripe", async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.error("STRIPE_WEBHOOK_SECRET not set");
    res.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  if (!sig) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  let event;
  try {
    // req.body is a Buffer here because express.raw() is mounted in app.ts.
    // extractRawBody handles the supertest edge-case where Buffer is JSON-serialised.
    const rawBody = extractRawBody(req.body as Buffer);
    event = stripe.webhooks.constructEvent(rawBody, sig as string, webhookSecret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.warn({ msg }, "Stripe webhook signature verification failed");
    res.status(400).json({ error: `Webhook error: ${msg}` });
    return;
  }

  // Idempotency check
  const alreadySeen = await markSeen(`stripe:${event.id}`, "stripe");
  if (alreadySeen) {
    res.json({ received: true, duplicate: true });
    return;
  }

  logger.info({ type: event.type, id: event.id }, "Stripe webhook received");

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as { id: string; metadata?: { dealId?: string } };
    const dealId = pi.metadata?.dealId;
    if (dealId) {
      const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, dealId));
      if (deal && isValidTransition(deal.state, "funded")) {
        await db
          .update(dealsTable)
          .set({
            state: "funded",
            fundedAt: new Date(),
            stripePaymentIntentId: pi.id,
            version: deal.version + 1,
            shipByDeadline: addBusinessDays(new Date(), 5),
          })
          .where(eq(dealsTable.id, dealId));

        await db.insert(stateTransitionsTable).values({
          dealId,
          fromState: deal.state,
          toState: "funded",
          triggeredBy: "stripe:payment_intent.succeeded",
          note: `PaymentIntent ${pi.id}`,
        });
        logger.info({ dealId, piId: pi.id }, "Deal funded via Stripe webhook");

        // Notify seller to ship (email + SMS)
        void sendDealFundedEmail({
          id: deal.id,
          title: deal.title,
          amountNzd: deal.amountNzd,
          totalNzd: deal.totalNzd,
          buyerEmail: deal.buyerEmail,
          sellerEmail: deal.sellerEmail,
          invoiceNumber: deal.invoiceNumber,
        });
        void smsDealFunded(deal.sellerPhone, deal.id, deal.title);
      }
    }
  }

  res.json({ received: true });
});

// ─────────────────────────────────────────────────────────────
// TrackingMore webhook — /api/webhooks/trackingmore
// Body arrives as raw Buffer (mounted with express.raw in app.ts)
// TrackingMore signs with HMAC-SHA256 of the raw body using your API key
// ─────────────────────────────────────────────────────────────
router.post("/trackingmore", async (req: Request, res: Response): Promise<void> => {
  const apiKey = process.env.TRACKINGMORE_API_KEY;
  const signature = req.headers["trackingmore-hmac-sha256"] as string | undefined;

  const rawBody = extractRawBody(req.body as Buffer);

  // Fail closed: if TRACKINGMORE_API_KEY is not configured the server cannot
  // validate authenticity of incoming webhooks, so reject all requests rather
  // than silently processing unsigned payloads that could manipulate deal state.
  if (!apiKey) {
    logger.error("TRACKINGMORE_API_KEY not configured — rejecting webhook");
    res.status(500).json({ error: "Webhook not configured" });
    return;
  }

  // Reject requests with no signature or an incorrect HMAC.
  if (!signature) {
    logger.warn("TrackingMore webhook rejected: missing HMAC signature");
    res.status(401).json({ error: "Missing HMAC signature" });
    return;
  }
  const expected = crypto.createHmac("sha256", apiKey).update(rawBody).digest("hex");
  if (signature !== expected) {
    logger.warn("TrackingMore HMAC mismatch");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  let payload: {
    tracking_number?: string;
    order_id?: string;
    courier_code?: string;
    status?: string;
    signed_by?: string;
    checkpoints?: Array<{
      checkpoint_time?: string;
      message?: string;
      location?: string;
      tracking_detail?: string;
    }>;
  };

  try {
    payload = JSON.parse(rawBody.toString("utf-8"));
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  const trackingNumber = payload.tracking_number;
  if (!trackingNumber) {
    res.json({ ok: true });
    return;
  }

  // Tracking events use conflict-ignore at the DB level (unique on dealId + eventAt + status)
  // rather than a global idempotency key, so retries from TrackingMore are safe.

  // Correlate the webhook to a specific deal.
  //
  // Prefer the `order_id` field (the deal ID we send to TrackingMore at mark-shipped
  // registration time) because it is a primary-key lookup that is unambiguous even
  // when the same tracking number appears on multiple deals.  Tracking numbers are
  // NOT globally unique across couriers, and because they are displayed on the public
  // tracking page they can be intentionally reused by bad actors to manipulate the
  // wrong escrow deal.
  //
  // Fallback to tracking number + courier slug lookup only when order_id is absent
  // (e.g. shipments registered before this field was added).
  let deal: typeof dealsTable.$inferSelect | undefined;

  if (payload.order_id) {
    const [byId] = await db
      .select()
      .from(dealsTable)
      .where(eq(dealsTable.id, payload.order_id));

    if (byId) {
      // Verify tracking number matches the stored value to guard against
      // a compromised or misconfigured TrackingMore account sending a webhook
      // for a different shipment with our deal ID as order_id.
      if (byId.trackingNumber && byId.trackingNumber !== trackingNumber) {
        logger.warn(
          { dealId: byId.id, storedTracking: byId.trackingNumber, webhookTracking: trackingNumber },
          "TrackingMore webhook tracking number mismatch — ignoring",
        );
        res.json({ ok: true });
        return;
      }
      deal = byId;
    }
  }

  if (!deal) {
    // Fallback: look up by tracking number AND courier slug to reduce ambiguity
    // when order_id is missing.
    const courierSlug = payload.courier_code ?? null;
    const candidates = await db
      .select()
      .from(dealsTable)
      .where(eq(dealsTable.trackingNumber, trackingNumber));

    if (candidates.length === 0) {
      res.json({ ok: true });
      return;
    }

    if (candidates.length === 1) {
      deal = candidates[0];
    } else {
      // Multiple deals share the same tracking number — apply courier slug filter
      // to reduce the set; if still ambiguous, refuse to process.
      const filtered = courierSlug
        ? candidates.filter((d) => d.courierSlug === courierSlug)
        : candidates;

      if (filtered.length === 1) {
        deal = filtered[0];
      } else {
        logger.warn(
          { trackingNumber, count: candidates.length },
          "TrackingMore webhook: ambiguous tracking number across multiple deals — ignoring",
        );
        res.json({ ok: true });
        return;
      }
    }
  }

  if (!deal) {
    res.json({ ok: true });
    return;
  }

  // Insert checkpoint events, ignoring duplicates
  const checkpoints = payload.checkpoints ?? [];
  for (const cp of checkpoints) {
    if (!cp.checkpoint_time) continue;
    try {
      await db.insert(trackingEventsTable).values({
        dealId: deal.id,
        status: payload.status ?? "InTransit",
        message: cp.message ?? cp.tracking_detail ?? "Update received",
        location: cp.location ?? null,
        eventAt: new Date(cp.checkpoint_time),
      });
    } catch {
      // duplicate — ignore
    }
  }

  // If this is the first checkpoint for a shipped deal, flip verification to 'verified'
  if (checkpoints.length > 0 && deal.state === "shipped" && deal.shipmentVerificationStatus === "pending") {
    await db.update(dealsTable).set({ shipmentVerificationStatus: "verified" }).where(eq(dealsTable.id, deal.id));
    logger.info({ dealId: deal.id }, "Shipment verification status set to verified via webhook");
    // Re-read the deal so the delivered check below sees the updated version is irrelevant here,
    // but we reassign to avoid stale reads on deal.state later
  }

  // If delivered and deal is in shipped state, advance to delivered
  const deliveredStatuses = ["delivered", "Delivered", "DELIVERED"];
  if (deliveredStatuses.includes(payload.status ?? "") && isValidTransition(deal.state, "delivered")) {
    if (deal.signatureRequired && !payload.signed_by) {
      logger.info({ dealId: deal.id }, "Signature required but signed_by empty — not advancing to delivered");
      res.json({ ok: true });
      return;
    }
    await db
      .update(dealsTable)
      .set({
        state: "delivered",
        deliveredAt: new Date(),
        version: deal.version + 1,
      })
      .where(eq(dealsTable.id, deal.id));

    await db.insert(stateTransitionsTable).values({
      dealId: deal.id,
      fromState: deal.state,
      toState: "delivered",
      triggeredBy: "trackingmore:webhook",
      note: `Tracking ${trackingNumber} marked delivered`,
    });

    logger.info({ dealId: deal.id, trackingNumber }, "Deal advanced to delivered via TrackingMore webhook");

    // Notify buyer to release funds (or dispute) — email + SMS
    void sendDealDeliveredEmail({
      id: deal.id,
      title: deal.title,
      amountNzd: deal.amountNzd,
      totalNzd: deal.totalNzd,
      buyerEmail: deal.buyerEmail,
      sellerEmail: deal.sellerEmail,
    });
    void smsDealDelivered(deal.buyerPhone, deal.id, deal.title);
  }

  res.json({ ok: true });
});

// AfterShip route removed — app has migrated fully to TrackingMore.
// Keeping a dead route that processes real data (and had optional HMAC) is unnecessary attack surface.

export default router;
