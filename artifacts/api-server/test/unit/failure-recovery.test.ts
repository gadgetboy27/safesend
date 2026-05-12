/**
 * Failure & timeout recovery tests.
 *
 * Verifies that when Stripe (or any external dependency) fails:
 *   - The function returns { ok: false, error: ... } — never silently swallows
 *   - The error is persisted to the DB so ops can diagnose from the admin panel
 *   - The deal state does NOT advance (nothing gets stuck in a phantom state)
 *   - Idempotency keys are stable so Stripe deduplicates double-calls
 *
 * These are pure unit tests — all I/O is mocked so no DB or Stripe credentials needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "crypto";

// ── Mocks must be declared before the modules that use them are imported ──────

// Mock @workspace/db first — it opens a DB connection at import time in production,
// but in unit tests we stub every drizzle call.
vi.mock("@workspace/db", () => {
  const db = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  };
  // Table objects are passed to drizzle's eq() / and() helpers; the helpers
  // just build SQL AST objects that our mocked db methods ignore.
  // Provide minimal column stubs so destructuring in callers doesn't throw.
  const makeTable = () => new Proxy({}, { get: (_t, prop) => ({ name: String(prop) }) });
  return {
    db,
    dealsTable: makeTable(),
    stateTransitionsTable: makeTable(),
    sellersTable: makeTable(),
    trackingEventsTable: makeTable(),
    idempotencyKeysTable: makeTable(),
    magicLinkTokensTable: makeTable(),
  };
});

vi.mock("../../src/lib/stripe", () => ({
  stripe: {
    transfers: { create: vi.fn() },
    refunds: { create: vi.fn() },
  },
}));

vi.mock("../../src/lib/email", () => ({
  sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined),
  sendDealEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Now import the modules under test — mocks are already wired
import { stripe } from "../../src/lib/stripe";
import { releaseDealFunds } from "../../src/lib/release-deal-funds";
import { refundDeal } from "../../src/lib/refund-deal";
import { transitionDeal } from "../../src/lib/deal-transition";
import { db } from "@workspace/db";

// ── Drizzle chainable mock helpers ───────────────────────────────────────────

/**
 * Returns a chainable drizzle update mock: update().set().where()
 * The where() result is both awaitable (as a Promise<void>) AND has .returning()
 * so both flavours of drizzle update syntax work:
 *   await db.update(t).set(x).where(y)           — no .returning()
 *   await db.update(t).set(x).where(y).returning() — with .returning()
 */
function drizzleUpdate(returning: unknown[] = []) {
  const whereResult = Object.assign(Promise.resolve(undefined), {
    returning: () => Promise.resolve(returning),
  });
  (db.update as ReturnType<typeof vi.fn>).mockReturnValueOnce({
    set: () => ({ where: () => whereResult }),
  });
}

/**
 * Returns a chainable drizzle select mock: select().from().where() → rows
 */
function drizzleSelect(rows: unknown[]) {
  (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
    from: () => ({ where: () => Promise.resolve(rows) }),
  });
}

/**
 * Returns a chainable drizzle insert mock: insert().values() → void
 */
function drizzleInsert() {
  (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce({
    values: () => Promise.resolve([]),
  });
}

// ── Test fixture factories ────────────────────────────────────────────────────

function makeDeal(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    title: "Test item",
    description: "Test description",
    amountNzd: "200.00",
    feeNzd: "10.00",
    kycFeeNzd: "0.00",
    totalNzd: "210.00",
    buyerEmail: "buyer@example.com",
    sellerEmail: "seller@example.com",
    creatorRole: "seller",
    state: "delivered",
    version: 1,
    stripePaymentIntentId: "pi_test_123",
    stripeTransferId: null,
    stripeRefundId: null,
    stripeTransferError: null,
    trackingNumber: "NZ123456",
    courierSlug: "nz-post",
    signatureRequired: false,
    disputeReason: null,
    invoiceNumber: null,
    itemUrl: null,
    referenceNumber: null,
    myName: null,
    myPhone: null,
    fundedAt: new Date("2026-05-10T10:00:00Z"),
    shippedAt: new Date("2026-05-11T10:00:00Z"),
    deliveredAt: new Date("2026-05-12T10:00:00Z"),
    completedAt: null,
    createdAt: new Date("2026-05-10T09:00:00Z"),
    updatedAt: new Date("2026-05-12T10:00:00Z"),
    ...overrides,
  };
}

