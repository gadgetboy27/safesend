/**
 * Polls TrackingMore for updates on all active (shipped) deals.
 *
 * Runs every 2 hours in addition to webhook delivery. Guards against
 * TrackingMore webhook outages that would leave deals stuck in 'shipped'.
 */
import { db, dealsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { syncTrackingFromTrackingMore } from "../lib/sync-tracking";

export async function pollActiveShipments(): Promise<void> {
  if (!process.env.TRACKINGMORE_API_KEY) {
    logger.debug("TRACKINGMORE_API_KEY not set — skipping pollActiveShipments");
    return;
  }

  const active = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.state, "shipped"));

  logger.info({ count: active.length }, "pollActiveShipments: syncing active shipments");

  for (const deal of active) {
    if (deal.trackingNumber && deal.courierSlug) {
      await syncTrackingFromTrackingMore(deal.id, deal.trackingNumber, deal.courierSlug, true);
    }
  }
}
