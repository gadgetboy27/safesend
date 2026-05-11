/**
 * Tiny seed helpers — keep tests readable.
 */
import { randomUUID } from "crypto";
import { db, dealsTable, sellersTable } from "./app";

export async function seedDeal(overrides: Partial<typeof dealsTable.$inferInsert> = {}) {
  const id = overrides.id ?? randomUUID();
  const [deal] = await db
    .insert(dealsTable)
    .values({
      id,
      title: "Test deal",
      description: "Test description that is long enough to pass validation",
      amountNzd: "100.00",
      feeNzd: "5.00",
      totalNzd: "105.00",
      buyerEmail: "buyer@example.com",
      sellerEmail: "seller@example.com",
      state: "created",
      version: 0,
      ...overrides,
    })
    .returning();
  return deal;
}

export async function seedSeller(overrides: Partial<typeof sellersTable.$inferInsert> = {}) {
  const [seller] = await db
    .insert(sellersTable)
    .values({
      email: "seller@example.com",
      stripeAccountId: "acct_test_" + randomUUID().slice(0, 8),
      chargesEnabled: true,
      payoutsEnabled: true,
      onboardingComplete: true,
      ...overrides,
    })
    .returning();
  return seller;
}
