/**
 * Webhook signature validation tests.
 *
 * These tests prove that:
 *   1. The Stripe webhook rejects requests without a signature header.
 *   2. The Stripe webhook rejects forged signatures (uses a fake secret).
 *   3. The TrackingMore webhook rejects forged HMACs.
 *   4. Both webhooks accept correctly-signed payloads.
 *   5. Idempotency: the same valid Stripe event delivered twice is processed once.
 *
 * If any of these fail, an attacker can spoof "payment succeeded" or
 * "delivered" events and money will move incorrectly.
 *
 * IMPORTANT: needs the `app` helper. Skip with `it.skip` if the test DB
 * isn't set up yet.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import crypto from "crypto";
import Stripe from "stripe";
import { app, resetDb, db, dealsTable } from "../helpers/app";
import { seedDeal } from "../helpers/db";
import { eq } from "drizzle-orm";

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
const TRACKINGMORE_API_KEY = process.env.TRACKINGMORE_API_KEY ?? "test_key";

/**
 * Build a valid Stripe webhook signature for a payload.
 * Mirrors what Stripe's library does internally so we can prove our endpoint
 * accepts a real signature and rejects a wrong one.
 */
function stripeSignature(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const signedPayload = `${timestamp}.${payload}`;
  const sig = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

describe("POST /api/webhooks/stripe — signature validation", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("rejects requests with no stripe-signature header (400)", async () => {
    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("Content-Type", "application/json")
      .send(Buffer.from(JSON.stringify({ id: "evt_test", type: "payment_intent.succeeded" })));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing stripe-signature/i);
  });

  it("rejects forged signatures from a wrong secret (400)", async () => {
    const payload = JSON.stringify({ id: "evt_test_fake", type: "payment_intent.succeeded" });
    const forgedSig = stripeSignature(payload, "this_is_not_the_real_secret");
    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("Stripe-Signature", forgedSig)
      .set("Content-Type", "application/json")
      .send(Buffer.from(payload));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Webhook error/i);
  });

  it("accepts a correctly-signed event and funds the matching deal", async () => {
    const deal = await seedDeal({ state: "created" });

    const event = {
      id: `evt_test_${Date.now()}`,
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_test_real",
          metadata: { dealId: deal.id, buyerEmail: deal.buyerEmail, sellerEmail: deal.sellerEmail },
        },
      },
    };
    const payload = JSON.stringify(event);
    const sig = stripeSignature(payload, STRIPE_WEBHOOK_SECRET);

    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("Stripe-Signature", sig)
      .set("Content-Type", "application/json")
      .send(Buffer.from(payload));

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    // Deal should have advanced to funded
    const [updated] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(updated.state).toBe("funded");
    expect(updated.stripePaymentIntentId).toBe("pi_test_real");
    expect(updated.fundedAt).not.toBeNull();
  });

  it("ignores duplicate events (idempotency table prevents double processing)", async () => {
    const deal = await seedDeal({ state: "created" });

    const event = {
      id: `evt_test_dup_${Date.now()}`,
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_dup", metadata: { dealId: deal.id } } },
    };
    const payload = JSON.stringify(event);
    const sig = stripeSignature(payload, STRIPE_WEBHOOK_SECRET);

    // First delivery — should succeed and fund
    const res1 = await request(app)
      .post("/api/webhooks/stripe")
      .set("Stripe-Signature", sig)
      .set("Content-Type", "application/json")
      .send(Buffer.from(payload));
    expect(res1.status).toBe(200);
    expect(res1.body.duplicate).toBeUndefined();

    // Second delivery (Stripe retried after a network blip)
    // Need a fresh signature with a fresh timestamp, but same event id
    const sig2 = stripeSignature(payload, STRIPE_WEBHOOK_SECRET);
    const res2 = await request(app)
      .post("/api/webhooks/stripe")
      .set("Stripe-Signature", sig2)
      .set("Content-Type", "application/json")
      .send(Buffer.from(payload));
    expect(res2.status).toBe(200);
    expect(res2.body.duplicate).toBe(true);

    // Deal version should have only incremented once
    const [updated] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(updated.state).toBe("funded");
    expect(updated.version).toBe(1); // 0 → 1, NOT 0 → 1 → 2
  });

  it("does not progress a deal that is in a non-funded-eligible state", async () => {
    // A 'complete' deal must not be re-funded by a stray webhook
    const deal = await seedDeal({ state: "complete", version: 5 });

    const event = {
      id: `evt_test_invalid_state_${Date.now()}`,
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_late", metadata: { dealId: deal.id } } },
    };
    const payload = JSON.stringify(event);
    const sig = stripeSignature(payload, STRIPE_WEBHOOK_SECRET);

    await request(app)
      .post("/api/webhooks/stripe")
      .set("Stripe-Signature", sig)
      .set("Content-Type", "application/json")
      .send(Buffer.from(payload));

    const [unchanged] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(unchanged.state).toBe("complete");
    expect(unchanged.version).toBe(5);
  });
});

