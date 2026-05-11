/**
 * Authorization tests — verifies that every deal and seller mutation:
 *   1. Returns 401 when there is no session (authentication enforced)
 *   2. Returns 403 when the session email does not match the required role
 *   3. Does NOT return 401 or 403 when the correct session is present
 *
 * These tests temporarily override TEST_BYPASS_AUTH=0 so the real requireAuth
 * middleware runs. All other suites run with TEST_BYPASS_AUTH=1 so they don't
 * need session setup.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, createSession } from "../helpers/app";
import { seedDeal } from "../helpers/db";

// ─── Enable real auth enforcement for this file only ─────────
const originalBypass = process.env.TEST_BYPASS_AUTH;
beforeAll(() => {
  process.env.TEST_BYPASS_AUTH = "0";
});
afterAll(() => {
  process.env.TEST_BYPASS_AUTH = originalBypass ?? "1";
});

beforeEach(async () => {
  await resetDb();
});

// ─── Constants ────────────────────────────────────────────────
const BUYER = "buyer@example.com";
const SELLER = "seller@example.com";
const OUTSIDER = "outsider@example.com";

// ─── confirm-payment ─────────────────────────────────────────
describe("POST /api/deals/:id/confirm-payment", () => {
  it("returns 401 with no session", async () => {
    const deal = await seedDeal({ buyerEmail: BUYER, sellerEmail: SELLER });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/confirm-payment`)
      .send({ buyerEmail: BUYER });
    expect(res.status).toBe(401);
  });

  it("returns 403 when session email is seller, not buyer", async () => {
    const deal = await seedDeal({ buyerEmail: BUYER, sellerEmail: SELLER });
    const sellerCookie = await createSession(SELLER);
    const res = await request(app)
      .post(`/api/deals/${deal.id}/confirm-payment`)
      .set("Cookie", sellerCookie)
      .send({ buyerEmail: BUYER });
    expect(res.status).toBe(403);
  });

  it("does not return 401/403 when session email matches buyer", async () => {
    const deal = await seedDeal({ buyerEmail: BUYER, sellerEmail: SELLER });
    const buyerCookie = await createSession(BUYER);
    const res = await request(app)
      .post(`/api/deals/${deal.id}/confirm-payment`)
      .set("Cookie", buyerCookie)
      .send({ buyerEmail: BUYER });
    // May be 400 (Stripe, state error, etc.) — but not 401 or 403
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ─── mark-shipped ─────────────────────────────────────────────
describe("POST /api/deals/:id/mark-shipped", () => {
  it("returns 401 with no session", async () => {
    const deal = await seedDeal({ state: "funded", buyerEmail: BUYER, sellerEmail: SELLER });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/mark-shipped`)
      .send({ sellerEmail: SELLER, trackingNumber: "NZ123456789", courierSlug: "nz-post" });
    expect(res.status).toBe(401);
  });

  it("returns 403 when session email is buyer, not seller", async () => {
    const deal = await seedDeal({ state: "funded", buyerEmail: BUYER, sellerEmail: SELLER });
    const buyerCookie = await createSession(BUYER);
    const res = await request(app)
      .post(`/api/deals/${deal.id}/mark-shipped`)
      .set("Cookie", buyerCookie)
      .send({ sellerEmail: SELLER, trackingNumber: "NZ123456789", courierSlug: "nz-post" });
    expect(res.status).toBe(403);
  });

  it("does not return 401/403 when session email matches seller", async () => {
    const deal = await seedDeal({ state: "funded", buyerEmail: BUYER, sellerEmail: SELLER });
    const sellerCookie = await createSession(SELLER);
    const res = await request(app)
      .post(`/api/deals/${deal.id}/mark-shipped`)
      .set("Cookie", sellerCookie)
      .send({ sellerEmail: SELLER, trackingNumber: "NZ123456789", courierSlug: "nz-post" });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ─── release-funds ────────────────────────────────────────────
describe("POST /api/deals/:id/release-funds", () => {
  it("returns 401 with no session", async () => {
    const deal = await seedDeal({ state: "shipped", buyerEmail: BUYER, sellerEmail: SELLER });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/release-funds`)
      .send({ buyerEmail: BUYER });
    expect(res.status).toBe(401);
  });

  it("returns 403 when session email is seller, not buyer", async () => {
    const deal = await seedDeal({ state: "shipped", buyerEmail: BUYER, sellerEmail: SELLER });
    const sellerCookie = await createSession(SELLER);
    const res = await request(app)
      .post(`/api/deals/${deal.id}/release-funds`)
      .set("Cookie", sellerCookie)
      .send({ buyerEmail: BUYER });
    expect(res.status).toBe(403);
  });

  it("does not return 401/403 when session email matches buyer", async () => {
    const deal = await seedDeal({ state: "shipped", buyerEmail: BUYER, sellerEmail: SELLER });
    const buyerCookie = await createSession(BUYER);
    const res = await request(app)
      .post(`/api/deals/${deal.id}/release-funds`)
      .set("Cookie", buyerCookie)
      .send({ buyerEmail: BUYER });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ─── dispute ─────────────────────────────────────────────────
describe("POST /api/deals/:id/dispute", () => {
  it("returns 401 with no session", async () => {
    const deal = await seedDeal({ state: "funded", buyerEmail: BUYER, sellerEmail: SELLER });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/dispute`)
      .send({ raisedByEmail: BUYER, reason: "Item was not as described — significant damage" });
    expect(res.status).toBe(401);
  });

  it("returns 403 when session email is outsider (not buyer or seller)", async () => {
    const deal = await seedDeal({ state: "funded", buyerEmail: BUYER, sellerEmail: SELLER });
    const outsiderCookie = await createSession(OUTSIDER);
    const res = await request(app)
      .post(`/api/deals/${deal.id}/dispute`)
      .set("Cookie", outsiderCookie)
      .send({ raisedByEmail: OUTSIDER, reason: "Not a participant in this deal at all" });
    expect(res.status).toBe(403);
  });

  it("does not return 401/403 when session email matches buyer", async () => {
    const deal = await seedDeal({ state: "funded", buyerEmail: BUYER, sellerEmail: SELLER });
    const buyerCookie = await createSession(BUYER);
    const res = await request(app)
      .post(`/api/deals/${deal.id}/dispute`)
      .set("Cookie", buyerCookie)
      .send({ raisedByEmail: BUYER, reason: "Item was not as described — significant damage" });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ─── cancel ──────────────────────────────────────────────────
describe("POST /api/deals/:id/cancel", () => {
  it("returns 401 with no session", async () => {
    const deal = await seedDeal({ buyerEmail: BUYER, sellerEmail: SELLER });
    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .send({ requestedByEmail: BUYER });
    expect(res.status).toBe(401);
  });

  it("returns 403 when session email is outsider (not buyer or seller)", async () => {
    const deal = await seedDeal({ buyerEmail: BUYER, sellerEmail: SELLER });
    const outsiderCookie = await createSession(OUTSIDER);
    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("Cookie", outsiderCookie)
      .send({ requestedByEmail: OUTSIDER });
    expect(res.status).toBe(403);
  });

  it("does not return 401/403 when session email matches buyer", async () => {
    const deal = await seedDeal({ buyerEmail: BUYER, sellerEmail: SELLER });
    const buyerCookie = await createSession(BUYER);
    const res = await request(app)
      .post(`/api/deals/${deal.id}/cancel`)
      .set("Cookie", buyerCookie)
      .send({ requestedByEmail: BUYER });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ─── seller/onboard ──────────────────────────────────────────
describe("POST /api/seller/onboard", () => {
  it("returns 401 with no session", async () => {
    const res = await request(app)
      .post("/api/seller/onboard")
      .send({
        email: SELLER,
        returnUrl: "https://example.com/return",
        refreshUrl: "https://example.com/refresh",
      });
    expect(res.status).toBe(401);
  });

  it("does not return 401/403 when session is present", async () => {
    const sellerCookie = await createSession(SELLER);
    const res = await request(app)
      .post("/api/seller/onboard")
      .set("Cookie", sellerCookie)
      .send({
        email: SELLER,
        returnUrl: "https://example.com/return",
        refreshUrl: "https://example.com/refresh",
      });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ─── seller/status ───────────────────────────────────────────
describe("GET /api/seller/status", () => {
  it("returns 401 with no session", async () => {
    const res = await request(app).get(`/api/seller/status?email=${SELLER}`);
    expect(res.status).toBe(401);
  });

  it("does not return 401/403 when session is present", async () => {
    const sellerCookie = await createSession(SELLER);
    const res = await request(app)
      .get(`/api/seller/status?email=${SELLER}`)
      .set("Cookie", sellerCookie);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ─── POST /api/deals ─────────────────────────────────────────
// Audit Finding 3: POST /deals had no auth — anyone could create deals
describe("POST /api/deals — create deal", () => {
  it("returns 401 with no session", async () => {
    const res = await request(app)
      .post("/api/deals")
      .send({ title: "Camera", description: "Sony A7", amountNzd: 500, buyerEmail: BUYER, sellerEmail: SELLER });
    expect(res.status).toBe(401);
  });

  it("does not return 401 when session is present", async () => {
    const cookie = await createSession(BUYER);
    const res = await request(app)
      .post("/api/deals")
      .set("Cookie", cookie)
      .send({ title: "Camera", description: "Sony A7", amountNzd: 500, buyerEmail: BUYER, sellerEmail: SELLER });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ─── GET /api/deals — list ───────────────────────────────────
// Vulnerability #1: Unauthenticated deal enumeration by email address
describe("GET /api/deals — list deals", () => {
  it("returns 401 with no session", async () => {
    const res = await request(app).get("/api/deals");
    expect(res.status).toBe(401);
  });

  it("returns 401 even when email query param is supplied", async () => {
    const res = await request(app).get(`/api/deals?email=${BUYER}`);
    expect(res.status).toBe(401);
  });

  it("only returns deals belonging to the session user, ignoring supplied email", async () => {
    // Seed a deal for BUYER and a deal for OUTSIDER
    const buyerDeal = await seedDeal({ buyerEmail: BUYER, sellerEmail: SELLER });
    await seedDeal({ buyerEmail: OUTSIDER, sellerEmail: SELLER });

    const buyerCookie = await createSession(BUYER);
    // Even if attacker passes OUTSIDER's email in the query string, server uses session
    const res = await request(app)
      .get(`/api/deals?email=${OUTSIDER}`)
      .set("Cookie", buyerCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(buyerDeal.id);
  });
});

// ─── GET /api/deals/:id — get deal ───────────────────────────
// Vulnerability #2a: Unauthenticated deal detail access (full escrow record)
describe("GET /api/deals/:id — get deal", () => {
  it("returns 401 with no session", async () => {
    const deal = await seedDeal({ buyerEmail: BUYER, sellerEmail: SELLER });
    const res = await request(app).get(`/api/deals/${deal.id}`);
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated user is not a participant (IDOR)", async () => {
    const deal = await seedDeal({ buyerEmail: BUYER, sellerEmail: SELLER });
    const outsiderCookie = await createSession(OUTSIDER);
    const res = await request(app)
      .get(`/api/deals/${deal.id}`)
      .set("Cookie", outsiderCookie);
    expect(res.status).toBe(403);
  });

  it("allows access to the buyer", async () => {
    const deal = await seedDeal({ buyerEmail: BUYER, sellerEmail: SELLER });
    const buyerCookie = await createSession(BUYER);
    const res = await request(app)
      .get(`/api/deals/${deal.id}`)
      .set("Cookie", buyerCookie);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(deal.id);
  });

  it("allows access to the seller", async () => {
    const deal = await seedDeal({ buyerEmail: BUYER, sellerEmail: SELLER });
    const sellerCookie = await createSession(SELLER);
    const res = await request(app)
      .get(`/api/deals/${deal.id}`)
      .set("Cookie", sellerCookie);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(deal.id);
  });
});

// ─── GET /api/deals/:id/tracking — get tracking ──────────────
// Vulnerability #2b: Unauthenticated tracking endpoint exposes full shipment record
describe("GET /api/deals/:id/tracking — get tracking", () => {
  it("returns 401 with no session", async () => {
    const deal = await seedDeal({ state: "shipped", buyerEmail: BUYER, sellerEmail: SELLER });
    const res = await request(app).get(`/api/deals/${deal.id}/tracking`);
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated user is not a participant (IDOR)", async () => {
    const deal = await seedDeal({ state: "shipped", buyerEmail: BUYER, sellerEmail: SELLER });
    const outsiderCookie = await createSession(OUTSIDER);
    const res = await request(app)
      .get(`/api/deals/${deal.id}/tracking`)
      .set("Cookie", outsiderCookie);
    expect(res.status).toBe(403);
  });

  it("allows the buyer to fetch tracking", async () => {
    const deal = await seedDeal({ state: "shipped", buyerEmail: BUYER, sellerEmail: SELLER });
    const buyerCookie = await createSession(BUYER);
    const res = await request(app)
      .get(`/api/deals/${deal.id}/tracking`)
      .set("Cookie", buyerCookie);
    expect(res.status).toBe(200);
  });

  it("allows the seller to fetch tracking", async () => {
    const deal = await seedDeal({ state: "shipped", buyerEmail: BUYER, sellerEmail: SELLER });
    const sellerCookie = await createSession(SELLER);
    const res = await request(app)
      .get(`/api/deals/${deal.id}/tracking`)
      .set("Cookie", sellerCookie);
    expect(res.status).toBe(200);
  });
});

// ─── GET /api/deals/:id/tracking-public — field restriction ──
// Verifies that the unauthenticated public tracking endpoint does NOT expose
// sensitive escrow, payment, or contact fields that belong to authenticated views only.
describe("GET /api/deals/:id/tracking-public — field restriction", () => {
  it("does not include sellerEmail, stripePaymentIntentId, amountNzd, feeNzd, or disputeReason", async () => {
    const deal = await seedDeal({
      state: "shipped",
      buyerEmail: BUYER,
      sellerEmail: SELLER,
    });
    // Public endpoint — no session cookie needed
    const res = await request(app).get(`/api/deals/${deal.id}/tracking-public`);
    expect(res.status).toBe(200);

    // Must NOT expose full contact or financial details
    expect(res.body).not.toHaveProperty("sellerEmail");
    expect(res.body).not.toHaveProperty("buyerEmail"); // only masked variant allowed
    expect(res.body).not.toHaveProperty("stripePaymentIntentId");
    expect(res.body).not.toHaveProperty("stripeTransferId");
    expect(res.body).not.toHaveProperty("stripeRefundId");
    expect(res.body).not.toHaveProperty("amountNzd");
    expect(res.body).not.toHaveProperty("feeNzd");
    expect(res.body).not.toHaveProperty("kycFeeNzd");
    expect(res.body).not.toHaveProperty("totalNzd");
    expect(res.body).not.toHaveProperty("disputeReason");
    expect(res.body).not.toHaveProperty("description");
    expect(res.body).not.toHaveProperty("buyerPhone");
    expect(res.body).not.toHaveProperty("sellerPhone");

    // MUST include the safe tracking fields
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("title");
    expect(res.body).toHaveProperty("state");
    expect(res.body).toHaveProperty("buyerEmailMasked"); // masked only
  });
});

// ─── Admin routes ─────────────────────────────────────────────
// Audit Finding 1: All admin routes had no auth at all
describe("GET /api/admin/deals — admin list", () => {
  it("returns 401 with no session", async () => {
    const res = await request(app).get("/api/admin/deals");
    expect(res.status).toBe(401);
  });

  it("returns 403 when session is not an admin email", async () => {
    const cookie = await createSession(BUYER);
    const savedAdmins = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "admin@safesend.nz";
    try {
      const res = await request(app).get("/api/admin/deals").set("Cookie", cookie);
      expect(res.status).toBe(403);
    } finally {
      process.env.ADMIN_EMAILS = savedAdmins;
    }
  });

  it("allows access when session email is in ADMIN_EMAILS", async () => {
    const cookie = await createSession("admin@safesend.nz");
    const savedAdmins = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "admin@safesend.nz";
    try {
      const res = await request(app).get("/api/admin/deals").set("Cookie", cookie);
      expect(res.status).toBe(200);
    } finally {
      process.env.ADMIN_EMAILS = savedAdmins;
    }
  });
});

describe("GET /api/admin/stats", () => {
  it("returns 401 with no session", async () => {
    const res = await request(app).get("/api/admin/stats");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/admin/deals/:id/resolve-dispute", () => {
  it("returns 401 with no session", async () => {
    const deal = await seedDeal({ state: "disputed" });
    const res = await request(app)
      .post(`/api/admin/deals/${deal.id}/resolve-dispute`)
      .send({ resolution: "refund_buyer" });
    expect(res.status).toBe(401);
  });

  it("returns 403 when session is not an admin email", async () => {
    const deal = await seedDeal({ state: "disputed" });
    const cookie = await createSession(BUYER);
    const savedAdmins = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "admin@safesend.nz";
    try {
      const res = await request(app)
        .post(`/api/admin/deals/${deal.id}/resolve-dispute`)
        .set("Cookie", cookie)
        .send({ resolution: "refund_buyer" });
      expect(res.status).toBe(403);
    } finally {
      process.env.ADMIN_EMAILS = savedAdmins;
    }
  });
});
