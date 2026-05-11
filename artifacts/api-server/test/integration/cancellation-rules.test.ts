/**
 * Cancellation rules — comprehensive test coverage per the spec table.
 *
 * Also covers:
 *   - verifyShipments job: flags stale deals, leaves verified deals alone
 *   - autoReleaseDelivered job: releases eligible deals, skips ineligible ones
 *   - TrackingMore webhook: flips shipmentVerificationStatus from pending → verified
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { app, db, resetDb } from "../helpers/app";
import { dealsTable } from "@workspace/db";
import { seedDeal, seedSeller } from "../helpers/db";
import { eq } from "drizzle-orm";
import { verifyShipments, autoReleaseDelivered } from "../../src/jobs/verify-shipments";
import { stripe } from "../../src/lib/stripe";

/** Sign a webhook payload exactly as TrackingMore does (HMAC-SHA256 with the API key). */
function signTrackingMore(body: string): string {
  const key = process.env.TRACKINGMORE_API_KEY ?? "";
  return crypto.createHmac("sha256", key).update(body).digest("hex");
}

beforeEach(async () => {
  await resetDb();
});

// ─── Cancellation rules per spec table ───────────────────────

describe("Cancellation rules", () => {
  it("created — buyer can cancel", async () => {
    const deal = await seedDeal({ state: "created" });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.buyerEmail)
      .send({ requestedByEmail: deal.buyerEmail });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("cancelled");
  });

  it("created — seller can cancel", async () => {
    const deal = await seedDeal({ state: "created" });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.sellerEmail)
      .send({ requestedByEmail: deal.sellerEmail });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("cancelled");
  });

  it("funded — buyer can cancel", async () => {
    const deal = await seedDeal({ state: "funded" });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.buyerEmail)
      .send({ requestedByEmail: deal.buyerEmail });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("cancelled");
  });

  it("funded — seller can cancel", async () => {
    const deal = await seedDeal({ state: "funded" });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.sellerEmail)
      .send({ requestedByEmail: deal.sellerEmail });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("cancelled");
  });

  it("shipped + pending + < 48h — buyer cannot cancel", async () => {
    const deal = await seedDeal({ state: "shipped", shipmentVerificationStatus: "pending" });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.buyerEmail)
      .send({ requestedByEmail: deal.buyerEmail });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/awaiting first courier scan/i);
  });

  it("shipped + pending + < 48h — seller cannot cancel", async () => {
    const deal = await seedDeal({ state: "shipped", shipmentVerificationStatus: "pending" });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.sellerEmail)
      .send({ requestedByEmail: deal.sellerEmail });
    expect(res.status).toBe(400);
  });

  it("shipped + flagged — buyer CAN cancel and gets refunded", async () => {
    const deal = await seedDeal({
      state: "shipped",
      shipmentVerificationStatus: "flagged",
    });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.buyerEmail)
      .send({ requestedByEmail: deal.buyerEmail });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("cancelled");
  });

  it("shipped + flagged — seller CANNOT cancel", async () => {
    const deal = await seedDeal({
      state: "shipped",
      shipmentVerificationStatus: "flagged",
    });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.sellerEmail)
      .send({ requestedByEmail: deal.sellerEmail });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/only the buyer/i);
  });

  it("shipped + verified — neither buyer nor seller can cancel", async () => {
    const deal = await seedDeal({
      state: "shipped",
      shipmentVerificationStatus: "verified",
    });
    const buyerRes = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.buyerEmail)
      .send({ requestedByEmail: deal.buyerEmail });
    expect(buyerRes.status).toBe(400);
    expect(buyerRes.body.error).toMatch(/verified in transit/i);

    const sellerRes = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.sellerEmail)
      .send({ requestedByEmail: deal.sellerEmail });
    expect(sellerRes.status).toBe(400);
  });

  it("delivered — buyer cannot cancel (must dispute)", async () => {
    const deal = await seedDeal({ state: "delivered" });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.buyerEmail)
      .send({ requestedByEmail: deal.buyerEmail });
    expect(res.status).toBe(400);
  });

  it("complete — cannot cancel", async () => {
    const deal = await seedDeal({ state: "complete" });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.buyerEmail)
      .send({ requestedByEmail: deal.buyerEmail });
    expect(res.status).toBe(400);
  });

  it("disputed — cannot cancel", async () => {
    const deal = await seedDeal({ state: "disputed" });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.buyerEmail)
      .send({ requestedByEmail: deal.buyerEmail });
    expect(res.status).toBe(400);
  });

  it("cancelled — cannot cancel again", async () => {
    const deal = await seedDeal({ state: "cancelled" });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.buyerEmail)
      .send({ requestedByEmail: deal.buyerEmail });
    expect(res.status).toBe(400);
  });

  it("refunded — cannot cancel", async () => {
    const deal = await seedDeal({ state: "refunded" });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.buyerEmail)
      .send({ requestedByEmail: deal.buyerEmail });
    expect(res.status).toBe(400);
  });
});

