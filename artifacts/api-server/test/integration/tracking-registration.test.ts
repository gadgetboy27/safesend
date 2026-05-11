/**
 * Integration tests for TrackingMore registration on mark-shipped.
 *
 * Verifies:
 *   1. A POST to /v4/trackings is made with the correct payload
 *   2. A non-200 TrackingMore response does NOT block the state transition
 *   3. A network error does NOT block the state transition
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app, resetDb } from "../helpers/app";
import { seedDeal } from "../helpers/db";

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  delete process.env.TRACKINGMORE_API_KEY;
  vi.unstubAllGlobals();
});

describe("TrackingMore registration on mark-shipped", () => {
  it("calls POST /v4/trackings with correct tracking_number, courier_code, and order_id", async () => {
    process.env.TRACKINGMORE_API_KEY = "test-tm-key";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "{}",
    });
    vi.stubGlobal("fetch", mockFetch);

    const deal = await seedDeal({ state: "funded" });

    await request(app)
      .post(`/api/deals/${deal.id}/mark-shipped`)
      .set("x-test-email", deal.sellerEmail)
      .send({ trackingNumber: "NZ123456789", courierSlug: "nzpost", sellerEmail: deal.sellerEmail });

    const tmCall = mockFetch.mock.calls.find(
      (call) =>
        typeof call[0] === "string" && (call[0] as string).includes("trackingmore"),
    );
    expect(tmCall).toBeTruthy();

    const body = JSON.parse((tmCall![1] as RequestInit).body as string);
    expect(body.tracking_number).toBe("NZ123456789");
    expect(body.courier_code).toBe("nzpost");
    expect(body.order_id).toBe(deal.id);
  });

  it("does NOT block state transition when TrackingMore returns a non-200 response", async () => {
    process.env.TRACKINGMORE_API_KEY = "test-tm-key";

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    }));

    const deal = await seedDeal({ state: "funded" });

    const res = await request(app)
      .post(`/api/deals/${deal.id}/mark-shipped`)
      .set("x-test-email", deal.sellerEmail)
      .send({ trackingNumber: "NZ123456789", courierSlug: "nzpost", sellerEmail: deal.sellerEmail });

    expect(res.status).toBe(200);
    expect(res.body.state).toBe("shipped");
  });

  it("does NOT block state transition when TrackingMore throws a network error", async () => {
    process.env.TRACKINGMORE_API_KEY = "test-tm-key";

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

    const deal = await seedDeal({ state: "funded" });

    const res = await request(app)
      .post(`/api/deals/${deal.id}/mark-shipped`)
      .set("x-test-email", deal.sellerEmail)
      .send({ trackingNumber: "NZ123456789", courierSlug: "nzpost", sellerEmail: deal.sellerEmail });

    expect(res.status).toBe(200);
    expect(res.body.state).toBe("shipped");
  });
});