describe("POST /api/webhooks/trackingmore — HMAC validation", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("accepts a correctly-signed payload and advances state to delivered", async () => {
    const deal = await seedDeal({ state: "shipped", trackingNumber: "TRACK123", courierSlug: "nzpost" });

    const payload = JSON.stringify({
      tracking_number: "TRACK123",
      status: "delivered",
      signed_by: "Test Recipient",
      checkpoints: [{ checkpoint_time: new Date().toISOString(), message: "Delivered to recipient", location: "Auckland" }],
    });
    const sig = crypto.createHmac("sha256", TRACKINGMORE_API_KEY).update(payload).digest("hex");

    const res = await request(app)
      .post("/api/webhooks/trackingmore")
      .set("trackingmore-hmac-sha256", sig)
      .set("Content-Type", "application/json")
      .send(Buffer.from(payload));

    expect(res.status).toBe(200);
    const [updated] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(updated.state).toBe("delivered");
    expect(updated.deliveredAt).not.toBeNull();
  });

  it("rejects forged HMAC", async () => {
    const payload = JSON.stringify({ tracking_number: "TRACK_X", status: "delivered" });
    const forged = crypto.createHmac("sha256", "wrong_key").update(payload).digest("hex");

    const res = await request(app)
      .post("/api/webhooks/trackingmore")
      .set("trackingmore-hmac-sha256", forged)
      .set("Content-Type", "application/json")
      .send(Buffer.from(payload));

    expect(res.status).toBe(401);
  });

  it("does not advance a non-shipped deal to delivered", async () => {
    // A deal in 'created' state can't go straight to delivered — the state
    // machine should block it even if a stray webhook arrives.
    const deal = await seedDeal({ state: "created", trackingNumber: "TRACK_BAD" });

    const payload = JSON.stringify({ tracking_number: "TRACK_BAD", status: "delivered", checkpoints: [] });
    const sig = crypto.createHmac("sha256", TRACKINGMORE_API_KEY).update(payload).digest("hex");

    await request(app)
      .post("/api/webhooks/trackingmore")
      .set("trackingmore-hmac-sha256", sig)
      .set("Content-Type", "application/json")
      .send(Buffer.from(payload));

    const [unchanged] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(unchanged.state).toBe("created");
  });
});

describe("TrackingMore delivered — signatureRequired gate", () => {
  beforeEach(async () => {
    await resetDb();
  });

  function signedPayload(body: object): [string, string] {
    const raw = JSON.stringify(body);
    const sig = crypto.createHmac("sha256", TRACKINGMORE_API_KEY).update(raw).digest("hex");
    return [raw, sig];
  }

  it("blocks shipped→delivered when signatureRequired=true and signed_by is absent", async () => {
    const deal = await seedDeal({
      state: "shipped",
      trackingNumber: "SIG_TEST_1",
      signatureRequired: true,
    });
    const [raw, sig] = signedPayload({ tracking_number: "SIG_TEST_1", status: "Delivered", checkpoints: [] });

    const res = await request(app)
      .post("/api/webhooks/trackingmore")
      .set("trackingmore-hmac-sha256", sig)
      .set("Content-Type", "application/json")
      .send(Buffer.from(raw));

    expect(res.status).toBe(200);
    const [after] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(after.state).toBe("shipped");
  });

  it("advances shipped→delivered when signatureRequired=true and signed_by is present", async () => {
    const deal = await seedDeal({
      state: "shipped",
      trackingNumber: "SIG_TEST_2",
      signatureRequired: true,
    });
    const [raw, sig] = signedPayload({ tracking_number: "SIG_TEST_2", status: "Delivered", signed_by: "Jane Doe", checkpoints: [] });

    const res = await request(app)
      .post("/api/webhooks/trackingmore")
      .set("trackingmore-hmac-sha256", sig)
      .set("Content-Type", "application/json")
      .send(Buffer.from(raw));

    expect(res.status).toBe(200);
    const [after] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(after.state).toBe("delivered");
  });

  it("advances shipped→delivered when signatureRequired=false even without signed_by", async () => {
    const deal = await seedDeal({
      state: "shipped",
      trackingNumber: "SIG_TEST_3",
      signatureRequired: false,
    });
    const [raw, sig] = signedPayload({ tracking_number: "SIG_TEST_3", status: "Delivered", checkpoints: [] });

    const res = await request(app)
      .post("/api/webhooks/trackingmore")
      .set("trackingmore-hmac-sha256", sig)
      .set("Content-Type", "application/json")
      .send(Buffer.from(raw));

    expect(res.status).toBe(200);
    const [after] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(after.state).toBe("delivered");
  });
});
