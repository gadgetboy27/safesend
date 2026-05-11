/**
 * Concurrency tests for the optimistic-lock pattern.
 *
 * The whole point of the version column is: if two requests try to
 * mutate the same deal simultaneously, ONE succeeds and the OTHER fails.
 * Without these tests, "we have a version column" is just decoration.
 *
 * Each test launches multiple parallel HTTP requests against the same deal
 * and asserts that exactly one wins.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app, resetDb, db, dealsTable } from "../helpers/app";
import { seedDeal } from "../helpers/db";
import { eq } from "drizzle-orm";
import { stripe } from "../../src/lib/stripe";

beforeEach(async () => {
  await resetDb();
});

describe("optimistic concurrency on deal mutations", () => {
  it("two simultaneous mark-shipped: exactly one succeeds", async () => {
    const deal = await seedDeal({ state: "funded", version: 0 });

    const tries = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        request(app)
          .post(`/api/deals/${deal.id}/mark-shipped`)
          .set("x-test-email", deal.sellerEmail)
          .send({ sellerEmail: deal.sellerEmail, trackingNumber: "T-conc", courierSlug: "nzpost" }),
      ),
    );

    const successes = tries.filter((r) => r.status === 200);
    const failures = tries.filter((r) => r.status >= 400);

    // Exactly one should win — the rest should fail with 400 ("can't mark
    // shipped from 'shipped' state") OR 500 ("Concurrent modification") OR 409.
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(4);

    // Final state must be 'shipped' with version exactly 1 (not 5)
    const [final] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(final.state).toBe("shipped");
    expect(final.version).toBe(1);
  });

  it("simultaneous dispute + cancel from a funded deal: exactly one wins", async () => {
    const deal = await seedDeal({ state: "funded", version: 0 });

    const [disp, canc] = await Promise.all([
      request(app)
        .post(`/api/deals/${deal.id}/dispute`)
        .set("x-test-email", deal.buyerEmail)
        .send({ raisedByEmail: deal.buyerEmail, reason: "Unhappy" }),
      request(app)
        .post(`/api/deals/${deal.id}/cancel`)
        .set("x-test-email", deal.buyerEmail)
        .send({ requestedByEmail: deal.buyerEmail, reason: "Changed mind" }),
    ]);

    const codes = [disp.status, canc.status].sort();
    // One 200, one error (400 or 500). Both 200 means concurrency is broken.
    expect(codes[0]).toBe(200);
    expect(codes[1]).toBeGreaterThanOrEqual(400);

    const [final] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    // Final state is whichever won — but version must be exactly 1
    expect(final.version).toBe(1);
    expect(["disputed", "cancelled"]).toContain(final.state);
  });

  it("dozens of parallel state mutations don't corrupt the version counter", async () => {
    const deal = await seedDeal({ state: "funded", version: 0 });

    // Hammer with 20 parallel mark-shipped + 20 parallel cancel
    const reqs: Promise<request.Response>[] = [];
    for (let i = 0; i < 20; i++) {
      reqs.push(
        request(app)
          .post(`/api/deals/${deal.id}/mark-shipped`)
          .set("x-test-email", deal.sellerEmail)
          .send({ sellerEmail: deal.sellerEmail, trackingNumber: `T${i}`, courierSlug: "nzpost" }),
      );
      reqs.push(
        request(app)
          .post(`/api/deals/${deal.id}/cancel`)
          .set("x-test-email", deal.buyerEmail)
          .send({ requestedByEmail: deal.buyerEmail }),
      );
    }
    const results = await Promise.all(reqs);
    const successes = results.filter((r) => r.status === 200);

    // Exactly ONE of these 40 should have succeeded
    expect(successes.length).toBe(1);

    const [final] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(final.version).toBe(1);
  });
});

// ─── Concurrent PaymentIntent creation ───────────────────────
// Regression tests for the payment state integrity fix:
// parallel confirm-payment calls must not create multiple live PaymentIntents.

describe("concurrent confirm-payment: only one PaymentIntent is stored", () => {
  it("parallel confirm-payment calls result in exactly one stored PaymentIntent ID", async () => {
    const deal = await seedDeal({ state: "created", stripePaymentIntentId: null });

    // Track every PaymentIntent Stripe creates
    const createdPiIds: string[] = [];
    let callCount = 0;

    vi.spyOn(stripe.paymentIntents, "create").mockImplementation(async () => {
      callCount++;
      const piId = `pi_concurrent_${callCount}`;
      createdPiIds.push(piId);
      return { id: piId, client_secret: `${piId}_secret`, status: "requires_payment_method" } as never;
    });

    // Cancel spy: record which PIs get cancelled (the duplicates)
    const cancelledPiIds: string[] = [];
    vi.spyOn(stripe.paymentIntents, "cancel").mockImplementation(async (piId: string) => {
      cancelledPiIds.push(piId);
      return { id: piId, status: "canceled" } as never;
    });

    // Retrieve spy: return a valid PI for the stored one
    vi.spyOn(stripe.paymentIntents, "retrieve").mockImplementation(async (piId: string) => {
      return { id: piId, client_secret: `${piId}_secret`, status: "requires_payment_method" } as never;
    });

    // Fire 5 parallel confirm-payment requests (auth bypass via x-test-email)
    const responses = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        request(app)
          .post(`/api/deals/${deal.id}/confirm-payment`)
          .set("x-test-email", deal.buyerEmail)
          .send({ buyerEmail: deal.buyerEmail }),
      ),
    );

    // All requests must return a client secret (200)
    const successes = responses.filter((r) => r.status === 200);
    expect(successes.length).toBe(5);

    // All successful responses must return the SAME paymentIntentId
    const returnedIds = new Set(successes.map((r) => r.body.paymentIntentId));
    expect(returnedIds.size).toBe(1);

    // The database must store exactly one PaymentIntent ID
    const [final] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
    expect(final.stripePaymentIntentId).toBeDefined();
    expect(final.stripePaymentIntentId).toBe([...returnedIds][0]);

    vi.restoreAllMocks();
  });
});
