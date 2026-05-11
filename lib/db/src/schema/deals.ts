import { pgTable, text, timestamp, numeric, pgEnum, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dealStateEnum = pgEnum("deal_state", [
  "pending_seller_acceptance",
  "pending_buyer_confirmation",
  "created",
  "funded",
  "shipped",
  "delivered",
  "complete",
  "disputed",
  "cancelled",
  "refunded",
]);

export const dealsTable = pgTable(
  "deals",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    amountNzd: numeric("amount_nzd", { precision: 10, scale: 2 }).notNull(),
    feeNzd: numeric("fee_nzd", { precision: 10, scale: 2 }).notNull(),
    kycFeeNzd: numeric("kyc_fee_nzd", { precision: 10, scale: 2 }).notNull().default("0"),
    totalNzd: numeric("total_nzd", { precision: 10, scale: 2 }).notNull(),
    state: dealStateEnum("state").notNull().default("created"),
    buyerEmail: text("buyer_email").notNull(),
    sellerEmail: text("seller_email").notNull(),
    trackingNumber: text("tracking_number"),
    courierSlug: text("courier_slug"),
    disputeReason: text("dispute_reason"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeTransferId: text("stripe_transfer_id"),
    stripeRefundId: text("stripe_refund_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
    fundedAt: timestamp("funded_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    version: integer("version").notNull().default(0),
    signatureRequired: boolean("signature_required").notNull().default(true),
    stripeTransferError: text("stripe_transfer_error"),
    shipmentVerificationStatus: text("shipment_verification_status").notNull().default("pending"),
    buyerPhone: text("buyer_phone"),
    sellerPhone: text("seller_phone"),
    disputedAt: timestamp("disputed_at", { withTimezone: true }),
    payByDeadline: timestamp("pay_by_deadline", { withTimezone: true }),
    shipByDeadline: timestamp("ship_by_deadline", { withTimezone: true }),
    disputeResolveBy: timestamp("dispute_resolve_by", { withTimezone: true }),
    itemUrl: text("item_url"),
    referenceNumber: text("reference_number"),
    invoiceNumber: text("invoice_number").unique(),
    creatorRole: text("creator_role"),
  },
  (table) => [
    index("idx_deals_buyer_email").on(table.buyerEmail),
    index("idx_deals_seller_email").on(table.sellerEmail),
    index("idx_deals_tracking_number").on(table.trackingNumber),
    index("idx_deals_state").on(table.state),
    index("idx_deals_delivered_at").on(table.deliveredAt),
  ],
);

export const insertDealSchema = createInsertSchema(dealsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertDeal = z.infer<typeof insertDealSchema>;
export type Deal = typeof dealsTable.$inferSelect;
