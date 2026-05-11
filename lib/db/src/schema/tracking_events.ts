import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const trackingEventsTable = pgTable("tracking_events", {
  id: serial("id").primaryKey(),
  dealId: text("deal_id").notNull(),
  status: text("status").notNull(),
  message: text("message").notNull(),
  location: text("location"),
  eventAt: timestamp("event_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTrackingEventSchema = createInsertSchema(trackingEventsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTrackingEvent = z.infer<typeof insertTrackingEventSchema>;
export type TrackingEvent = typeof trackingEventsTable.$inferSelect;
