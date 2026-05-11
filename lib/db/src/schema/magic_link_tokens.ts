import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { randomUUID } from "crypto";

export const magicLinkTokensTable = pgTable("magic_link_tokens", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  used: boolean("used").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMagicLinkTokenSchema = createInsertSchema(magicLinkTokensTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMagicLinkToken = z.infer<typeof insertMagicLinkTokenSchema>;
export type MagicLinkToken = typeof magicLinkTokensTable.$inferSelect;
