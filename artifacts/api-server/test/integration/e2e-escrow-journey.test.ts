/**
 * End-to-end escrow journey — auth + full deal lifecycle.
 *
 * What this covers
 * ─────────────────
 * • Magic-link auth: request link → extract token from DB → verify → session
 *   cookie → /me → logout
 * • Buyer-initiated deal: buyer creates → seller accepts → buyer pays →
 *   Stripe webhook funds the deal → seller ships → buyer releases → complete
 * • Seller-initiated deal: seller creates → buyer confirms → payment →
 *   webhook → shipped → released
 * • All state transitions checked (version increments, state names)
 * • Role enforcement: wrong-party actions return 403 or 401
 *
 * Stripe integration
 * ──────────────────
 * • PaymentIntent creation calls the REAL Stripe test API (no mock).
 * • `stripe.paymentIntents.confirm` is called from the test to simulate the
 *   browser Payment Element completing.
 * • `payment_intent.succeeded` webhooks are constructed and signed with
 *   `stripe.webhooks.generateTestHeaderString` so the HMAC validation passes.
 * • `stripe.transfers.create` is vi.spied to succeed — a live Stripe Connect
 *   Express account is required for a real transfer.
 *
 * Emails
 * ──────
 * All transactional emails are redirected to the E2E_EMAIL_RECIPIENT address
 * (set below) when RESEND_API_KEY is available.  If RESEND_API_KEY is absent
 * the route still succeeds — emails are logged and skipped.
 *
 * Version timeline for buyer-initiated deal
 * ──────────────────────────────────────────
 *   create deal (API)      → version 0
 *   accept (transitionDeal) → version 1
 *   confirm-payment        → PI ID stored, version stays 1
 *   Stripe webhook         → version 2  (manual DB update)
 *   mark-shipped           → version 3  (transitionDeal)
 *   deliver (DB direct)    → version 4
 *   release-funds          → version 5  (transitionDeal)
 */

import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

import {
  app,
  resetDb,
  createSession,
  db,
  dealsTable,
  magicLinkTokensTable,
} from "../helpers/app";
import { seedDeal, seedSeller } from "../helpers/db";
import { stripe } from "../../src/lib/stripe";

// ─── Redirect all e2e emails to one inbox ────────────────────────────────────
const E2E_RECIPIENT = "henrypeti.dev@gmail.com";

// ─── Enable real session auth (same pattern as authorization.test.ts) ─────────
const originalBypass = process.env.TEST_BYPASS_AUTH;
beforeAll(() => {
  process.env.TEST_BYPASS_AUTH = "0";
  process.env.E2E_EMAIL_RECIPIENT = E2E_RECIPIENT;
});
afterAll(() => {
  process.env.TEST_BYPASS_AUTH = originalBypass ?? "1";
  delete process.env.E2E_EMAIL_RECIPIENT;
});

