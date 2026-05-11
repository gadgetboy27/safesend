import { describe, expect, it } from "vitest";
import {
  calculateFee,
  validateAmount,
  generateDealId,
  nzdToCents,
  MAX_AMOUNT_NZD,
  KYC_THRESHOLD_NZD,
  KYC_FEE_NZD,
} from "../../src/lib/deal-helpers";

describe("calculateFee", () => {
  it("applies 4% platform fee with no KYC fee (KYC disabled)", () => {
    const { feeNzd, kycFeeNzd, totalNzd, requiresKyc } = calculateFee(400);
    expect(feeNzd).toBe(16);
    expect(kycFeeNzd).toBe(0);
    expect(requiresKyc).toBe(false);
    expect(totalNzd).toBe(416);
  });

  it("no KYC fee at $500 (KYC disabled until Stripe Identity implemented)", () => {
    const { feeNzd, kycFeeNzd, totalNzd, requiresKyc } = calculateFee(500);
    expect(feeNzd).toBe(20);
    expect(kycFeeNzd).toBe(0); // KYC disabled
    expect(requiresKyc).toBe(false); // KYC disabled
    expect(totalNzd).toBe(520); // 500 + 20, no KYC surcharge
  });

  it("applies $5 minimum below the rate-equals-min threshold", () => {
    // 4% of $125 = $5 exactly — at the boundary
    expect(calculateFee(125).feeNzd).toBe(5);
    // Below the threshold, $5 minimum kicks in
    expect(calculateFee(100).feeNzd).toBe(5);
    expect(calculateFee(50).feeNzd).toBe(5);
    expect(calculateFee(1).feeNzd).toBe(5);
  });

  it("rounds fees to 2 decimal places", () => {
    // 4% of $123.45 = $4.938 → must round, then floored to $5 minimum
    expect(calculateFee(123.45).feeNzd).toBe(5);
    // 4% of $200.10 = $8.004 → rounds to $8.00
    expect(calculateFee(200.1).feeNzd).toBe(8);
  });

  it("computes total = amount + platformFee (no KYC) correctly", () => {
    expect(calculateFee(100).totalNzd).toBe(105); // 100 + 5 min, no KYC
    expect(calculateFee(1000).totalNzd).toBe(1040); // 1000 + 40, no KYC
    expect(calculateFee(2500).totalNzd).toBe(2600); // max deal: 2500 + 100, no KYC
  });

  it("at the maximum allowed amount, fee is $100 and KYC fee is 0 (disabled)", () => {
    const { feeNzd, kycFeeNzd, totalNzd, requiresKyc } = calculateFee(2500);
    expect(feeNzd).toBe(100);
    expect(kycFeeNzd).toBe(0);
    expect(requiresKyc).toBe(false);
    expect(totalNzd).toBe(2600);
  });

  it("KYC_FEE_NZD is 0 and KYC_THRESHOLD_NZD is Infinity (sanity)", () => {
    expect(KYC_FEE_NZD).toBe(0);
    expect(KYC_THRESHOLD_NZD).toBe(Infinity);
  });

  it("requiresKyc is always false with threshold=Infinity", () => {
    for (const amount of [1, 50, 500, 1000, 2500]) {
      expect(calculateFee(amount).requiresKyc).toBe(false);
    }
  });

  it("never produces NaN or negative", () => {
    for (const amount of [1, 50, 100, 125, 499, 500, 1000, 2500]) {
      const { feeNzd, kycFeeNzd, totalNzd } = calculateFee(amount);
      expect(feeNzd).toBeGreaterThanOrEqual(5);
      expect(kycFeeNzd).toBeGreaterThanOrEqual(0);
      expect(totalNzd).toBeGreaterThan(amount);
      expect(Number.isFinite(feeNzd)).toBe(true);
      expect(Number.isFinite(kycFeeNzd)).toBe(true);
      expect(Number.isFinite(totalNzd)).toBe(true);
    }
  });
});

describe("validateAmount", () => {
  it("accepts valid amounts within range", () => {
    expect(validateAmount(5)).toBeNull();
    expect(validateAmount(500)).toBeNull();
    expect(validateAmount(2500)).toBeNull();
  });
  it("rejects below minimum", () => {
    expect(validateAmount(0)).toMatch(/at least \$5/);
    expect(validateAmount(0.5)).toMatch(/at least \$5/);
    expect(validateAmount(-100)).toMatch(/at least \$5/);
    expect(validateAmount(4.99)).toMatch(/at least \$5/);
  });
  it("rejects above the cap and mentions Escrow.com fallback", () => {
    expect(validateAmount(2501)).toMatch(/exceed.*\$2500/);
    expect(validateAmount(2501)).toMatch(/Escrow\.com/);
    expect(validateAmount(10000)).toMatch(/Escrow\.com/);
  });
  it("MAX_AMOUNT_NZD is 2500 (sanity)", () => {
    expect(MAX_AMOUNT_NZD).toBe(2500);
  });
});

describe("nzdToCents", () => {
  it("converts whole dollars correctly", () => {
    expect(nzdToCents(1)).toBe(100);
    expect(nzdToCents(100)).toBe(10000);
    expect(nzdToCents(2500)).toBe(250000);
  });
  it("handles cents precision (no floating-point drift)", () => {
    // Classic JS gotcha: 0.1 + 0.2 = 0.30000000000000004
    expect(nzdToCents(0.1 + 0.2)).toBe(30);
    // Real dollar-and-cents amounts
    expect(nzdToCents(19.99)).toBe(1999);
    expect(nzdToCents(123.45)).toBe(12345);
    expect(nzdToCents(0.01)).toBe(1);
  });
  it("returns integer Stripe cents (no fractional cents)", () => {
    for (const nzd of [1, 9.99, 123.456, 2500]) {
      const cents = nzdToCents(nzd);
      expect(Number.isInteger(cents)).toBe(true);
    }
  });
});

describe("generateDealId", () => {
  it("returns a UUID-shaped string", () => {
    const id = generateDealId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
  it("returns unique values across many calls", () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i++) ids.add(generateDealId());
    expect(ids.size).toBe(1000);
  });
});
