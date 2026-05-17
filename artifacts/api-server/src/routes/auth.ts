import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db, pool, magicLinkTokensTable, usersTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { sendMagicLinkEmail } from "../lib/email";
import { sendPhoneOtp, checkPhoneOtp } from "../lib/sms";
import { authRequestLinkLimiter, phoneVerifySendLimiter, phoneVerifyConfirmLimiter } from "../middleware/rateLimiters";

const router: IRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseRequestLinkBody(body: unknown): { email: string; returnPath?: string } | null {
  if (!body || typeof body !== "object") return null;
  const { email, returnPath } = body as Record<string, unknown>;
  if (typeof email !== "string" || !EMAIL_RE.test(email)) return null;
  const safePath =
    typeof returnPath === "string" &&
    returnPath.startsWith("/") &&
    !returnPath.startsWith("//")
      ? returnPath
      : undefined;
  return {
    email: email.toLowerCase().trim(),
    returnPath: safePath,
  };
}

function parseVerifyBody(body: unknown): { token: string } | null {
  if (!body || typeof body !== "object") return null;
  const { token } = body as Record<string, unknown>;
  if (typeof token !== "string" || !UUID_RE.test(token)) return null;
  return { token };
}

// ─── POST /auth/request-link ─────────────────────────────────
// Sends a one-time magic link to the provided email address.
// The link is valid for 30 minutes and can only be used once.
router.post("/auth/request-link", authRequestLinkLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = parseRequestLinkBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "A valid email address is required" });
    return;
  }

  const { email, returnPath } = parsed;
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await db.insert(magicLinkTokensTable).values({ email, token, expiresAt });

  // REPLIT_DEV_DOMAIN is already the full hostname (e.g. abc-xyz.janeway.replit.dev)
  const baseUrl =
    process.env.APP_BASE_URL ??
    (process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "http://localhost:3000");

  const path = returnPath ?? "/";
  const magicLink = `${baseUrl}/auth/verify?token=${token}&next=${encodeURIComponent(path)}`;

  const isDev = process.env.NODE_ENV !== "production";

  try {
    await sendMagicLinkEmail(email, magicLink);
  } catch (err) {
    if (!isDev) {
      res.status(500).json({ error: "Failed to send login email. Please try again." });
      return;
    }
    // In dev, email failure is non-fatal — the devLink in the response is enough.
    logger.warn({ email, err: err instanceof Error ? err.message : String(err) }, "Email failed in dev — returning devLink only");
  }

  logger.info({ email }, "Magic link requested");

  // Always return the link in dev so the login page can show it as a clickable
  // shortcut — useful whether or not RESEND_API_KEY is configured.
  res.json({
    ok: true,
    message: isDev ? "Dev mode: use the link below to sign in." : "Check your email for a sign-in link.",
    ...(isDev && { devLink: magicLink }),
  });
});

// ─── POST /auth/verify ───────────────────────────────────────
// Validates a magic-link token and creates a session.
// Requires JSON body to prevent login CSRF via HTML form submission.
router.post("/auth/verify", async (req: Request, res: Response): Promise<void> => {
  if (!req.is("application/json")) {
    res.status(415).json({ error: "Content-Type must be application/json" });
    return;
  }

  const parsed = parseVerifyBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "Invalid token format" });
    return;
  }

  const { token } = parsed;

  // Atomic UPDATE...RETURNING using raw SQL with server-side NOW() — avoids
  // any client-clock or Drizzle timestamp serialisation issues with the pooler.
  const { rows } = await pool.query<{ email: string }>(
    `UPDATE magic_link_tokens SET used = true
     WHERE token = $1 AND used = false AND expires_at > NOW()
     RETURNING email`,
    [token],
  );
  const row = rows[0];

  if (!row) {
    res.status(401).json({ error: "Invalid or expired login link" });
    return;
  }

  // Upsert into users table — first verification creates the profile;
  // subsequent logins update verifiedAt so we always have the latest timestamp.
  // email is the primary key so this is idempotent and safe to run on every login.
  await db
    .insert(usersTable)
    .values({ email: row.email, verifiedAt: new Date() })
    .onConflictDoUpdate({
      target: usersTable.email,
      set: { verifiedAt: new Date() },
    });


  // Regenerate the session ID before writing the authenticated email.
  // This prevents session fixation: an attacker who obtained a pre-auth
  // session cookie cannot reuse it after the victim authenticates.
  await new Promise<void>((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve())),
  );

  (req.session as { email?: string }).email = row.email;

  await new Promise<void>((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve())),
  );

  logger.info({ email: row.email }, "User authenticated via magic link");
  res.json({ ok: true, email: row.email });

  // ─────────────────────────────────────────────────────────────────────────
  // FUTURE: Stripe Identity KYC stub
  //
  // When you are ready to require identity verification at sign-up, insert the
  // following logic here (after the user upsert, before the session is set):
  //
  //   import Stripe from "stripe";
  //   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  //
  //   // 1. Create a Stripe Identity VerificationSession for this email
  //   const verificationSession = await stripe.identity.verificationSessions.create({
  //     type: "document",
  //     metadata: { email: row.email },
  //     options: { document: { allowed_types: ["driving_license", "passport"], require_id_number: true } },
  //   });
  //
  //   // 2. Check if the user already has a verified Stripe Identity record
  //   const existingUser = await db.select().from(usersTable).where(eq(usersTable.email, row.email));
  //   if (!existingUser[0]?.stripeIdentityVerified) {
  //     // 3. Return the client_secret to the frontend to launch the Stripe Identity modal
  //     res.json({ ok: true, requiresKyc: true, clientSecret: verificationSession.client_secret });
  //     return;
  //   }
  //
  // Required DB column additions to usersTable:
  //   stripeIdentitySessionId: text("stripe_identity_session_id")
  //   stripeIdentityVerified:  boolean("stripe_identity_verified").notNull().default(false)
  //   kycVerifiedAt:           timestamp("kyc_verified_at", { withTimezone: true })
  //
  // Required API additions:
  //   POST /api/auth/kyc-webhook  — Stripe webhook for identity.verification_session.verified
  //     → updates stripeIdentityVerified = true, kycVerifiedAt = now
  //
  // Required frontend additions:
  //   After login, if response contains requiresKyc: true, load Stripe.js and call
  //     stripe.verifyIdentity(clientSecret) to open the identity document capture modal.
  //   After completion, poll GET /api/auth/me until kycVerified: true before redirecting.
  //
  // Pricing note: Stripe Identity costs ~$1.50 USD per successful verification.
  // Recommended threshold: only require KYC for deals above a certain value (e.g. $500 NZD).
  // ─────────────────────────────────────────────────────────────────────────
});

