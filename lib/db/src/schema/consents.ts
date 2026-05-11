import { pgTable, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { randomUUID } from "crypto";
import { dealsTable } from "./deals";

export const consentPartyEnum = pgEnum("consent_party", ["seller", "buyer"]);

/**
 * Records each party's digital consent to the SafeSend Escrow Agreement.
 *
 * Satisfies the Contract and Commercial Law Act 2017 requirement for a
 * verifiable "digital signature" — the combination of (deal_id, party,
 * agreed_at, ip_address, user_agent, agreement_version) constitutes an
 * auditable consent event that can be produced as evidence in the NZ
 * Disputes Tribunal or a court.
 *
 * Insertion points:
 *   seller → POST /deals (seller creates) or POST /deals/:id/accept (seller accepts buyer-created deal)
 *   buyer  → POST /deals/:id/confirm-payment (buyer initiates Stripe payment)
 */
export const consentsTable = pgTable(
  "consents",
  {
    id: text("id").primaryKey().$defaultFn(() => randomUUID()),
    dealId: text("deal_id")
      .notNull()
      .references(() => dealsTable.id, { onDelete: "cascade" }),
    party: consentPartyEnum("party").notNull(),
    agreementVersion: text("agreement_version").notNull().default("1.0"),
    agreedAt: timestamp("agreed_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("idx_consents_deal_id").on(table.dealId),
    index("idx_consents_party").on(table.party),
  ],
);

export const insertConsentSchema = createInsertSchema(consentsTable).omit({
  id: true,
  agreedAt: true,
});
export type InsertConsent = z.infer<typeof insertConsentSchema>;
export type Consent = typeof consentsTable.$inferSelect;
