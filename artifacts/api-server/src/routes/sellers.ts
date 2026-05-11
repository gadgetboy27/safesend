import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, sellersTable } from "@workspace/db";
import {
  OnboardSellerBody,
  OnboardSellerResponse,
  GetSellerStatusQueryParams,
  GetSellerStatusResponse,
} from "@workspace/api-zod";
import { stripe } from "../lib/stripe";
import { logger } from "../lib/logger";
import { requireAuth, sessionEmail } from "../middleware/requireAuth";

const router: IRouter = Router();

// POST /seller/onboard — Creates real Stripe Connect Express account + account link
router.post("/seller/onboard", requireAuth, async (req, res): Promise<void> => {
  const parsed = OnboardSellerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = sessionEmail(req);
  if (!email) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const { returnUrl, refreshUrl } = parsed.data;

  let [seller] = await db.select().from(sellersTable).where(eq(sellersTable.email, email));

  // Create or reuse Stripe Express account
  let stripeAccountId = seller?.stripeAccountId;

  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "NZ",
      email,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_type: "individual",
      settings: { payouts: { schedule: { interval: "manual" } } },
    });
    stripeAccountId = account.id;

    if (seller) {
      await db
        .update(sellersTable)
        .set({ stripeAccountId, chargesEnabled: false, payoutsEnabled: false, onboardingComplete: false })
        .where(eq(sellersTable.email, email));
    } else {
      [seller] = await db
        .insert(sellersTable)
        .values({
          email,
          stripeAccountId,
          chargesEnabled: false,
          payoutsEnabled: false,
          onboardingComplete: false,
        })
        .returning();
    }

    logger.info({ email, stripeAccountId }, "Stripe Express account created");
  }

  // Create account onboarding link
  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
    collect: "eventually_due",
  });

  res.json(
    OnboardSellerResponse.parse({
      url: accountLink.url,
      accountId: stripeAccountId,
    }),
  );
});

// GET /seller/status — Checks live Stripe account status
router.get("/seller/status", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetSellerStatusQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const emailToCheck = sessionEmail(req);
  if (!emailToCheck) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const [seller] = await db.select().from(sellersTable).where(eq(sellersTable.email, emailToCheck));

  if (!seller?.stripeAccountId) {
    res.json(
      GetSellerStatusResponse.parse({
        email: emailToCheck,
        stripeAccountId: null,
        chargesEnabled: false,
        payoutsEnabled: false,
        onboardingComplete: false,
      }),
    );
    return;
  }

  // Fetch live status from Stripe so it's always accurate post-onboarding
  const account = await stripe.accounts.retrieve(seller.stripeAccountId);
  const chargesEnabled = account.charges_enabled ?? false;
  const payoutsEnabled = account.payouts_enabled ?? false;
  const onboardingComplete = chargesEnabled && payoutsEnabled;

  // Persist updated status
  if (
    chargesEnabled !== seller.chargesEnabled ||
    payoutsEnabled !== seller.payoutsEnabled ||
    onboardingComplete !== seller.onboardingComplete
  ) {
    await db
      .update(sellersTable)
      .set({ chargesEnabled, payoutsEnabled, onboardingComplete })
      .where(eq(sellersTable.email, seller.email));
  }

  res.json(
    GetSellerStatusResponse.parse({
      email: seller.email,
      stripeAccountId: seller.stripeAccountId,
      chargesEnabled,
      payoutsEnabled,
      onboardingComplete,
    }),
  );
});

export default router;
