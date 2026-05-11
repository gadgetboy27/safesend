/**
 * Email utility — magic-link and transactional deal notifications.
 *
 * Requires RESEND_API_KEY in production. In its absence all transactional
 * emails are no-ops logged via Pino so the dev loop works without an
 * email provider.
 *
 * Every transactional function is fire-and-forget: it catches its own
 * errors and logs them. A failed email must never prevent a deal transition
 * from completing.
 */
import { logger } from "./logger";

const FROM = process.env.EMAIL_FROM ?? "SafeSend <noreply@safesend.nz>";
const APP_URL = (
  process.env.APP_BASE_URL ??
  process.env.APP_URL ??
  ""
).replace(/\/$/, "");
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

type DealSummary = {
  id: string;
  title: string;
  amountNzd: number | string;
  totalNzd: number | string;
  buyerEmail: string;
  sellerEmail: string;
  invoiceNumber?: string | null;
};

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Fetch Resend credentials at call time.
 * Prefers the Replit connector (works in dev + prod without manual secrets).
 * Falls back to RESEND_API_KEY env var for local dev or self-managed setups.
 * Never cached — connector tokens can expire.
 */
async function getResendCredentials(): Promise<{ apiKey: string; fromEmail?: string } | null> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? `repl ${process.env.REPL_IDENTITY}`
    : process.env.WEB_REPL_RENEWAL
    ? `depl ${process.env.WEB_REPL_RENEWAL}`
    : null;

  if (hostname && xReplitToken) {
    try {
      const res = await fetch(
        `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`,
        { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } },
      );
      if (!res.ok) {
        logger.warn({ status: res.status }, "Resend connector HTTP error — falling back to RESEND_API_KEY");
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const json: any = await res.json();
        const data = json?.items?.[0];
        if (data?.settings?.api_key) {
          logger.info("Using Resend credentials from Replit connector");
          return { apiKey: data.settings.api_key, fromEmail: data.settings.from_email };
        } else {
          logger.warn(
            { itemCount: json?.items?.length ?? 0 },
            "Resend connector returned no usable api_key — falling back to RESEND_API_KEY. " +
            "Is the Resend connector installed and authorised in this Replit workspace?",
          );
        }
      }
    } catch (err) {
      logger.warn({ err }, "Resend connector fetch failed — falling back to RESEND_API_KEY");
    }
  } else if (hostname && !xReplitToken) {
    logger.warn(
      "REPLIT_CONNECTORS_HOSTNAME is set but no auth token found " +
      "(REPL_IDENTITY and WEB_REPL_RENEWAL are both absent) — falling back to RESEND_API_KEY",
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    logger.info("Using Resend API key from RESEND_API_KEY env var");
    return { apiKey };
  }

  logger.warn(
    "No Resend credentials found (no connector, no RESEND_API_KEY) — " +
    "all emails will be silently skipped. Set RESEND_API_KEY in Replit Secrets.",
  );
  return null;
}

async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
  options?: { required?: boolean },
): Promise<void> {
  const creds = await getResendCredentials();
  if (!creds) {
    const msg = "No Resend credentials configured — email cannot be sent";
    logger.warn({ to, subject }, msg);
    if (options?.required) {
      throw new Error(msg);
    }
    return;
  }
  // When E2E_EMAIL_RECIPIENT is set (e.g. during e2e tests), redirect all
  // outbound email to that address so a human can verify the full template.
  const recipient = process.env.E2E_EMAIL_RECIPIENT ?? to;
  const from = creds.fromEmail ?? FROM;
  const { Resend } = await import("resend");
  const { data, error } = await new Resend(creds.apiKey).emails.send({ from, to: recipient, subject, html });
  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
  logger.info({ to: recipient, subject, id: data?.id }, "Email sent");
}

function dealUrl(dealId: string): string {
  return `${APP_URL}/deals/${dealId}`;
}

function nzd(v: number | string): string {
  return `$${Number(v).toFixed(2)} NZD`;
}