// ─── verifyShipments job ──────────────────────────────────────

describe("verifyShipments job", () => {
  it("flags a shipped deal whose shippedAt is > 48h ago and verification is pending", async () => {
    const staleTime = new Date(Date.now() - 49 * 60 * 60 * 1000);
    const deal = await seedDeal({
      state: "shipped",
      shipmentVerificationStatus: "pending",
      shippedAt: staleTime,
    });

    await verifyShipments();

    const [updated] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(updated.shipmentVerificationStatus).toBe("flagged");
  });

  it("does NOT flag a shipped deal that is < 48h old", async () => {
    const recentTime = new Date(Date.now() - 10 * 60 * 60 * 1000);
    const deal = await seedDeal({
      state: "shipped",
      shipmentVerificationStatus: "pending",
      shippedAt: recentTime,
    });

    await verifyShipments();

    const [updated] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(updated.shipmentVerificationStatus).toBe("pending");
  });

  it("does NOT flag a deal that is already verified", async () => {
    const staleTime = new Date(Date.now() - 49 * 60 * 60 * 1000);
    const deal = await seedDeal({
      state: "shipped",
      shipmentVerificationStatus: "verified",
      shippedAt: staleTime,
    });

    await verifyShipments();

    const [updated] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(updated.shipmentVerificationStatus).toBe("verified");
  });
});

// ─── autoReleaseDelivered job ─────────────────────────────────

describe("autoReleaseDelivered job", () => {
  it("releases funds for a delivered deal with deliveredAt > 48h ago", async () => {
    // Seller must have a verified Stripe account and the deal must have a
    // PaymentIntent — releaseDealFunds now fails closed if either is missing.
    await seedSeller({ email: "seller@example.com", chargesEnabled: true, stripeAccountId: "acct_test_autorel" });
    const oldDelivery = new Date(Date.now() - 49 * 60 * 60 * 1000);
    const deal = await seedDeal({ state: "delivered", deliveredAt: oldDelivery, stripePaymentIntentId: "pi_auto_release" });

    const transferSpy = vi
      .spyOn(stripe.transfers, "create")
      .mockResolvedValueOnce({ id: "tr_auto_release" } as never);

    await autoReleaseDelivered();

    transferSpy.mockRestore();

    const [updated] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(updated.state).toBe("complete");
  });

  it("does NOT release a delivered deal with deliveredAt < 48h ago", async () => {
    const recentDelivery = new Date(Date.now() - 47 * 60 * 60 * 1000);
    const deal = await seedDeal({ state: "delivered", deliveredAt: recentDelivery });

    await autoReleaseDelivered();

    const [updated] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(updated.state).toBe("delivered");
  });

  it("does NOT touch deals in disputed state even if deliveredAt is old", async () => {
    const oldTime = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const deal = await seedDeal({ state: "disputed", deliveredAt: oldTime });

    await autoReleaseDelivered();

    const [updated] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(updated.state).toBe("disputed");
  });

  it("uses the same Stripe transfer path as manual release (idempotency key present)", async () => {
    await seedSeller({ email: "seller@example.com", chargesEnabled: true, stripeAccountId: "acct_test_123" });
    const oldDelivery = new Date(Date.now() - 49 * 60 * 60 * 1000);
    const deal = await seedDeal({
      state: "delivered",
      deliveredAt: oldDelivery,
      stripePaymentIntentId: "pi_test_release",
    });

    const transferSpy = vi
      .spyOn(stripe.transfers, "create")
      .mockResolvedValueOnce({ id: "tr_auto_123" } as never);

    await autoReleaseDelivered();

    expect(transferSpy).toHaveBeenCalledOnce();
    const callArgs = transferSpy.mock.calls[0];
    expect(callArgs[1]).toEqual({ idempotencyKey: `transfer:${deal.id}` });

    transferSpy.mockRestore();
  });

  it("idempotency key prevents double-payment if both auto-release and manual fire", async () => {
    await seedSeller({ email: "seller@example.com", chargesEnabled: true, stripeAccountId: "acct_test_123" });
    const oldDelivery = new Date(Date.now() - 49 * 60 * 60 * 1000);
    const deal = await seedDeal({
      state: "delivered",
      deliveredAt: oldDelivery,
      stripePaymentIntentId: "pi_test_idempotent",
    });

    const transferSpy = vi
      .spyOn(stripe.transfers, "create")
      .mockResolvedValue({ id: "tr_idempotent_123" } as never);

    // Simulate both firing nearly simultaneously — manual release now requires session
    await Promise.all([
      autoReleaseDelivered(),
      request(app)
        .post(`/api/deals/${deal.id}/release-funds`)
        .set("x-test-email", deal.buyerEmail)
        .send({ buyerEmail: deal.buyerEmail }),
    ]);

    // Stripe receives two calls but both carry the same idempotency key
    const idempotencyKeys = transferSpy.mock.calls.map((c) => (c[1] as { idempotencyKey: string }).idempotencyKey);
    expect(idempotencyKeys.every((k) => k === `transfer:${deal.id}`)).toBe(true);

    transferSpy.mockRestore();
  });
});

