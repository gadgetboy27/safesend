import { randomUUID } from "crypto";

export const MAX_AMOUNT_NZD = 2500;
const FEE_RATE = 0.04;
const MIN_FEE_NZD = 5;

/**
 * KYC fee — disabled until Stripe Identity is implemented.
 * The KYC flow is stubbed in auth.ts; do not re-enable this fee
 * until identity verification is actually performed.
 */
export const KYC_THRESHOLD_NZD = Infinity;
export const KYC_FEE_NZD = 0;

export function calculateFee(amountNzd: number): {
  feeNzd: number;
  kycFeeNzd: number;
  totalNzd: number;
  requiresKyc: boolean;
} {
  const platformFee = Math.max(amountNzd * FEE_RATE, MIN_FEE_NZD);
  const requiresKyc = amountNzd >= KYC_THRESHOLD_NZD;
  const kycFeeNzd = requiresKyc ? KYC_FEE_NZD : 0;
  const totalNzd = amountNzd + platformFee + kycFeeNzd;
  return {
    feeNzd: Math.round(platformFee * 100) / 100,
    kycFeeNzd: Math.round(kycFeeNzd * 100) / 100,
    totalNzd: Math.round(totalNzd * 100) / 100,
    requiresKyc,
  };
}

export function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

export function validateAmount(amountNzd: number): string | null {
  if (amountNzd < 5) return "Amount must be at least $5 NZD";
  if (amountNzd > MAX_AMOUNT_NZD)
    return `Amount cannot exceed $${MAX_AMOUNT_NZD} NZD. For larger transactions please use Escrow.com`;
  return null;
}

export function generateDealId(): string {
  return randomUUID();
}

/**
 * Generates a human-readable contract/invoice number for dispute callbacks.
 * Format: SS-XXXXXXX (7 uppercase alphanumeric chars, confusable chars excluded).
 * Example: SS-4K7MN2P
 * Excludes: 0, O, 1, I, L to avoid confusion when read aloud or transcribed.
 */
export function generateInvoiceNumber(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 7; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `SS-${code}`;
}

/** Convert NZD to Stripe cents (integer) */
export function nzdToCents(nzd: number): number {
  return Math.round(nzd * 100);
}

// ─── Courier slug whitelist ───────────────────────────────────
// NZ-relevant couriers supported by TrackingMore / AfterShip.
// Any slug not in this list is rejected at mark-shipped time so
// tracking webhooks can be reliably matched later.
export const ALLOWED_COURIER_SLUGS = new Set([
  "nz-post",
  "nzpost",
  "courier-post",
  "aramex",
  "aramex-nz",
  "dhl",
  "dhl-express",
  "fedex",
  "ups",
  "fastway",
  "fastway-nz",
  "toll",
  "toll-nz",
  "mbe-nz",
  "skynet",
  "go-courier",
  "pack-send",
  "parcelpoint",
]);

export function validateCourierSlug(slug: string): string | null {
  if (!slug || slug.trim().length === 0) return "Courier is required";
  if (!ALLOWED_COURIER_SLUGS.has(slug.toLowerCase().trim())) {
    const allowed = [...ALLOWED_COURIER_SLUGS].join(", ");
    return `Unknown courier '${slug}'. Allowed values: ${allowed}`;
  }
  return null;
}