beforeEach(async () => {
  await resetDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a signed Stripe webhook payload and return the body string + header.
 * Pass a stable `eventId` when you need to fire the same event twice
 * (idempotency tests).
 */
function buildStripeWebhook(
  type: string,
  data: Record<string, unknown>,
  eventId?: string,
): { payload: string; sig: string } {
  const id = eventId ?? `evt_test_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const payload = JSON.stringify({
    id,
    object: "event",
    api_version: "2026-04-22.dahlia",
    livemode: false,
    type,
    data: { object: data },
  });
  const sig = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });
  return { payload, sig };
}

/**
 * POST a signed Stripe webhook to the app and return the supertest response.
 */
async function fireStripeWebhook(
  type: string,
  data: Record<string, unknown>,
  eventId?: string,
) {
  const { payload, sig } = buildStripeWebhook(type, data, eventId);
  return request(app)
    .post("/api/webhooks/stripe")
    .set("Content-Type", "application/json")
    .set("stripe-signature", sig)
    .send(Buffer.from(payload));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · AUTH — magic-link request, verify, me, logout
// ─────────────────────────────────────────────────────────────────────────────

describe("Auth: magic-link request, verify, session, logout", () => {
  const TEST_EMAIL = "auth-journey@safesend-e2e.test";

  it("POST /api/auth/request-link returns 200 and inserts a token", async () => {
    const res = await request(app)
      .post("/api/auth/request-link")
      .send({ email: TEST_EMAIL });

    expect(res.status).toBe(200);
    // Actual message is "Check your email for a sign-in link."
    expect(res.body.message).toMatch(/email/i);

    // Token should be in the DB
    const rows = await db
      .select()
      .from(magicLinkTokensTable)
      .where(eq(magicLinkTokensTable.email, TEST_EMAIL));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].used).toBe(false);
  });

  it("POST /api/auth/verify with a valid token creates a session", async () => {
    const token = randomUUID();
    await db.insert(magicLinkTokensTable).values({
      email: TEST_EMAIL,
      token,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const res = await request(app)
      .post("/api/auth/verify")
      .set("Content-Type", "application/json")
      .send({ token });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(TEST_EMAIL);
    const cookie = res.headers["set-cookie"];
    expect(cookie).toBeDefined();
  });

  it("POST /api/auth/verify marks the token as used (cannot reuse)", async () => {
    const token = randomUUID();
    await db.insert(magicLinkTokensTable).values({
      email: TEST_EMAIL,
      token,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const first = await request(app)
      .post("/api/auth/verify")
      .set("Content-Type", "application/json")
      .send({ token });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/auth/verify")
      .set("Content-Type", "application/json")
      .send({ token });
    expect(second.status).toBe(401);
  });

  it("POST /api/auth/verify rejects expired tokens", async () => {
    const token = randomUUID();
    await db.insert(magicLinkTokensTable).values({
      email: TEST_EMAIL,
      token,
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await request(app)
      .post("/api/auth/verify")
      .set("Content-Type", "application/json")
      .send({ token });
    expect(res.status).toBe(401);
  });

  it("GET /api/auth/me returns 401 without a session", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("GET /api/auth/me returns the authenticated email with a valid session", async () => {
    const cookie = await createSession(TEST_EMAIL);
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(TEST_EMAIL);
  });

  it("POST /api/auth/logout then GET /api/auth/me returns 401", async () => {
    const cookie = await createSession(TEST_EMAIL);

    const logout = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookie);
    expect(logout.status).toBe(200);

    const me = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookie);
    expect(me.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · BUYER-INITIATED DEAL — full lifecycle (buyer creates, seller accepts)
// ─────────────────────────────────────────────────────────────────────────────

describe("Escrow lifecycle: buyer creates → seller accepts → payment → ship → release", () => {
  const BUYER = "buyer@safesend-e2e.test";
  const SELLER = "seller@safesend-e2e.test";

  it("full journey from deal creation to complete, emails sent to " + E2E_RECIPIENT, async () => {
    const buyerCookie = await createSession(BUYER);
    const sellerCookie = await createSession(SELLER);

    await seedSeller({
      email: SELLER,
      chargesEnabled: true,
      payoutsEnabled: true,
      onboardingComplete: true,
    });

    const transferSpy = vi
      .spyOn(stripe.transfers, "create")
      .mockResolvedValueOnce({
        id: `tr_e2e_${randomUUID().slice(0, 8)}`,
      } as Awaited<ReturnType<typeof stripe.transfers.create>>);

    // ── Step 1: Buyer creates deal ───────────────────────────────────────────
    const createRes = await request(app)
      .post("/api/deals")
      .set("Cookie", buyerCookie)
      .send({
        title: "Sony A7 III Camera Body",
        description: "Low shutter count, comes with box and original accessories",
        amountNzd: 1200,
        buyerEmail: BUYER,
        sellerEmail: SELLER,
        creatorRole: "buyer",
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.state).toBe("pending_seller_acceptance");
    expect(createRes.body.invoiceNumber).toMatch(/^SS-[A-Z0-9]{7}$/);
    const dealId: string = createRes.body.id;

    // ── Step 2: Seller accepts  (version 0 → 1) ──────────────────────────────
    const acceptRes = await request(app)
      .post(`/api/deals/${dealId}/accept`)
      .set("Cookie", sellerCookie);

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.state).toBe("created");
    expect(acceptRes.body.version).toBe(1);

    // ── Step 3: Buyer initiates payment — creates real Stripe PaymentIntent ──
    //    confirm-payment stores the PI ID but does NOT increment the version.
    const payRes = await request(app)
      .post(`/api/deals/${dealId}/confirm-payment`)
      .set("Cookie", buyerCookie)
      .send({ buyerEmail: BUYER });

    expect(payRes.status, `confirm-payment: ${JSON.stringify(payRes.body)}`).toBe(200);
    expect(payRes.body.clientSecret).toBeTruthy();
    const piId: string = payRes.body.paymentIntentId;
    expect(piId).toMatch(/^pi_/);

    // Verify the PaymentIntent was created in Stripe with correct metadata
    const pi = await stripe.paymentIntents.retrieve(piId);
    expect(pi.metadata.dealId).toBe(dealId);
    expect(pi.metadata.buyerEmail).toBe(BUYER);
    expect(pi.currency).toBe("nzd");

    // ── Step 4: Simulate buyer completing payment (confirms PI with test card)
    await stripe.paymentIntents.confirm(piId, {
      payment_method: "pm_card_visa",
      return_url: "https://safesend-test.local/return",
    });

    // ── Step 5: Stripe fires payment_intent.succeeded  (version 1 → 2) ───────
    const webhookRes = await fireStripeWebhook("payment_intent.succeeded", {
      id: piId,
      object: "payment_intent",
      metadata: { dealId, buyerEmail: BUYER, sellerEmail: SELLER },
    });

    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.received).toBe(true);

    const [funded] = await db
      .select()
      .from(dealsTable)
      .where(eq(dealsTable.id, dealId));
    expect(funded.state).toBe("funded");
    expect(funded.stripePaymentIntentId).toBe(piId);
    expect(funded.version).toBe(2);

    // ── Step 6: Seller marks shipped  (version 2 → 3) ────────────────────────
    const shipRes = await request(app)
      .post(`/api/deals/${dealId}/mark-shipped`)
      .set("Cookie", sellerCookie)
      .send({
        sellerEmail: SELLER,
        trackingNumber: "EE987654321NZ",
        courierSlug: "nzpost",
      });

    expect(shipRes.status, `mark-shipped: ${JSON.stringify(shipRes.body)}`).toBe(200);
    expect(shipRes.body.state).toBe("shipped");
    expect(shipRes.body.version).toBe(3);
    expect(shipRes.body.trackingNumber).toBe("EE987654321NZ");

    // ── Step 7: Simulate courier delivery via DB update  (version 3 → 4) ─────
    await db
      .update(dealsTable)
      .set({ state: "delivered", deliveredAt: new Date(), version: 4 })
      .where(eq(dealsTable.id, dealId));

    // ── Step 8: Buyer releases funds  (version 4 → 5) ────────────────────────
    const releaseRes = await request(app)
      .post(`/api/deals/${dealId}/release-funds`)
      .set("Cookie", buyerCookie)
      .send({ buyerEmail: BUYER });

    expect(releaseRes.status, `release-funds: ${JSON.stringify(releaseRes.body)}`).toBe(200);
    expect(releaseRes.body.state).toBe("complete");
    expect(releaseRes.body.version).toBe(5);
    expect(releaseRes.body.stripeTransferError).toBeNull();

    expect(transferSpy).toHaveBeenCalledOnce();
    const transferCall = transferSpy.mock.calls[0][0];
    expect(transferCall.currency).toBe("nzd");
    transferSpy.mockRestore();

    // ── Final audit ───────────────────────────────────────────────────────────
    const [finalDeal] = await db
      .select()
      .from(dealsTable)
      .where(eq(dealsTable.id, dealId));
    expect(finalDeal.state).toBe("complete");
    expect(finalDeal.fundedAt).toBeTruthy();
    expect(finalDeal.shippedAt).toBeTruthy();
    expect(finalDeal.deliveredAt).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · SELLER-INITIATED DEAL — seller creates, buyer confirms, then full flow
// ─────────────────────────────────────────────────────────────────────────────

describe("Escrow lifecycle: seller creates → buyer confirms → payment → complete", () => {
  const BUYER = "buyer2@safesend-e2e.test";
  const SELLER = "seller2@safesend-e2e.test";

  it("seller-created deal: pending_buyer_confirmation → created → funded → complete", async () => {
    const buyerCookie = await createSession(BUYER);
    const sellerCookie = await createSession(SELLER);

    await seedSeller({
      email: SELLER,
      chargesEnabled: true,
      payoutsEnabled: true,
      onboardingComplete: true,
    });

    const transferSpy = vi
      .spyOn(stripe.transfers, "create")
      .mockResolvedValueOnce({
        id: `tr_e2e_${randomUUID().slice(0, 8)}`,
      } as Awaited<ReturnType<typeof stripe.transfers.create>>);

    // ── Step 1: Seller creates deal ──────────────────────────────────────────
    const createRes = await request(app)
      .post("/api/deals")
      .set("Cookie", sellerCookie)
      .send({
        title: "Fender Stratocaster 1998",
        description: "American Standard, sunburst, original case",
        amountNzd: 950,
        buyerEmail: BUYER,
        sellerEmail: SELLER,
        creatorRole: "seller",
      });

    expect(createRes.status, `create: ${JSON.stringify(createRes.body)}`).toBe(201);
    expect(createRes.body.state).toBe("pending_buyer_confirmation");
    const dealId: string = createRes.body.id;

    // ── Step 2: Buyer confirms deal  (version 0 → 1) ─────────────────────────
    const confirmRes = await request(app)
      .post(`/api/deals/${dealId}/confirm-as-buyer`)
      .set("Cookie", buyerCookie);

    expect(confirmRes.status, `confirm-as-buyer: ${JSON.stringify(confirmRes.body)}`).toBe(200);
    expect(confirmRes.body.state).toBe("created");

    // ── Step 3: Buyer pays ───────────────────────────────────────────────────
    const payRes = await request(app)
      .post(`/api/deals/${dealId}/confirm-payment`)
      .set("Cookie", buyerCookie)
      .send({ buyerEmail: BUYER });

    expect(payRes.status, `confirm-payment: ${JSON.stringify(payRes.body)}`).toBe(200);
    const piId: string = payRes.body.paymentIntentId;

    await stripe.paymentIntents.confirm(piId, {
      payment_method: "pm_card_visa",
      return_url: "https://safesend-test.local/return",
    });

    const webhookRes = await fireStripeWebhook("payment_intent.succeeded", {
      id: piId,
      object: "payment_intent",
      metadata: { dealId, buyerEmail: BUYER, sellerEmail: SELLER },
    });
    expect(webhookRes.status).toBe(200);

    const [funded] = await db
      .select()
      .from(dealsTable)
      .where(eq(dealsTable.id, dealId));
    expect(funded.state).toBe("funded");

    // ── Step 4: Seller ships ─────────────────────────────────────────────────
    const shipRes = await request(app)
      .post(`/api/deals/${dealId}/mark-shipped`)
      .set("Cookie", sellerCookie)
      .send({
        sellerEmail: SELLER,
        trackingNumber: "JD123456785NZ",
        courierSlug: "courier-post",
      });

    expect(shipRes.status, `mark-shipped: ${JSON.stringify(shipRes.body)}`).toBe(200);
    expect(shipRes.body.state).toBe("shipped");

    // ── Step 5: Mark delivered then release ──────────────────────────────────
    const deliverVersion = shipRes.body.version + 1;
    await db
      .update(dealsTable)
      .set({ state: "delivered", deliveredAt: new Date(), version: deliverVersion })
      .where(eq(dealsTable.id, dealId));

    const releaseRes = await request(app)
      .post(`/api/deals/${dealId}/release-funds`)
      .set("Cookie", buyerCookie)
      .send({ buyerEmail: BUYER });

    expect(releaseRes.status, `release-funds: ${JSON.stringify(releaseRes.body)}`).toBe(200);
    expect(releaseRes.body.state).toBe("complete");

    transferSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 · ROLE ENFORCEMENT — wrong party actions blocked
// ─────────────────────────────────────────────────────────────────────────────

describe("Role enforcement: wrong-party requests return 403 or 401", () => {
  const BUYER = "buyer-role@safesend-e2e.test";
  const SELLER = "seller-role@safesend-e2e.test";
  const OUTSIDER = "outsider@safesend-e2e.test";

  it("outsider cannot view a deal (returns 403 or 404)", async () => {
    // The GET /deals/:id route hides deal existence from non-participants
    // — it may return 403 (access denied) or 404 (not found) depending on
    // whether the implementation chooses information hiding.
    const deal = await seedDeal({ buyerEmail: BUYER, sellerEmail: SELLER });
    const outsiderCookie = await createSession(OUTSIDER);
    const res = await request(app)
      .get(`/api/deals/${deal.id}`)
      .set("Cookie", outsiderCookie);
    expect([403, 404]).toContain(res.status);
  });

  it("seller cannot confirm payment (buyer-only action)", async () => {
    const deal = await seedDeal({
      state: "created",
      buyerEmail: BUYER,
      sellerEmail: SELLER,
    });
    const sellerCookie = await createSession(SELLER);
    const res = await request(app)
      .post(`/api/deals/${deal.id}/confirm-payment`)
      .set("Cookie", sellerCookie)
      .send({ buyerEmail: BUYER });
    expect(res.status).toBe(403);
  });

  it("buyer cannot mark deal shipped (seller-only action)", async () => {
    const deal = await seedDeal({
      state: "funded",
      buyerEmail: BUYER,
      sellerEmail: SELLER,
    });
    const buyerCookie = await createSession(BUYER);
    const res = await request(app)
      .post(`/api/deals/${deal.id}/mark-shipped`)
      .set("Cookie", buyerCookie)
      .send({ sellerEmail: SELLER, trackingNumber: "T1", courierSlug: "nzpost" });
    expect(res.status).toBe(403);
  });

  it("seller cannot release funds (buyer-only action)", async () => {
    const deal = await seedDeal({
      state: "delivered",
      buyerEmail: BUYER,
      sellerEmail: SELLER,
    });
    const sellerCookie = await createSession(SELLER);
    const res = await request(app)
      .post(`/api/deals/${deal.id}/release-funds`)
      .set("Cookie", sellerCookie)
      .send({ buyerEmail: BUYER });
    expect(res.status).toBe(403);
  });

  it("unauthenticated request to any protected endpoint returns 401", async () => {
    const deal = await seedDeal({ buyerEmail: BUYER, sellerEmail: SELLER });
    const res = await request(app).get(`/api/deals/${deal.id}`);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5 · DISPUTE — raise and verify state
// ─────────────────────────────────────────────────────────────────────────────

describe("Dispute flow", () => {
  const BUYER = "buyer-dispute@safesend-e2e.test";
  const SELLER = "seller-dispute@safesend-e2e.test";

  it("buyer can raise a dispute on a shipped deal, emails sent to " + E2E_RECIPIENT, async () => {
    const buyerCookie = await createSession(BUYER);
    const deal = await seedDeal({
      state: "shipped",
      buyerEmail: BUYER,
      sellerEmail: SELLER,
      trackingNumber: "T999",
      courierSlug: "nzpost",
    });

    const res = await request(app)
      .post(`/api/deals/${deal.id}/dispute`)
      .set("Cookie", buyerCookie)
      .send({
        raisedByEmail: BUYER,
        reason: "Item was described as mint condition but has significant scratches",
      });

    expect(res.status).toBe(200);
    expect(res.body.state).toBe("disputed");
    expect(res.body.disputeReason).toBe(
      "Item was described as mint condition but has significant scratches",
    );
  });

  it("third party cannot raise a dispute (403)", async () => {
    const outsiderCookie = await createSession("outsider2@safesend-e2e.test");
    const deal = await seedDeal({
      state: "shipped",
      buyerEmail: BUYER,
      sellerEmail: SELLER,
      trackingNumber: "T1000",
      courierSlug: "nzpost",
    });

    const res = await request(app)
      .post(`/api/deals/${deal.id}/dispute`)
      .set("Cookie", outsiderCookie)
      .send({ raisedByEmail: "outsider2@safesend-e2e.test", reason: "Irrelevant" });

    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6 · CANCELLATION — buyer or seller can cancel, Stripe PI cancelled/refunded
// ─────────────────────────────────────────────────────────────────────────────

describe("Cancellation — Stripe PaymentIntent cancelled or refunded", () => {
  const BUYER = "buyer-cancel@safesend-e2e.test";
  const SELLER = "seller-cancel@safesend-e2e.test";

  it("cancelling a created deal with a pending PI cancels the PI in Stripe", async () => {
    const buyerCookie = await createSession(BUYER);

    const pi = await stripe.paymentIntents.create({
      amount: 10500,
      currency: "nzd",
      payment_method_types: ["card"],
    });

    const deal = await seedDeal({
      state: "created",
      buyerEmail: BUYER,
      sellerEmail: SELLER,
      stripePaymentIntentId: pi.id,
    });

    const cancelRes = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("Cookie", buyerCookie)
      .send({ requestedByEmail: BUYER, reason: "Changed my mind" });

    expect(cancelRes.status, `cancel: ${JSON.stringify(cancelRes.body)}`).toBe(200);
    expect(cancelRes.body.state).toBe("cancelled");

    // PI must be cancelled in Stripe
    const retrieved = await stripe.paymentIntents.retrieve(pi.id);
    expect(retrieved.status).toBe("canceled");
  });

  it("cancelling a funded deal (PI already succeeded) issues a Stripe refund", async () => {
    const buyerCookie = await createSession(BUYER);

    const pi = await stripe.paymentIntents.create({
      amount: 10500,
      currency: "nzd",
      payment_method: "pm_card_visa",
      payment_method_types: ["card"],
      confirm: true,
      return_url: "https://safesend-test.local/return",
    });

    const deal = await seedDeal({
      state: "funded",
      buyerEmail: BUYER,
      sellerEmail: SELLER,
      stripePaymentIntentId: pi.id,
    });

    const cancelRes = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("Cookie", buyerCookie)
      .send({ requestedByEmail: BUYER, reason: "Seller no longer has item" });

    expect(cancelRes.status, `cancel: ${JSON.stringify(cancelRes.body)}`).toBe(200);
    expect(cancelRes.body.state).toBe("cancelled");

    const refunds = await stripe.refunds.list({ payment_intent: pi.id });
    expect(refunds.data.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7 · STRIPE WEBHOOK INTEGRITY
// ─────────────────────────────────────────────────────────────────────────────

describe("Stripe webhook integrity", () => {
  it("rejects a webhook with no signature header (400)", async () => {
    const payload = JSON.stringify({ type: "payment_intent.succeeded" });
    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("Content-Type", "application/json")
      .send(Buffer.from(payload));
    expect(res.status).toBe(400);
  });

  it("rejects a webhook with a bad signature (400)", async () => {
    const payload = JSON.stringify({ type: "payment_intent.succeeded" });
    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "t=123,v1=badbadbad")
      .send(Buffer.from(payload));
    expect(res.status).toBe(400);
  });

  it("deduplicates identical webhook event IDs (idempotency)", async () => {
    const deal = await seedDeal({ state: "created" });
    // Use a FIXED event ID so both deliveries carry the same Stripe event ID.
    // The idempotency layer keys on event.id, so the second delivery must be
    // recognised as a duplicate regardless of the HMAC timestamp.
    const fixedEventId = `evt_test_${randomUUID().replace(/-/g, "").slice(0, 24)}`;

    const first = await fireStripeWebhook(
      "payment_intent.succeeded",
      {
        id: "pi_dedup_test",
        object: "payment_intent",
        metadata: { dealId: deal.id },
      },
      fixedEventId,
    );
    expect(first.status).toBe(200);

    // Re-sign with a fresh timestamp (Stripe's tolerance window is 300 s).
    // The event ID is the same — the handler must return duplicate: true.
    const second = await fireStripeWebhook(
      "payment_intent.succeeded",
      {
        id: "pi_dedup_test",
        object: "payment_intent",
        metadata: { dealId: deal.id },
      },
      fixedEventId,
    );
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
  });
});
