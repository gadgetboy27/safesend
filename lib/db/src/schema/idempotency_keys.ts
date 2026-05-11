import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Webhook idempotency table.
 * Before processing any webhook event, insert the event ID here.
 * If the insert fails (unique violation), the event has already been processed — skip it.
 */
export const idempotencyKeysTable = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  source: text("source").notNull(), // e.g. "stripe" | "trackingmore"
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