// ─── POST /auth/verify-phone/send ───────────────────────────
// Sends a 6-digit OTP to the provided phone number via Twilio Verify.
// Rate limited to 5 attempts/hour to prevent Twilio cost abuse.
router.post("/auth/verify-phone/send", phoneVerifySendLimiter, async (req: Request, res: Response): Promise<void> => {
  const email = (req.session as { email?: string }).email;
  if (!email) { res.status(401).json({ error: "Authentication required" }); return; }

  const { phone } = req.body as { phone?: unknown };
  if (typeof phone !== "string" || phone.trim().length < 7) {
    res.status(400).json({ error: "A valid phone number is required" });
    return;
  }

  const result = await sendPhoneOtp(phone.trim());
  if (!result.ok) { res.status(500).json({ error: result.error }); return; }

  logger.info({ email }, "Phone OTP requested");
  res.json({ ok: true });
});

// ─── POST /auth/verify-phone/confirm ────────────────────────
// Checks the OTP, saves the verified phone + display name to the user record.
// After this call, GET /auth/me will include phoneVerifiedAt.
router.post("/auth/verify-phone/confirm", phoneVerifyConfirmLimiter, async (req: Request, res: Response): Promise<void> => {
  const email = (req.session as { email?: string }).email;
  if (!email) { res.status(401).json({ error: "Authentication required" }); return; }

  const { phone, code, name } = req.body as { phone?: unknown; code?: unknown; name?: unknown };
  if (typeof phone !== "string" || typeof code !== "string" || phone.trim().length < 7 || code.trim().length < 4) {
    res.status(400).json({ error: "Phone number and verification code are required" });
    return;
  }
  if (typeof name !== "string" || name.trim().length < 2) {
    res.status(400).json({ error: "Your full name (at least 2 characters) is required" });
    return;
  }

  const result = await checkPhoneOtp(phone.trim(), code.trim());
  if (!result.ok) { res.status(400).json({ error: result.error }); return; }

  await db
    .update(usersTable)
    .set({ phone: phone.trim(), phoneVerifiedAt: new Date(), name: name.trim() })
    .where(eq(usersTable.email, email));

  logger.info({ email }, "Phone verified");
  res.json({ ok: true });
});

// ─── GET /auth/me ────────────────────────────────────────────
// Returns the currently logged-in user's email and profile, or 401 if not authenticated.
router.get("/auth/me", async (req: Request, res: Response): Promise<void> => {
  const email = (req.session as { email?: string } | undefined)?.email;
  if (!email) {
    res.status(401).json({ authenticated: false });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  res.json({
    authenticated: true,
    email,
    name: user?.name ?? null,
    phone: user?.phone ?? null,
    phoneVerifiedAt: user?.phoneVerifiedAt?.toISOString() ?? null,
    verifiedAt: user?.verifiedAt?.toISOString() ?? new Date().toISOString(),
  });
});

// ─── POST /auth/logout ───────────────────────────────────────
router.post("/auth/logout", async (req: Request, res: Response): Promise<void> => {
  await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
  res.clearCookie("sid");
  res.json({ ok: true });
});

export default router;
