import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dealMessagesTable = pgTable(
  "deal_messages",
  {
    id: text("id").primaryKey(),
    dealId: text("deal_id").notNull(),
    senderEmail: text("sender_email").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_deal_messages_deal_created").on(table.dealId, table.createdAt),
  ],
);

export const insertDealMessageSchema = createInsertSchema(dealMessagesTable).omit({
  createdAt: true,
});
export type InsertDealMessage = z.infer<typeof insertDealMessageSchema>;
export type DealMessage = typeof dealMessagesTable.$inferSelect;