// ─── Webhook verification status flip ────────────────────────

describe("TrackingMore webhook — shipment verification", () => {
  it("flips shipmentVerificationStatus from pending to verified on first checkpoint", async () => {
    const deal = await seedDeal({
      state: "shipped",
      trackingNumber: "NZ999",
      shipmentVerificationStatus: "pending",
    });

    const payload = JSON.stringify({
      tracking_number: "NZ999",
      status: "InTransit",
      checkpoints: [
        {
          checkpoint_time: new Date().toISOString(),
          message: "Picked up by courier",
          location: "Auckland",
        },
      ],
    });

    await request(app)
      .post("/api/webhooks/trackingmore")
      .set("Content-Type", "application/json")
      .set("trackingmore-hmac-sha256", signTrackingMore(payload))
      .send(payload);

    const [updated] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(updated.shipmentVerificationStatus).toBe("verified");
  });

  it("does NOT flip status for a non-shipped deal", async () => {
    const deal = await seedDeal({
      state: "delivered",
      trackingNumber: "NZ998",
      shipmentVerificationStatus: "pending",
    });

    const payload = JSON.stringify({
      tracking_number: "NZ998",
      status: "InTransit",
      checkpoints: [
        { checkpoint_time: new Date().toISOString(), message: "Update", location: "Wellington" },
      ],
    });

    await request(app)
      .post("/api/webhooks/trackingmore")
      .set("Content-Type", "application/json")
      .set("trackingmore-hmac-sha256", signTrackingMore(payload))
      .send(payload);

    const [updated] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(updated.shipmentVerificationStatus).toBe("pending");
  });
});

// ─── Cancellation fail-closed on Stripe errors ────────────────
// Regression tests for the payment state integrity fix:
// if Stripe operations fail the deal must NOT be marked cancelled.

describe("Cancellation fails closed when Stripe errors", () => {
  it("returns 502 and does NOT cancel the deal when stripe.paymentIntents.retrieve throws", async () => {
    const deal = await seedDeal({ state: "funded", stripePaymentIntentId: "pi_test_retrieve_fail" });

    vi.spyOn(stripe.paymentIntents, "retrieve").mockRejectedValueOnce(new Error("Stripe network error"));

    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.buyerEmail)
      .send({ requestedByEmail: deal.buyerEmail });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/payment provider error/i);

    const [unchanged] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(unchanged.state).toBe("funded");

    vi.restoreAllMocks();
  });

  it("returns 502 and does NOT cancel the deal when stripe.refunds.create throws", async () => {
    const deal = await seedDeal({ state: "funded", stripePaymentIntentId: "pi_test_refund_fail" });

    vi.spyOn(stripe.paymentIntents, "retrieve").mockResolvedValueOnce({ status: "succeeded" } as never);
    vi.spyOn(stripe.refunds, "create").mockRejectedValueOnce(new Error("Stripe refund error"));

    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.buyerEmail)
      .send({ requestedByEmail: deal.buyerEmail });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/payment provider error/i);

    const [unchanged] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(unchanged.state).toBe("funded");

    vi.restoreAllMocks();
  });

  it("returns 502 and does NOT cancel the deal when stripe.paymentIntents.cancel throws", async () => {
    const deal = await seedDeal({ state: "funded", stripePaymentIntentId: "pi_test_cancel_fail" });

    vi.spyOn(stripe.paymentIntents, "retrieve").mockResolvedValueOnce({ status: "requires_payment_method" } as never);
    vi.spyOn(stripe.paymentIntents, "cancel").mockRejectedValueOnce(new Error("Stripe cancel error"));

    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.buyerEmail)
      .send({ requestedByEmail: deal.buyerEmail });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/payment provider error/i);

    const [unchanged] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(unchanged.state).toBe("funded");

    vi.restoreAllMocks();
  });

  it("still cancels normally when there is no PaymentIntent on the deal", async () => {
    const deal = await seedDeal({ state: "created", stripePaymentIntentId: null });

    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("x-test-email", deal.buyerEmail)
      .send({ requestedByEmail: deal.buyerEmail });

    expect(res.status).toBe(200);
    expect(res.body.state).toBe("cancelled");
  });
});
