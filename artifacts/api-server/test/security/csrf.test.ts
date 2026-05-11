/**
 * CSRF origin-check tests.
 *
 * The middleware in app.ts rejects state-changing requests (POST/PUT/PATCH/DELETE)
 * that carry an Origin header not in the server's allowlist.  This stops forged
 * form POSTs from sibling same-site origins (e.g. another *.replit.app app)
 * from riding the victim's session cookie.
 *
 * Strategy:
 *  - Set ALLOWED_ORIGINS to a known value so the CSRF allowlist is non-empty.
 *    The middleware re-reads env vars per-request, so this takes effect immediately.
 *    We deliberately do NOT change NODE_ENV because the CORS middleware uses a
 *    module-load-time origin list; making it "production" would cause CORS to
 *    reject requests before CSRF can run.
 *  - Requests without an Origin header always pass (server-to-server / curl).
 *  - Requests with a matching Origin always pass.
 *  - Requests with a non-matching Origin are rejected with 403.
 *
 * NOTE: These tests run with TEST_BYPASS_AUTH=1 (the default) so they don't need
 * a real session — the 403 must come from the CSRF middleware, not from requireAuth.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb } from "../helpers/app";

const SAFE_ORIGIN = "https://safesend.example.com";
const SIBLING_ORIGIN = "https://attacker.replit.app";

let savedAllowedOrigins: string | undefined;

beforeAll(() => {
  savedAllowedOrigins = process.env.ALLOWED_ORIGINS;
  // Set a non-empty allowlist so the CSRF "empty list = dev permissive" bypass
  // does not trigger. The CSRF middleware reads this per-request.
  process.env.ALLOWED_ORIGINS = SAFE_ORIGIN;
});

afterAll(() => {
  process.env.ALLOWED_ORIGINS = savedAllowedOrigins;
});

beforeEach(async () => {
  await resetDb();
});

describe("CSRF origin check — POST without Origin header", () => {
  it("allows server-to-server POST with no Origin header (curl / webhooks / backend)", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).not.toBe(403);
  });
});

describe("CSRF origin check — POST with allowed Origin", () => {
  it("allows POST from the SafeSend origin", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set("Origin", SAFE_ORIGIN);
    expect(res.status).not.toBe(403);
  });
});

describe("CSRF origin check — POST from disallowed sibling origin", () => {
  it("rejects POST from a non-allowlisted same-site sibling origin with 403", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set("Origin", SIBLING_ORIGIN);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("origin not allowed") });
  });

  it("rejects POST from an arbitrary external origin with 403", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set("Origin", "https://evil.example.com");
    expect(res.status).toBe(403);
  });
});

describe("CSRF origin check — GET requests are never blocked", () => {
  it("allows GET from a non-allowlisted origin (CSRF does not apply to GETs)", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Origin", SIBLING_ORIGIN);
    expect(res.status).not.toBe(403);
  });
});

describe("CSRF origin check — webhook routes are exempt", () => {
  it("does not apply CSRF check to /api/webhooks/* (HMAC-protected separately)", async () => {
    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("Origin", SIBLING_ORIGIN)
      .set("Content-Type", "application/json")
      .send("{}");
    expect(res.status).not.toBe(403);
  });
});

describe("CSRF origin check — deal state-change routes", () => {
  it("rejects POST /api/deals/:id/release-funds from a sibling origin", async () => {
    const res = await request(app)
      .post("/api/deals/DEAL-123456/release-funds")
      .set("Origin", SIBLING_ORIGIN)
      .send({ buyerEmail: "buyer@example.com" });
    expect(res.status).toBe(403);
  });

  it("rejects POST /api/deals/:id/dispute from a sibling origin", async () => {
    const res = await request(app)
      .post("/api/deals/DEAL-123456/dispute")
      .set("Origin", SIBLING_ORIGIN)
      .send({ raisedByEmail: "buyer@example.com", reason: "forged" });
    expect(res.status).toBe(403);
  });

  it("rejects POST /api/deals/:id/cancel from a sibling origin", async () => {
    const res = await request(app)
      .post("/api/deals/DEAL-123456/cancel")
      .set("Origin", SIBLING_ORIGIN)
      .send({ requestedByEmail: "buyer@example.com" });
    expect(res.status).toBe(403);
  });

  it("rejects POST /api/seller/onboard from a sibling origin", async () => {
    const res = await request(app)
      .post("/api/seller/onboard")
      .set("Origin", SIBLING_ORIGIN)
      .send({ email: "seller@example.com", returnUrl: "https://x.com", refreshUrl: "https://x.com" });
    expect(res.status).toBe(403);
  });
});

describe("CSRF origin check — admin routes", () => {
  it("rejects POST /api/admin/deals/:id/resolve-dispute from a sibling origin", async () => {
    const res = await request(app)
      .post("/api/admin/deals/DEAL-123456/resolve-dispute")
      .set("Origin", SIBLING_ORIGIN)
      .send({ resolution: "refund_buyer" });
    expect(res.status).toBe(403);
  });
});
