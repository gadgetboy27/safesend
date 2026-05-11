/**
 * SMS utility — outbound Twilio SMS for time-sensitive deal alerts.
 *
 * Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.
 * In their absence all SMS are no-ops logged via Pino.
 *
 * All functions are fire-and-forget: they catch their own errors.
 * A failed SMS must never prevent a deal transition from completing.
 *
 * Phone numbers are NEVER shared between parties. Each party's number
 * is used only for outbound notifications from SafeSend itself.
 */
import { logger } from "./logger";

const APP_URL = (process.env.APP_URL ?? "").replace(/\/$/, "");

async function sendSms(to: string | null | undefined, body: string): Promise<void> {
  if (!to) return;

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    logger.info({ to, body }, "No Twilio credentials — SMS skipped (dev)");
    return;
  }

  try {
    const twilioModule = await import("twilio");
    const Twilio = twilioModule.default as unknown as new (sid: string, token: string) => { messages: { create(opts: { to: string; from: string; body: string }): Promise<unknown> } };
    const client = new Twilio(sid, token);
    await client.messages.create({ to, from, body });
    logger.info({ to }, "SMS sent");
  } catch (err) {
    logger.error({ to, err }, "Failed to send SMS");
  }
}

function dealUrl(dealId: string): string {
  return `${APP_URL}/deals/${dealId}`;
}

// ── Deal-event SMS helpers ─────────────────────────────────────────────────────

/**
 * Buyer SMS when seller creates a deal — nudge to review and pay.
 */
export async function smsDealCreated(
  buyerPhone: string | null | undefined,
  dealId: string,
  title: string,
): Promise<void> {
  await sendSms(
    buyerPhone,
    `SafeSend: A deal has been created for you — "${title}". Review and pay securely: ${dealUrl(dealId)}`,
  );
}

/**
 * Seller SMS when buyer's payment clears — ship now.
 */
export async function smsDealFunded(
  sellerPhone: string | null | undefined,
  dealId: string,
  title: string,
): Promise<void> {
  await sendSms(
    sellerPhone,
    `SafeSend: Payment received for "${title}" — funds are secured. Ship now and add your tracking number: ${dealUrl(dealId)}`,
  );
}

/**
 * Buyer SMS when seller marks shipped.
 */
export async function smsDealShipped(
  buyerPhone: string | null | undefined,
  dealId: string,
  title: string,
): Promise<void> {
  await sendSms(
    buyerPhone,
    `SafeSend: "${title}" has been shipped — track your delivery here: ${dealUrl(dealId)}`,
  );
}

/**
 * Buyer SMS when courier confirms delivery — 48h window reminder.
 */
export async function smsDealDelivered(
  buyerPhone: string | null | undefined,
  dealId: string,
  title: string,
): Promise<void> {
  await sendSms(
    buyerPhone,
    `SafeSend: "${title}" has been delivered! Please confirm receipt or raise a dispute within 48 hours — after that funds auto-release: ${dealUrl(dealId)}`,
  );
}

/**
 * Both-party SMS when a dispute is raised — action required immediately.
 */
export async function smsDealDisputed(
  sellerPhone: string | null | undefined,
  buyerPhone: string | null | undefined,
  dealId: string,
  title: string,
): Promise<void> {
  const msg = `SafeSend: A dispute has been raised on "${title}" — funds are frozen. Review your deal: ${dealUrl(dealId)}`;
  await Promise.all([sendSms(sellerPhone, msg), sendSms(buyerPhone, msg)]);
}