/**
 * Escapes user-controlled strings before interpolating them into HTML bodies.
 * This prevents HTML injection / phishing via deal titles, emails, etc.
 */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Sanitizes user-controlled strings for use in email subject lines (plain text).
 * Strips CR, LF, and other ASCII control characters to prevent header injection.
 */
export function sanitizeSubject(s: string): string {
  return s.replace(/[\r\n\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, " ").trim();
}

function statusPill(label: string, colour: "green" | "amber" | "red" | "blue" | "teal"): string {
  const styles: Record<string, string> = {
    green: "background:#dcfce7;color:#15803d",
    amber: "background:#fef3c7;color:#92400e",
    red: "background:#fee2e2;color:#991b1b",
    blue: "background:#dbeafe;color:#1e40af",
    teal: "background:#ccfbf1;color:#0f766e",
  };
  return `<span style="${styles[colour]};display:inline-block;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase">${label}</span>`;
}

function btn(label: string, href: string, colour = "#0f766e"): string {
  return `
  <table cellpadding="0" cellspacing="0" style="margin:24px 0 8px 0">
    <tr>
      <td style="background:${colour};border-radius:8px">
        <a href="${href}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;letter-spacing:0.01em">${label} →</a>
      </td>
    </tr>
  </table>`;
}

function dealCard(rows: [string, string][]): string {
  const rowsHtml = rows
    .map(
      ([label, value], i) =>
        `<tr style="${i % 2 === 1 ? "background:#f8fafc" : ""}">
          <td style="padding:9px 12px;color:#64748b;font-size:13px;width:38%;border-right:1px solid #e2e8f0">${label}</td>
          <td style="padding:9px 12px;color:#0f172a;font-size:13px;font-weight:600">${value}</td>
        </tr>`,
    )
    .join("");
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;border-collapse:collapse;margin:20px 0;overflow:hidden">
    ${rowsHtml}
  </table>`;
}

function wrap(body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:32px 16px 24px">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#134e4a 0%,#0f766e 60%,#0d9488 100%);padding:24px 32px;border-radius:12px 12px 0 0">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px">SafeSend</span>
                    <span style="color:#99f6e4;font-size:11px;font-weight:600;background:rgba(255,255,255,0.15);padding:3px 10px;border-radius:20px;margin-left:8px;vertical-align:middle">SECURE ESCROW</span>
                  </td>
                  <td style="text-align:right">
                    <span style="color:rgba(255,255,255,0.5);font-size:11px">sendsafe.co.nz</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 32px;border:1px solid #e2e8f0;border-top:1px solid #f1f5f9;border-radius:0 0 12px 12px">
              <p style="color:#94a3b8;font-size:12px;margin:0 0 6px;line-height:1.6">
                SafeSend holds funds in escrow so NZ buyers and sellers can transact with confidence.
                Questions? Email <a href="mailto:hello@safesend.nz" style="color:#0d9488;text-decoration:none">hello@safesend.nz</a>
              </p>
              <p style="color:#cbd5e1;font-size:11px;margin:0;line-height:1.5">
                SafeSend · New Zealand ·
                <a href="${APP_URL}/terms" style="color:#94a3b8;text-decoration:none">Terms</a> ·
                <a href="${APP_URL}/privacy" style="color:#94a3b8;text-decoration:none">Privacy</a><br/>
                If you didn't expect this email you can safely ignore it.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Magic-link ────────────────────────────────────────────────────────────────

export async function sendMagicLinkEmail(to: string, magicLink: string): Promise<void> {
  try {
    await sendEmail(
      to,
      "Your SafeSend sign-in link",
      wrap(`
        <p style="margin:0 0 4px;font-size:13px;color:#64748b;font-weight:500;text-transform:uppercase;letter-spacing:0.06em">Sign in</p>
        <h1 style="margin:0 0 16px;font-size:26px;font-weight:800;color:#0f172a;letter-spacing:-0.5px">Your sign-in link</h1>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 8px">
          Click the button below to sign in to SafeSend. This link expires in <strong>30 minutes</strong> and can only be used once.
        </p>
        ${btn("Sign in to SafeSend", magicLink)}
        <p style="color:#94a3b8;font-size:12px;margin:20px 0 0;line-height:1.5">
          If you didn't request this, you can safely ignore it — your account is secure.<br/>
          The link will not work if forwarded to someone else.
        </p>
      `),
      { required: true },
    );
    logger.info({ to }, "Magic link email sent");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ to, err: msg }, "Failed to send magic link email");
    throw new Error(`Email delivery failed: ${msg}`);
  }
}

// ── Transactional emails — all fire-and-forget ────────────────────────────────

/**
 * Sent to the seller when a buyer creates a deal and the seller must accept.
 */
export async function sendSellerAcceptanceRequestEmail(deal: DealSummary): Promise<void> {
  try {
    await sendEmail(
      deal.sellerEmail,
      `Action required: Accept deal for "${sanitizeSubject(deal.title)}"`,
      wrap(`
        ${statusPill("Action required", "amber")}
        <h1 style="margin:12px 0 8px;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">
          A buyer wants to trade with you
        </h1>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 4px">
          <strong style="color:#0f172a">${esc(deal.buyerEmail)}</strong> has created a SafeSend escrow deal and named you as the seller.
        </p>
        ${dealCard([
          ...(deal.invoiceNumber ? [["Contract #", `<span style="font-family:monospace;font-weight:700;color:#0f766e">${esc(deal.invoiceNumber)}</span>`] as [string, string]] : []),
          ["Item", esc(deal.title)],
          ["Sale price", nzd(deal.amountNzd)],
          ["Buyer", esc(deal.buyerEmail)],
        ])}
        <p style="color:#475569;font-size:14px;line-height:1.6;margin:0">
          Review the deal terms and accept or decline. Once you accept, the buyer will be notified to pay into escrow — you won't receive any funds until delivery is confirmed.
        </p>
        ${btn("Review & Accept Deal", dealUrl(deal.id))}
        <p style="color:#94a3b8;font-size:12px;margin:16px 0 0;line-height:1.5">
          If you don't respond within 72 hours the deal will expire automatically. Declining is always free.
        </p>
      `),
    );
    logger.info({ dealId: deal.id }, "Seller acceptance request email sent");
  } catch (err) {
    logger.error({ dealId: deal.id, err }, "Failed to send seller acceptance email");
  }
}

/**
 * Sent to the buyer when the seller creates a deal (seller implicitly accepts).
 * Also sent to the seller as a confirmation.
 */
export async function sendDealCreatedEmail(deal: DealSummary): Promise<void> {
  try {
    await Promise.all([
      sendEmail(
        deal.buyerEmail,
        `Pay to secure your purchase: "${sanitizeSubject(deal.title)}"`,
        wrap(`
          ${statusPill("Payment needed", "amber")}
          <h1 style="margin:12px 0 8px;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">
            Your deal is ready — pay to lock it in
          </h1>
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 4px">
            <strong style="color:#0f172a">${esc(deal.sellerEmail)}</strong> has created a SafeSend escrow deal. Pay now to secure your purchase.
          </p>
          ${dealCard([
            ...(deal.invoiceNumber ? [["Contract #", `<span style="font-family:monospace;font-weight:700;color:#0f766e">${esc(deal.invoiceNumber)}</span>`] as [string, string]] : []),
            ["Item", esc(deal.title)],
            ["Item price", nzd(deal.amountNzd)],
            ["Total charged to you", nzd(deal.totalNzd)],
            ["Seller", esc(deal.sellerEmail)],
          ])}
          <p style="color:#475569;font-size:14px;line-height:1.6;margin:0">
            Your payment is held <strong>securely in escrow</strong> by Stripe — the seller can't touch the funds until you confirm delivery. If something goes wrong, you can raise a dispute.
          </p>
          ${btn("View Deal & Pay", dealUrl(deal.id), "#d97706")}
          <p style="color:#94a3b8;font-size:12px;margin:16px 0 0;line-height:1.5">
            Payment must be made within 7 days or the deal will expire.
          </p>
        `),
      ),
      sendEmail(
        deal.sellerEmail,
        `Deal created: "${sanitizeSubject(deal.title)}" — waiting for buyer payment`,
        wrap(`
          ${statusPill("Awaiting payment", "teal")}
          <h1 style="margin:12px 0 8px;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">
            Your escrow deal is live
          </h1>
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 4px">
            Your deal for <strong style="color:#0f172a">${esc(deal.title)}</strong> is set up. We're waiting for the buyer to pay into escrow.
          </p>
          ${dealCard([
            ["Item", esc(deal.title)],
            ["Sale price", nzd(deal.amountNzd)],
            ["You will receive", nzd(deal.amountNzd)],
            ["Buyer", esc(deal.buyerEmail)],
          ])}
          <p style="color:#475569;font-size:14px;line-height:1.6;margin:0">
            You'll get an email as soon as the buyer pays. Don't ship anything before then — funds must be confirmed in escrow first.
          </p>
          ${btn("View Deal", dealUrl(deal.id))}
        `),
      ),
    ]);
    logger.info({ dealId: deal.id }, "Deal created emails sent");
  } catch (err) {
    logger.error({ dealId: deal.id, err }, "Failed to send deal created emails");
  }
}

/**
 * Sent to the seller when the buyer's payment clears via Stripe webhook.
 */
export async function sendDealFundedEmail(deal: DealSummary): Promise<void> {
  try {
    await sendEmail(
      deal.sellerEmail,
      `Payment confirmed — ship "${sanitizeSubject(deal.title)}" now`,
      wrap(`
        ${statusPill("Payment received", "green")}
        <h1 style="margin:12px 0 8px;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">
          Funds are in escrow — ship now
        </h1>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 4px">
          The buyer has paid. Funds are held securely in escrow and will be released to you once delivery is confirmed.
        </p>
        ${dealCard([
          ...(deal.invoiceNumber ? [["Contract #", `<span style="font-family:monospace;font-weight:700;color:#0f766e">${esc(deal.invoiceNumber)}</span>`] as [string, string]] : []),
          ["Item", esc(deal.title)],
          ["You will receive", nzd(deal.amountNzd)],
          ["Buyer", esc(deal.buyerEmail)],
          ["Status", "Funds secured ✓"],
        ])}
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin:16px 0">
          <p style="margin:0;color:#15803d;font-size:14px;font-weight:600">Your next step: Ship the item</p>
          <p style="margin:6px 0 0;color:#166534;font-size:13px;line-height:1.5">
            Enter your tracking number in SafeSend so the buyer can follow delivery. Use a service with a tracking number — this is required to release funds.
          </p>
        </div>
        ${btn("Mark as Shipped", dealUrl(deal.id))}
        <p style="color:#94a3b8;font-size:12px;margin:16px 0 0;line-height:1.5">
          You have 5 business days to ship. After that the deal may be auto-refunded.
        </p>
      `),
    );
    logger.info({ dealId: deal.id }, "Deal funded email sent to seller");
  } catch (err) {
    logger.error({ dealId: deal.id, err }, "Failed to send deal funded email");
  }
}

/**
 * Sent to the buyer when the seller enters tracking details.
 */
export async function sendDealShippedEmail(
  deal: DealSummary,
  trackingNumber: string,
  courierSlug: string,
): Promise<void> {
  try {
    await sendEmail(
      deal.buyerEmail,
      `Your item "${sanitizeSubject(deal.title)}" has shipped`,
      wrap(`
        ${statusPill("Shipped", "blue")}
        <h1 style="margin:12px 0 8px;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">
          Your item is on its way
        </h1>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 4px">
          The seller has dispatched <strong style="color:#0f172a">${esc(deal.title)}</strong>. Track your delivery below.
        </p>
        ${dealCard([
          ...(deal.invoiceNumber ? [["Contract #", `<span style="font-family:monospace;font-weight:700;color:#0f766e">${esc(deal.invoiceNumber)}</span>`] as [string, string]] : []),
          ["Item", esc(deal.title)],
          ["Courier", esc(courierSlug)],
          ["Tracking number", `<span style="font-family:monospace;background:#f1f5f9;padding:2px 6px;border-radius:4px">${esc(trackingNumber)}</span>`],
          ["Seller", esc(deal.sellerEmail)],
        ])}
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin:16px 0">
          <p style="margin:0;color:#1e40af;font-size:14px;font-weight:600">Once your item arrives</p>
          <p style="margin:6px 0 0;color:#1e3a8a;font-size:13px;line-height:1.5">
            Log in and click <strong>Release Funds</strong> to pay the seller. If the item isn't as described, you can raise a dispute instead.
          </p>
        </div>
        ${btn("Track Delivery", dealUrl(deal.id))}
      `),
    );
    logger.info({ dealId: deal.id }, "Deal shipped email sent to buyer");
  } catch (err) {
    logger.error({ dealId: deal.id, err }, "Failed to send deal shipped email");
  }
}

/**
 * Sent to the buyer when the courier confirms delivery.
 */
export async function sendDealDeliveredEmail(deal: DealSummary): Promise<void> {
  try {
    await sendEmail(
      deal.buyerEmail,
      `Delivered — please release funds for "${sanitizeSubject(deal.title)}"`,
      wrap(`
        ${statusPill("Delivered", "green")}
        <h1 style="margin:12px 0 8px;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">
          Your item has been delivered
        </h1>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 4px">
          The courier has confirmed delivery of <strong style="color:#0f172a">${esc(deal.title)}</strong>. Happy with it? Release funds to complete the deal.
        </p>
        ${dealCard([
          ...(deal.invoiceNumber ? [["Contract #", `<span style="font-family:monospace;font-weight:700;color:#0f766e">${esc(deal.invoiceNumber)}</span>`] as [string, string]] : []),
          ["Item", esc(deal.title)],
          ["Amount", nzd(deal.totalNzd)],
          ["Seller", esc(deal.sellerEmail)],
        ])}
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin:16px 0">
          <p style="margin:0;color:#991b1b;font-size:14px;font-weight:600">⏱ Auto-release in 48 hours</p>
          <p style="margin:6px 0 0;color:#7f1d1d;font-size:13px;line-height:1.5">
            If you take no action, funds will automatically release to the seller after 48 hours. If there's a problem, raise a dispute <strong>before</strong> the deadline.
          </p>
        </div>
        ${btn("Release Funds", dealUrl(deal.id), "#15803d")}
        ${btn("Raise a Dispute", dealUrl(deal.id), "#dc2626")}
      `),
    );
    logger.info({ dealId: deal.id }, "Deal delivered email sent to buyer");
  } catch (err) {
    logger.error({ dealId: deal.id, err }, "Failed to send deal delivered email");
  }
}

/**
 * Sent to both parties and admin when a dispute is raised.
 */
export async function sendDisputeRaisedEmail(
  deal: DealSummary,
  raisedByEmail: string,
  reason: string,
): Promise<void> {
  const otherParty =
    raisedByEmail.toLowerCase() === deal.buyerEmail.toLowerCase()
      ? deal.sellerEmail
      : deal.buyerEmail;
  const adminUrl = `${APP_URL}/admin/deals/${deal.id}`;

  try {
    await Promise.all([
      sendEmail(
        raisedByEmail,
        `Dispute received for "${sanitizeSubject(deal.title)}"`,
        wrap(`
          ${statusPill("Dispute open", "red")}
          <h1 style="margin:12px 0 8px;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">
            Your dispute has been received
          </h1>
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 4px">
            We've received your dispute for <strong style="color:#0f172a">${esc(deal.title)}</strong>. Funds are frozen while our team reviews your case.
          </p>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin:16px 0">
            <p style="margin:0;color:#991b1b;font-size:13px;font-weight:600">Your stated reason:</p>
            <p style="margin:6px 0 0;color:#7f1d1d;font-size:13px;line-height:1.5">${reason.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
          </div>
          <p style="color:#475569;font-size:14px;line-height:1.6;margin:0">
            An admin will review evidence from both sides and contact you within <strong>2–3 business days</strong>. You may be asked to provide photos or communication records.
          </p>
          ${btn("View Deal", dealUrl(deal.id))}
        `),
      ),
      sendEmail(
        otherParty,
        `A dispute has been raised on "${sanitizeSubject(deal.title)}"`,
        wrap(`
          ${statusPill("Dispute open", "red")}
          <h1 style="margin:12px 0 8px;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">
            A dispute has been raised
          </h1>
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 4px">
            <strong style="color:#0f172a">${esc(raisedByEmail)}</strong> has raised a dispute on deal <strong style="color:#0f172a">${esc(deal.title)}</strong>. Funds are frozen pending admin review.
          </p>
          ${dealCard([
            ...(deal.invoiceNumber ? [["Contract #", `<span style="font-family:monospace;font-weight:700;color:#0f766e">${esc(deal.invoiceNumber)}</span>`] as [string, string]] : []),
            ["Item", esc(deal.title)],
            ["Raised by", esc(raisedByEmail)],
            ["Amount frozen", nzd(deal.totalNzd)],
          ])}
          <p style="color:#475569;font-size:14px;line-height:1.6;margin:0">
            An admin will contact both parties within 2–3 business days. You may be asked to provide evidence to support your position.
          </p>
          ${btn("View Deal", dealUrl(deal.id))}
        `),
      ),
      ADMIN_EMAILS.length > 0
        ? sendEmail(
            ADMIN_EMAILS,
            `[Admin] Dispute: "${sanitizeSubject(deal.title)}" (${deal.id})`,
            wrap(`
              ${statusPill("Needs review", "red")}
              <h1 style="margin:12px 0 8px;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">
                Dispute requires admin review
              </h1>
              ${dealCard([
                ...(deal.invoiceNumber ? [["Contract #", `<span style="font-family:monospace;font-weight:700;color:#0f766e">${esc(deal.invoiceNumber)}</span>`] as [string, string]] : []),
                ["Deal ID", `<span style="font-family:monospace;font-size:12px">${esc(deal.id)}</span>`],
                ["Item", esc(deal.title)],
                ["Amount", nzd(deal.amountNzd)],
                ["Buyer", esc(deal.buyerEmail)],
                ["Seller", esc(deal.sellerEmail)],
                ["Raised by", esc(raisedByEmail)],
              ])}
              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin:16px 0">
                <p style="margin:0;color:#991b1b;font-size:13px;font-weight:600">Dispute reason:</p>
                <p style="margin:6px 0 0;color:#7f1d1d;font-size:13px;line-height:1.5">${reason.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
              </div>
              ${btn("Review in Admin Console", adminUrl, "#dc2626")}
            `),
          )
        : Promise.resolve(),
    ]);
    logger.info({ dealId: deal.id }, "Dispute raised emails sent");
  } catch (err) {
    logger.error({ dealId: deal.id, err }, "Failed to send dispute raised emails");
  }
}

/**
 * Sent to the seller when the buyer releases funds (deal complete).
 */
export async function sendDealCompleteEmail(deal: DealSummary): Promise<void> {
  try {
    await sendEmail(
      deal.sellerEmail,
      `Funds on their way — "${sanitizeSubject(deal.title)}" complete`,
      wrap(`
        ${statusPill("Complete", "green")}
        <h1 style="margin:12px 0 8px;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">
          Deal complete — payment transferred
        </h1>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 4px">
          The buyer has confirmed delivery and released funds for <strong style="color:#0f172a">${esc(deal.title)}</strong>.
        </p>
        ${dealCard([
          ...(deal.invoiceNumber ? [["Contract #", `<span style="font-family:monospace;font-weight:700;color:#0f766e">${esc(deal.invoiceNumber)}</span>`] as [string, string]] : []),
          ["Item", esc(deal.title)],
          ["Amount transferred", nzd(deal.amountNzd)],
          ["Expected arrival", "2–5 business days"],
          ["Buyer", esc(deal.buyerEmail)],
        ])}
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin:16px 0">
          <p style="margin:0;color:#15803d;font-size:14px;line-height:1.5">
            Funds have been transferred to your connected Stripe account and will arrive in your bank within 2–5 business days depending on your bank's processing time.
          </p>
        </div>
        <p style="color:#475569;font-size:14px;line-height:1.6;margin:0">
          Thank you for using SafeSend. We hope you'll choose us again for your next trade.
        </p>
        ${btn("View Deal", dealUrl(deal.id))}
      `),
    );
    logger.info({ dealId: deal.id }, "Deal complete email sent to seller");
  } catch (err) {
    logger.error({ dealId: deal.id, err }, "Failed to send deal complete email");
  }
}

/**
 * Sent to the other party when a new message is posted in the deal thread.
 */
export async function sendNewMessageEmail(
  deal: DealSummary,
  senderEmail: string,
  content: string,
): Promise<void> {
  const recipientEmail =
    senderEmail.toLowerCase() === deal.buyerEmail.toLowerCase() ? deal.sellerEmail : deal.buyerEmail;

  try {
    await sendEmail(
      recipientEmail,
      `New message on "${sanitizeSubject(deal.title)}"`,
      wrap(`
        ${statusPill("New message", "blue")}
        <h1 style="margin:12px 0 8px;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">
          Message from ${esc(senderEmail)}
        </h1>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 8px">
          You have a new message on your SafeSend deal for <strong style="color:#0f172a">${esc(deal.title)}</strong>:
        </p>
        <div style="background:#f8fafc;border-left:4px solid #0d9488;border-radius:0 8px 8px 0;padding:14px 16px;margin:16px 0;font-size:14px;line-height:1.6;color:#334155">
          ${content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>")}
        </div>
        <p style="color:#64748b;font-size:13px;line-height:1.6;margin:0">
          Reply in SafeSend to keep your conversation on-platform — messages can be used as evidence in any dispute.
        </p>
        ${btn("Reply in SafeSend", dealUrl(deal.id))}
      `),
    );
    logger.info({ dealId: deal.id, to: recipientEmail }, "New message notification email sent");
  } catch (err) {
    logger.error({ dealId: deal.id, err }, "Failed to send new message email");
  }
}

/**
 * Sent to both parties when a deal is cancelled.
 */
export async function sendDealCancelledEmail(deal: DealSummary, reason?: string): Promise<void> {
  const reasonBlock = reason
    ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:12px 0;color:#475569;font-size:13px;line-height:1.5">
        <strong style="color:#0f172a">Reason:</strong> ${reason.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}
       </div>`
    : "";
  try {
    await Promise.all([
      sendEmail(
        deal.buyerEmail,
        `Deal cancelled: "${sanitizeSubject(deal.title)}"`,
        wrap(`
          ${statusPill("Cancelled", "red")}
          <h1 style="margin:12px 0 8px;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">
            Deal cancelled
          </h1>
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 4px">
            The deal for <strong style="color:#0f172a">${esc(deal.title)}</strong> has been cancelled. <strong>No funds were charged to you.</strong>
          </p>
          ${reasonBlock}
          <p style="color:#64748b;font-size:13px;line-height:1.5;margin:16px 0 0">
            If you'd like to create a new deal, you can start fresh on SafeSend at any time.
          </p>
        `),
      ),
      sendEmail(
        deal.sellerEmail,
        `Deal cancelled: "${sanitizeSubject(deal.title)}"`,
        wrap(`
          ${statusPill("Cancelled", "red")}
          <h1 style="margin:12px 0 8px;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">
            Deal cancelled
          </h1>
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 4px">
            The deal for <strong style="color:#0f172a">${esc(deal.title)}</strong> has been cancelled. No funds will be transferred.
          </p>
          ${reasonBlock}
        `),
      ),
    ]);
    logger.info({ dealId: deal.id }, "Deal cancelled emails sent");
  } catch (err) {
    logger.error({ dealId: deal.id, err }, "Failed to send deal cancelled emails");
  }
}
