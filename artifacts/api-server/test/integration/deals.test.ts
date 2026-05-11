/**
 * Integration tests for the deals API.
 *
 * Run with a test database. Stripe calls go to Stripe test mode — they're real
 * but use fake cards. The cost of running these is zero (test mode) and they
 * catch genuine bugs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app, resetDb, db, dealsTable } from "../helpers/app";
import { seedDeal, seedSeller } from "../helpers/db";
import { eq } from "drizzle-orm";
import { stripe } from "../../src/lib/stripe";

beforeEach(async () => {
  await resetDb();
});

describe("POST /api/deals — create deal", () => {
  it("creates a deal in 'pending_buyer_confirmation' state when the seller creates it", async () => {
    const res = await request(app)
      .post("/api/deals")
      // Seller creates → buyer must authenticate and confirm before paying
      .set("x-test-email", "seller@test.local")
      .send({
        title: "Gibson Les Paul Studio",
        description: "Mid-2010s, mahogany body, scratch on the back",
        amountNzd: 850,
        buyerEmail: "buyer@test.local",
        sellerEmail: "seller@test.local",
        creatorRole: "seller",
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.amountNzd).toBe(850);
    expect(res.body.feeNzd).toBe(34); // 4% of 850
    expect(res.body.kycFeeNzd).toBe(0); // KYC disabled
    expect(res.body.totalNzd).toBe(884); // 850 + 34, no KYC
    expect(res.body.state).toBe("pending_buyer_confirmation");
    expect(res.body.version).toBe(0);
  });

  it("creates a deal in 'pending_seller_acceptance' state when the buyer creates it", async () => {
    const res = await request(app)
      .post("/api/deals")
      // Buyer creates → seller must accept first
      .set("x-test-email", "buyer@test.local")
      .send({
        title: "Guitar Pedal",
        description: "Boss DS-1, barely used",
        amountNzd: 80,
        buyerEmail: "buyer@test.local",
        sellerEmail: "seller@test.local",
        creatorRole: "buyer",
      });
    expect(res.status).toBe(201);
    expect(res.body.state).toBe("pending_seller_acceptance");
  });

  it("rejects when creatorRole email does not match session (impersonation attempt)", async () => {
    const res = await request(app)
      .post("/api/deals")
      .set("x-test-email", "attacker@test.local")
      .send({
        title: "Scam deal",
        description: "Attacker claims to be the seller but isn't",
        amountNzd: 200,
        buyerEmail: "victim@test.local",
        sellerEmail: "seller@test.local",
        creatorRole: "seller",
      });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/must match the seller email/);
  });

  it("rejects amount above the $2500 cap", async () => {
    const res = await request(app)
      .post("/api/deals")
      .set("x-test-email", "seller@test.local")
      .send({
        title: "Too expensive",
        description: "This should be rejected per the platform cap",
        amountNzd: 5000,
        buyerEmail: "buyer@test.local",
        sellerEmail: "seller@test.local",
        creatorRole: "seller",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Escrow\.com/);
  });

  it("rejects when buyer and seller emails match (case-insensitive)", async () => {
    const res = await request(app)
      .post("/api/deals")
      .set("x-test-email", "person@test.local")
      .send({
        title: "Self-deal",
        description: "Buyer and seller cannot be the same person",
        amountNzd: 100,
        buyerEmail: "person@test.local",
        sellerEmail: "PERSON@test.local",
        creatorRole: "buyer",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot be the same/);
  });

  it("rejects missing required fields with a clear error", async () => {
    const res = await request(app).post("/api/deals").send({ title: "incomplete" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/deals — list", () => {
  it("returns deals filtered by session email (buyer)", async () => {
    await seedDeal({ buyerEmail: "alice@test.local", sellerEmail: "bob@test.local" });
    await seedDeal({ buyerEmail: "carol@test.local", sellerEmail: "bob@test.local" });
    // Server uses session email (x-test-email in bypass mode) — ignores ?email query param
    const res = await request(app)
      .get("/api/deals?role=buyer")
      .set("x-test-email", "alice@test.local");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].buyerEmail).toBe("alice@test.local");
  });

  it("returns empty array when session user has no deals", async () => {
    const res = await request(app)
      .get("/api/deals?role=buyer")
      .set("x-test-email", "nobody@test.local");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /api/deals/:dealId — get one", () => {
  it("returns the deal to the buyer", async () => {
    const deal = await seedDeal(); // defaults: buyer@example.com / seller@example.com
    const res = await request(app)
      .get(`/api/deals/${deal.id}`)
      .set("x-test-email", "buyer@example.com");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(deal.id);
  });

  it("404 on unknown id (authenticated user)", async () => {
    const res = await request(app)
      .get("/api/deals/00000000-0000-0000-0000-000000000000")
      .set("x-test-email", "buyer@example.com");
    expect(res.status).toBe(404);
  });

  it("403 when authenticated user is not buyer or seller", async () => {
    const deal = await seedDeal(); // buyer@example.com / seller@example.com
    const res = await request(app)
      .get(`/api/deals/${deal.id}`)
      .set("x-test-email", "thirdparty@example.com");
    expect(res.status).toBe(403);
  });
});

describe("POST /api/deals/:id/accept — seller acceptance", () => {
  it("seller can accept a pending deal → state becomes created", async () => {
    const deal = await seedDeal({ state: "pending_seller_acceptance" });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/accept`)
      .set("x-test-email", deal.sellerEmail);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("created");
  });

  it("buyer cannot accept a deal (403)", async () => {
    const deal = await seedDeal({ state: "pending_seller_acceptance" });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/accept`)
      .set("x-test-email", deal.buyerEmail);
    expect(res.status).toBe(403);
  });

  it("cannot accept a deal already in created state (400)", async () => {
    const deal = await seedDeal({ state: "created" });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/accept`)
      .set("x-test-email", deal.sellerEmail);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/deals/:id/mark-shipped — seller action", () => {
  it("only the seller can mark shipped (403 otherwise)", async () => {
    const deal = await seedDeal({
      state: "funded",
      buyerEmail: "buyer@x.com",
      sellerEmail: "seller@x.com",
    });

    // Buyer trying to mark shipped — denied
    const res1 = await request(app)
      .post(`/api/deals/${deal.id}/mark-shipped`)
      .set("x-test-email", "buyer@x.com")
      .send({ sellerEmail: "buyer@x.com", trackingNumber: "T123", courierSlug: "nzpost" });
    expect(res1.status).toBe(403);

    // Random third party — denied
    const res2 = await request(app)
      .post(`/api/deals/${deal.id}/mark-shipped`)
      .set("x-test-email", "stranger@x.com")
      .send({ sellerEmail: "stranger@x.com", trackingNumber: "T123", courierSlug: "nzpost" });
    expect(res2.status).toBe(403);

    // Real seller — allowed
    const res3 = await request(app)
      .post(`/api/deals/${deal.id}/mark-shipped`)
      .set("x-test-email", "seller@x.com")
      .send({ sellerEmail: "seller@x.com", trackingNumber: "T123", courierSlug: "nzpost" });
    expect(res3.status).toBe(200);
    expect(res3.body.state).toBe("shipped");
    expect(res3.body.version).toBe(1);
  });

  it("blocks marking shipped from a non-funded state", async () => {
    const deal = await seedDeal({ state: "created" });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/mark-shipped`)
      .set("x-test-email", deal.sellerEmail)
      .send({ sellerEmail: deal.sellerEmail, trackingNumber: "T", courierSlug: "nzpost" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Cannot mark shipped/);
  });
});

describe("POST /api/deals/:id/dispute — either party", () => {
  it("buyer can raise dispute", async () => {
    const deal = await seedDeal({ state: "shipped", trackingNumber: "T1", courierSlug: "nzpost" });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/dispute`)
      .set("x-test-email", deal.buyerEmail)
      .send({ raisedByEmail: deal.buyerEmail, reason: "Item not as described" });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("disputed");
  });

  it("third party cannot raise dispute (403)", async () => {
    const deal = await seedDeal({ state: "funded" });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/dispute`)
      .set("x-test-email", "interloper@x.com")
      .send({ raisedByEmail: "interloper@x.com", reason: "I'm not even involved" });
    expect(res.status).toBe(403);
  });

  it("blocks disputing a complete deal", async () => {
    const deal = await seedDeal({ state: "complete" });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/dispute`)
      .set("x-test-email", deal.buyerEmail)
      .send({ raisedByEmail: deal.buyerEmail, reason: "Too late" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/deals/:id/cancel", () => {
  it("either party can cancel a 'created' deal", async () => {
    const deal = await seedDeal({ state: "created" });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.buyerEmail)
      .send({ requestedByEmail: deal.buyerEmail });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("cancelled");
  });

  it("blocks cancelling a shipped deal — must dispute instead", async () => {
    const deal = await seedDeal({ state: "shipped" });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.buyerEmail)
      .send({ requestedByEmail: deal.buyerEmail });
    expect(res.status).toBe(400);
  });
});

describe("end-to-end happy path", () => {
  it("created → funded → shipped → delivered → complete with version increments", async () => {
    // Seller has a verified Stripe account; mock the transfer so no real Stripe call is made.
    // State-machine flow is the primary concern; the Stripe path is exercised in the transfer suite.
    await seedSeller({ email: "seller@e2e.local", chargesEnabled: true, payoutsEnabled: true });
    vi.spyOn(stripe.transfers, "create").mockResolvedValueOnce({ id: "tr_e2e_mock" } as ReturnType<typeof stripe.transfers.create> extends Promise<infer T> ? T : never);

    // 1. Seller creates → pending_buyer_confirmation
    const create = await request(app)
      .post("/api/deals")
      .set("x-test-email", "seller@e2e.local")
      .send({
        title: "Camera lens",
        description: "Canon 50mm 1.8 — basically new",
        amountNzd: 200,
        buyerEmail: "buyer@e2e.local",
        sellerEmail: "seller@e2e.local",
        creatorRole: "seller",
      });
    expect(create.status).toBe(201);
    const dealId = create.body.id;
    expect(create.body.state).toBe("pending_buyer_confirmation");
    expect(create.body.version).toBe(0);

    // 2. Buyer authenticates and confirms → created
    const confirm = await request(app)
      .post(`/api/deals/${dealId}/confirm-as-buyer`)
      .set("x-test-email", "buyer@e2e.local");
    expect(confirm.status).toBe(200);
    expect(confirm.body.state).toBe("created");
    expect(confirm.body.version).toBe(1);

    // 3. Simulate funding by directly setting state — production would go through Stripe webhook
    await db
      .update(dealsTable)
      .set({ state: "funded", fundedAt: new Date(), stripePaymentIntentId: "pi_test_e2e", version: 2 })
      .where(eq(dealsTable.id, dealId));

    // 4. Seller ships
    const ship = await request(app)
      .post(`/api/deals/${dealId}/mark-shipped`)
      .set("x-test-email", "seller@e2e.local")
      .send({ sellerEmail: "seller@e2e.local", trackingNumber: "EE123NZ", courierSlug: "nzpost" });
    expect(ship.status).toBe(200);
    expect(ship.body.state).toBe("shipped");
    expect(ship.body.version).toBe(3);

    // 5. Simulate delivery via direct DB update
    await db
      .update(dealsTable)
      .set({ state: "delivered", deliveredAt: new Date(), version: 4 })
      .where(eq(dealsTable.id, dealId));

    // 6. Buyer releases funds
    const release = await request(app)
      .post(`/api/deals/${dealId}/release-funds`)
      .set("x-test-email", "buyer@e2e.local")
      .send({ buyerEmail: "buyer@e2e.local" });
    expect(release.status).toBe(200);
    expect(release.body.state).toBe("complete");
    expect(release.body.version).toBe(5);
  });
});

describe("POST /api/deals/:id/confirm-payment — separate-charges-and-transfers", () => {
  it("PaymentIntent has no application_fee_amount or on_behalf_of", async () => {
    const deal = await seedDeal({ state: "created", buyerEmail: "buyer@stripe-test.local" });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/confirm-payment`)
      .set("x-test-email", deal.buyerEmail)
      .send({ buyerEmail: deal.buyerEmail });
    expect(res.status).toBe(200);

    const pi = await stripe.paymentIntents.retrieve(res.body.paymentIntentId);
    expect(pi.application_fee_amount).toBeNull();
    expect(pi.on_behalf_of).toBeNull();
  });
});

describe("POST /api/deals/:id/cancel — Stripe PI branching", () => {
  it("cancels the PaymentIntent when PI has not yet succeeded", async () => {
    const pi = await stripe.paymentIntents.create({
      amount: 10500,
      currency: "nzd",
      payment_method_types: ["card"],
    });
    const deal = await seedDeal({ state: "created", stripePaymentIntentId: pi.id });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.buyerEmail)
      .send({ requestedByEmail: deal.buyerEmail });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("cancelled");
    const retrieved = await stripe.paymentIntents.retrieve(pi.id);
    expect(retrieved.status).toBe("canceled");
  });

  it("issues a refund when the PaymentIntent has already succeeded", async () => {
    const pi = await stripe.paymentIntents.create({
      amount: 10500,
      currency: "nzd",
      payment_method: "pm_card_visa",
      payment_method_types: ["card"],
      confirm: true,
    });
    const deal = await seedDeal({ state: "funded", stripePaymentIntentId: pi.id });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.buyerEmail)
      .send({ requestedByEmail: deal.buyerEmail });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("cancelled");
    const refunds = await stripe.refunds.list({ payment_intent: pi.id });
    expect(refunds.data.length).toBeGreaterThan(0);
  });
});

describe("POST /api/deals/:id/release-funds — Stripe transfer failure", () => {
  it("returns 502 and leaves deal in delivered when stripe.transfers.create throws", async () => {
    const seller = await seedSeller({ chargesEnabled: true });
    const deal = await seedDeal({
      state: "delivered",
      sellerEmail: seller.email,
      stripePaymentIntentId: "pi_test_will_fail",
    });

    const spy = vi
      .spyOn(stripe.transfers, "create")
      .mockRejectedValueOnce(new Error("Stripe test: transfer rejected"));

    const res = await request(app)
      .post(`/api/deals/${deal.id}/release-funds`)
      .set("x-test-email", deal.buyerEmail)
      .send({ buyerEmail: deal.buyerEmail });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/transfer to seller failed/i);

    const [after] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(after.state).toBe("delivered");
    expect(after.stripeTransferError).toBe("Stripe test: transfer rejected");

    spy.mockRestore();
  });

  it("returns 502 when seller has no Stripe account (fail-closed guard)", async () => {
    // No seller seeded — releaseDealFunds must return an error rather than
    // silently completing the deal without paying the seller.
    const deal = await seedDeal({
      state: "delivered",
      stripePaymentIntentId: "pi_test_no_seller",
      stripeTransferError: "previous failure",
    });

    const res = await request(app)
      .post(`/api/deals/${deal.id}/release-funds`)
      .set("x-test-email", deal.buyerEmail)
      .send({ buyerEmail: deal.buyerEmail });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/transfer to seller failed/i);

    const [after] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(after.state).toBe("delivered");
  });

  it("transitions to complete and clears stripeTransferError when retry succeeds", async () => {
    // Seller now has a verified Stripe account — mock a successful transfer to
    // verify the deal advances to complete and stripeTransferError is cleared.
    const seller = await seedSeller({ chargesEnabled: true, payoutsEnabled: true });
    const deal = await seedDeal({
      state: "delivered",
      sellerEmail: seller.email,
      stripePaymentIntentId: "pi_test_retry_success",
      stripeTransferError: "previous failure",
    });

    const spy = vi
      .spyOn(stripe.transfers, "create")
      .mockResolvedValueOnce({ id: "tr_retry_success" } as ReturnType<typeof stripe.transfers.create> extends Promise<infer T> ? T : never);

    const res = await request(app)
      .post(`/api/deals/${deal.id}/release-funds`)
      .set("x-test-email", deal.buyerEmail)
      .send({ buyerEmail: deal.buyerEmail });

    expect(res.status).toBe(200);
    expect(res.body.state).toBe("complete");
    expect(res.body.stripeTransferError).toBeNull();

    spy.mockRestore();
  });
});
