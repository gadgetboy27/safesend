/**
 * Shared TrackingMore sync utility.
 *
 * Used by:
 *  - routes/tracking.ts (on-demand when a user loads the tracking page)
 *  - jobs/poll-shipments.ts (every 2 h, polled for all active shipped deals)
 */
import { db, trackingEventsTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Per-deal debounce: record the last time we synced each deal so that
 * repeated calls (e.g. from public tracking page polls) do not fan out
 * to the paid TrackingMore API on every inbound request.
 *
 * Keyed by dealId → timestamp (ms). TTL: 5 minutes.
 */
const lastSyncAt = new Map<string, number>();
const SYNC_DEBOUNCE_MS = 5 * 60 * 1000;

/**
 * Pulls latest tracking events from TrackingMore API and upserts them into
 * the tracking_events table. Uses conflict-ignore so retries are safe.
 *
 * Calls are debounced per deal: if the same deal was synced within the last
 * 5 minutes the function returns immediately without making an outbound request.
 * Pass `force = true` to bypass the debounce (used by background polling jobs
 * that already run on their own schedule).
 */
export async function syncTrackingFromTrackingMore(
  dealId: string,
  trackingNumber: string,
  courierSlug: string,
  force = false,
): Promise<void> {
  const apiKey = process.env.TRACKINGMORE_API_KEY;
  if (!apiKey) return;

  if (!force) {
    const last = lastSyncAt.get(dealId);
    if (last !== undefined && Date.now() - last < SYNC_DEBOUNCE_MS) {
      return;
    }
  }

  lastSyncAt.set(dealId, Date.now());

  try {
    const resp = await fetch(
      `https://api.trackingmore.com/v4/trackings/${encodeURIComponent(courierSlug)}/${encodeURIComponent(trackingNumber)}`,
      {
        headers: {
          "Tracking-Api-Key": apiKey,
          "Content-Type": "application/json",
        },
      },
    );

    if (!resp.ok) {
      // 404 just means not yet registered — not worth logging loudly
      if (resp.status !== 404) {
        logger.warn({ status: resp.status, trackingNumber }, "TrackingMore API error");
      }
      return;
    }

    const data = (await resp.json()) as {
      data?: {
        status?: string;
        checkpoints?: Array<{
          checkpoint_time?: string;
          message?: string;
          location?: string;
          tracking_detail?: string;
        }>;
      };
    };

    const checkpoints = data?.data?.checkpoints ?? [];
    const overallStatus = data?.data?.status ?? "InTransit";

    for (const cp of checkpoints) {
      if (!cp.checkpoint_time) continue;
      try {
        await db.insert(trackingEventsTable).values({
          dealId,
          status: overallStatus,
          message: cp.message ?? cp.tracking_detail ?? "Update received",
          location: cp.location ?? null,
          eventAt: new Date(cp.checkpoint_time),
        });
      } catch {
        // Duplicate event — ignore
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.warn({ trackingNumber, dealId, err: msg }, "TrackingMore sync failed");
  }
}
