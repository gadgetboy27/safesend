import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, dealsTable, trackingEventsTable } from "@workspace/db";
import { GetTrackingParams, GetTrackingResponse, GetPublicTrackingParams, GetPublicTrackingResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { requireAuth, sessionEmail } from "../middleware/requireAuth";
import { syncTrackingFromTrackingMore } from "../lib/sync-tracking";
import { publicTrackingLimiter } from "../middleware/rateLimiters";

const router: IRouter = Router();

// GET /deals/:dealId/tracking — fetch stored tracking events, optionally sync from TrackingMore
// Auth required: session user must be buyer or seller on the deal.
router.get("/deals/:dealId/tracking", requireAuth, async (req, res): Promise<void> => {
  const params = GetTrackingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const email = sessionEmail(req);
  if (!email) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [deal] = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.id, params.data.dealId));

  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  if (
    deal.buyerEmail.toLowerCase() !== email.toLowerCase() &&
    deal.sellerEmail.toLowerCase() !== email.toLowerCase()
  ) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  // If deal has a tracking number, sync latest events from TrackingMore on-demand
  if (deal.trackingNumber && deal.courierSlug) {
    await syncTrackingFromTrackingMore(deal.id, deal.trackingNumber, deal.courierSlug);
  }

  const events = await db
    .select()
    .from(trackingEventsTable)
    .where(eq(trackingEventsTable.dealId, params.data.dealId))
    .orderBy(desc(trackingEventsTable.eventAt));

  const currentStatus = events.length > 0 ? events[0].status : null;

  res.json(
    GetTrackingResponse.parse({
      trackingNumber: deal.trackingNumber ?? null,
      courierSlug: deal.courierSlug ?? null,
      currentStatus,
      events: events.map((e) => ({
        timestamp: e.eventAt,
        message: e.message,
        location: e.location ?? null,
        status: e.status,
      })),
    }),
  );
});

// GET /deals/:dealId/tracking-public — public endpoint, no auth required
// Returns a safe subset of deal data + tracking events for public tracking links.
// Does NOT expose: financial amounts, full emails, phone numbers, payment IDs.
// Rate-limited to prevent unauthenticated callers from driving unlimited paid
// TrackingMore API requests by hammering the endpoint.
router.get("/deals/:dealId/tracking-public", publicTrackingLimiter, async (req, res): Promise<void> => {
  const params = GetPublicTrackingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deal] = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.id, params.data.dealId));

  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  // Sync latest tracking if available (non-fatal)
  if (deal.trackingNumber && deal.courierSlug) {
    try {
      await syncTrackingFromTrackingMore(deal.id, deal.trackingNumber, deal.courierSlug);
    } catch {
      // non-fatal — return cached events
    }
  }

  const events = await db
    .select()
    .from(trackingEventsTable)
    .where(eq(trackingEventsTable.dealId, deal.id))
    .orderBy(desc(trackingEventsTable.eventAt));

  const currentStatus = events.length > 0 ? events[0].status : null;

  // Mask buyer email: j***@example.com — enough for the frontend isBuyer check
  // without exposing the full address publicly.
  const maskEmail = (email: string): string => {
    const [local, domain] = email.split("@");
    if (!local || !domain) return "***@***";
    return `${local[0]}***@${domain}`;
  };

  res.json(
    GetPublicTrackingResponse.parse({
      id: deal.id,
      title: deal.title,
      state: deal.state,
      trackingNumber: deal.trackingNumber ?? null,
      courierSlug: deal.courierSlug ?? null,
      signatureRequired: deal.signatureRequired,
      shipmentVerificationStatus: deal.shipmentVerificationStatus,
      deliveredAt: deal.deliveredAt ?? null,
      shippedAt: deal.shippedAt ?? null,
      buyerEmailMasked: maskEmail(deal.buyerEmail),
      referenceNumber: deal.referenceNumber ?? null,
      itemUrl: deal.itemUrl ?? null,
      currentStatus,
      events: events.map((e) => ({
        timestamp: e.eventAt,
        message: e.message,
        location: e.location ?? null,
        status: e.status,
      })),
    }),
  );
});

export default router;
