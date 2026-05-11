import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const stateTransitionsTable = pgTable("state_transitions", {
  id: serial("id").primaryKey(),
  dealId: text("deal_id").notNull(),
  fromState: text("from_state"),
  toState: text("to_state").notNull(),
  triggeredBy: text("triggered_by").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStateTransitionSchema = createInsertSchema(stateTransitionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertStateTransition = z.infer<typeof insertStateTransitionSchema>;
export type StateTransition = typeof stateTransitionsTable.$inferSelect;
