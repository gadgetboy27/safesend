import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sellersTable = pgTable("sellers", {
  email: text("email").primaryKey(),
  stripeAccountId: text("stripe_account_id"),
  chargesEnabled: boolean("charges_enabled").notNull().default(false),
  payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSellerSchema = createInsertSchema(sellersTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertSeller = z.infer<typeof insertSellerSchema>;
export type Seller = typeof sellersTable.$inferSelect;