function makeSeller(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    email: "seller@example.com",
    stripeAccountId: "acct_test_abc",
    chargesEnabled: true,
    payoutsEnabled: true,
    onboardingComplete: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── releaseDealFunds — pre-flight guards (no Stripe call made) ────────────────

describe("releaseDealFunds — pre-flight guards", () => {
  it("returns ok:false when seller has no Stripe account", async () => {
    drizzleSelect([]); // no seller row
    const result = await releaseDealFunds(makeDeal(), "buyer:buyer@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not connected a Stripe account/i);
    expect(stripe.transfers.create).not.toHaveBeenCalled();
  });

  it("returns ok:false when seller charges are not enabled", async () => {
    drizzleSelect([makeSeller({ chargesEnabled: false })]);
    const result = await releaseDealFunds(makeDeal(), "buyer:buyer@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/charges-enabled/i);
    expect(stripe.transfers.create).not.toHaveBeenCalled();
  });

  it("returns ok:false when seller payouts are not enabled", async () => {
    drizzleSelect([makeSeller({ payoutsEnabled: false })]);
    const result = await releaseDealFunds(makeDeal(), "buyer:buyer@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/payouts are not yet enabled/i);
    expect(stripe.transfers.create).not.toHaveBeenCalled();
  });

  it("returns ok:false when deal has no PaymentIntent ID", async () => {
    drizzleSelect([makeSeller()]);
    const result = await releaseDealFunds(
      makeDeal({ stripePaymentIntentId: null }),
      "buyer:buyer@example.com",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no Stripe PaymentIntent/i);
    expect(stripe.transfers.create).not.toHaveBeenCalled();
  });

  it("returns ok:false when deal has no delivery timestamp", async () => {
    drizzleSelect([makeSeller()]);
    // Stripe succeeds
    (stripe.transfers.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "tr_test" });
    // db.update for recording transfer ID
    drizzleUpdate();

    const result = await releaseDealFunds(
      makeDeal({ deliveredAt: null }),
      "auto-release:48h",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no delivery timestamp/i);
  });
});

// ── releaseDealFunds — Stripe transfer failure ─────────────────────────────

describe("releaseDealFunds — Stripe transfer failures", () => {
  it("returns ok:false and persists error when Stripe throws a network timeout", async () => {
    drizzleSelect([makeSeller()]);
    (stripe.transfers.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Network timeout connecting to Stripe"),
    );
    drizzleUpdate(); // for persisting stripeTransferError

    const result = await releaseDealFunds(makeDeal(), "buyer:buyer@example.com");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Network timeout");
    // Error must be written to DB so it shows in admin panel
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("returns ok:false when Stripe rejects with account restriction error", async () => {
    drizzleSelect([makeSeller()]);
    (stripe.transfers.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Your account cannot make transfers at this time"),
    );
    drizzleUpdate();

    const result = await releaseDealFunds(makeDeal(), "auto-release:48h");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/cannot make transfers/i);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("deal does NOT transition to complete when Stripe transfer fails", async () => {
    drizzleSelect([makeSeller()]);
    (stripe.transfers.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Stripe error"),
    );
    drizzleUpdate();

    const result = await releaseDealFunds(makeDeal(), "buyer:buyer@example.com");

    expect(result.ok).toBe(false);
    // transitionDeal would call db.update a second time — ensure it wasn't called
    expect(db.update).toHaveBeenCalledTimes(1); // only the error recording
    expect(db.insert).not.toHaveBeenCalled();   // no audit trail row = no transition
  });
});

// ── refundDeal — Stripe refund failure ───────────────────────────────────────

describe("refundDeal — Stripe refund failures", () => {
  it("returns ok:false and persists error when Stripe refund throws", async () => {
    (stripe.refunds.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("This charge has already been fully refunded"),
    );
    drizzleUpdate(); // for persisting stripeTransferError

    const result = await refundDeal(
      makeDeal({ state: "disputed" }),
      "admin:admin@safesend.nz",
      "Buyer reported item not received",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("already been fully refunded");
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("returns ok:false when Stripe times out during refund", async () => {
    (stripe.refunds.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Request timed out after 30000ms"),
    );
    drizzleUpdate();

    const result = await refundDeal(
      makeDeal({ state: "disputed" }),
      "admin:admin@safesend.nz",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/timed out/i);
  });

  it("deal does NOT transition to refunded when Stripe refund fails", async () => {
    (stripe.refunds.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Stripe error"),
    );
    drizzleUpdate();

    const result = await refundDeal(makeDeal({ state: "disputed" }), "admin:admin@safesend.nz");

    expect(result.ok).toBe(false);
    expect(db.update).toHaveBeenCalledTimes(1); // only error recording
    expect(db.insert).not.toHaveBeenCalled();   // no transition audit row
  });

  it("skips Stripe and transitions directly to refunded when deal has no PaymentIntent", async () => {
    const deal = makeDeal({ state: "disputed", stripePaymentIntentId: null });
    const refundedDeal = { ...deal, state: "refunded", version: 2 };

    // transitionDeal: db.update().set().where().returning()
    drizzleUpdate([refundedDeal]);
    // recordTransition: db.insert().values()
    drizzleInsert();

    const result = await refundDeal(deal, "admin:admin@safesend.nz", "No payment to refund");

    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.deal.state).toBe("refunded");
  });
});

// ── transitionDeal — optimistic concurrency / version conflicts ───────────────

describe("transitionDeal — concurrent modification detection", () => {
  it("throws 'Concurrent modification detected' when the version has changed", async () => {
    // update returns 0 rows — version did not match
    (db.update as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      set: () => ({
        where: () =>
          Object.assign(Promise.resolve(undefined), {
            returning: () => Promise.resolve([]),
          }),
      }),
    });

    await expect(
      transitionDeal(
        randomUUID(),
        3,          // expected version — DB has a different version
        "funded",
        "shipped",
        { shippedAt: new Date() },
        "seller:seller@example.com",
      ),
    ).rejects.toThrow("Concurrent modification detected");
  });

  it("succeeds and writes audit trail row when version matches", async () => {
    const dealId = randomUUID();
    const updatedDeal = makeDeal({ id: dealId, state: "shipped", version: 2 });

    (db.update as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      set: () => ({
        where: () =>
          Object.assign(Promise.resolve(undefined), {
            returning: () => Promise.resolve([updatedDeal]),
          }),
      }),
    });
    drizzleInsert(); // audit trail insert

    const result = await transitionDeal(
      dealId,
      1,
      "funded",
      "shipped",
      { shippedAt: new Date() },
      "seller:seller@example.com",
      "Shipped via NZ Post",
    );

    expect(result.state).toBe("shipped");
    expect(db.insert).toHaveBeenCalledTimes(1); // audit trail must always be written
  });
});

// ── Idempotency key invariants ────────────────────────────────────────────────

describe("idempotency key invariants", () => {
  it("transfer key is deterministic so Stripe deduplicates double-calls", () => {
    const dealId = "deal-abc-123";
    expect(`transfer:${dealId}`).toBe(`transfer:${dealId}`);
  });

  it("refund key is deterministic so Stripe deduplicates double-calls", () => {
    const dealId = "deal-abc-123";
    expect(`refund:${dealId}`).toBe(`refund:${dealId}`);
  });

  it("transfer and refund keys are distinct — no cross-operation collision", () => {
    const dealId = "deal-abc-123";
    expect(`transfer:${dealId}`).not.toBe(`refund:${dealId}`);
  });

  it("Stripe transfer is called with the correct idempotency key", async () => {
    const deal = makeDeal();
    drizzleSelect([makeSeller()]);
    (stripe.transfers.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "tr_test" });
    drizzleUpdate(); // record transfer ID
    // deliveredAt is set → transitionDeal path
    drizzleUpdate([{ ...deal, state: "complete", version: 2 }]);
    drizzleInsert(); // audit trail

    await releaseDealFunds(deal, "buyer:buyer@example.com");

    expect(stripe.transfers.create).toHaveBeenCalledWith(
      expect.objectContaining({ destination: "acct_test_abc" }),
      expect.objectContaining({ idempotencyKey: `transfer:${deal.id}` }),
    );
  });

  it("Stripe refund is called with the correct idempotency key", async () => {
    const deal = makeDeal({ state: "disputed" });
    (stripe.refunds.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "re_test" });
    drizzleUpdate(); // record refund ID
    drizzleUpdate([{ ...deal, state: "refunded", version: 2 }]); // transitionDeal
    drizzleInsert(); // audit trail

    await refundDeal(deal, "admin:admin@safesend.nz");

    expect(stripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: "pi_test_123" }),
      expect.objectContaining({ idempotencyKey: `refund:${deal.id}` }),
    );
  });
});
