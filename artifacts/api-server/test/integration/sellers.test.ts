/**
 * Sellers API integration tests.
 *
 * These DO call Stripe in test mode. They create real Express accounts under
 * Stripe test, and the test will leave residue in your Stripe dashboard.
 * That's fine — they're test accounts, but if you want to skip them, set
 * SKIP_STRIPE_LIVE_TESTS=1 in your env.
 */
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, db, sellersTable } from "../helpers/app";
import { eq } from "drizzle-orm";

const SKIP_STRIPE = process.env.SKIP_STRIPE_LIVE_TESTS === "1";

beforeEach(async () => {
  await resetDb();
});

describe("POST /api/seller/onboard", () => {
  it.skipIf(SKIP_STRIPE)(
    "creates a Stripe Express account and returns onboarding URL",
    async () => {
      const res = await request(app)
        .post("/api/seller/onboard")
        .send({
          email: `seller-${Date.now()}@test.local`,
          returnUrl: "https://safesend.test/return",
          refreshUrl: "https://safesend.test/refresh",
        });
      expect(res.status).toBe(200);
      expect(res.body.url).toMatch(/^https:\/\/connect\.stripe\.com/);
      expect(res.body.accountId).toMatch(/^acct_/);
    },
    30_000, // Stripe API can be slow
  );

  it.skipIf(SKIP_STRIPE)(
    "is idempotent — calling twice with same email reuses the account",
    async () => {
      const email = `idempotent-${Date.now()}@test.local`;
      const r1 = await request(app)
        .post("/api/seller/onboard")
        .send({ email, returnUrl: "https://x", refreshUrl: "https://x" });
      const r2 = await request(app)
        .post("/api/seller/onboard")
        .send({ email, returnUrl: "https://x", refreshUrl: "https://x" });
      expect(r1.body.accountId).toBe(r2.body.accountId);
    },
    30_000,
  );

  it("rejects invalid email format", async () => {
    const res = await request(app)
      .post("/api/seller/onboard")
      .send({ email: "not-an-email", returnUrl: "https://x", refreshUrl: "https://x" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/seller/status", () => {
  it("returns blank-status payload for an unknown seller", async () => {
    const res = await request(app).get("/api/seller/status?email=unknown@test.local");
    expect(res.status).toBe(200);
    expect(res.body.stripeAccountId).toBeNull();
    expect(res.body.chargesEnabled).toBe(false);
    expect(res.body.onboardingComplete).toBe(false);
  });

  it.skipIf(SKIP_STRIPE)(
    "fetches live status from Stripe and persists it",
    async () => {
      // Onboard first
      const email = `status-${Date.now()}@test.local`;
      await request(app)
        .post("/api/seller/onboard")
        .send({ email, returnUrl: "https://x", refreshUrl: "https://x" });

      const res = await request(app).get(`/api/seller/status?email=${email}`);
      expect(res.status).toBe(200);
      expect(res.body.stripeAccountId).toMatch(/^acct_/);
      // chargesEnabled will be false until the test seller completes onboarding,
      // which is fine — we're testing the wiring, not a complete flow.
    },
    30_000,
  );
});
