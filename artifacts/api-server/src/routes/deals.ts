import { Router, type IRouter } from "express";
import { eq, or, and, desc, isNull } from "drizzle-orm";
import { db, dealsTable, dealMessagesTable, consentsTable } from "@workspace/db";
import {
  CreateDealBody,
  GetDealParams,
  ListDealsQueryParams,
  MarkShippedBody,
  MarkShippedParams,
  ReleaseFundsBody,
  ReleaseFundsParams,
  RaiseDisputeBody,
  RaiseDisputeParams,
  CancelDealBody,
  CancelDealParams,
  ConfirmPaymentBody,
  ConfirmPaymentParams,
  ConfirmAsBuyerParams,
  GetDealResponse,
  ListDealsResponse,
  ConfirmPaymentResponse,
  SendDealMessageBody,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { calculateFee, validateAmount, validateCourierSlug, generateDealId, generateInvoiceNumber, nzdToCents, addBusinessDays } from "../lib/deal-helpers";
import { stripe } from "../lib/stripe";
import { assertValidTransition } from "../lib/state-machine";
import { transitionDeal, recordTransition } from "../lib/deal-transition";
import { mapToTrackingMoreCourierCode } from "../lib/courier-mapping";
import { releaseDealFunds } from "../lib/release-deal-funds";
import { requireAuth, sessionEmail } from "../middleware/requireAuth";
import { createDealLimiter, raiseDisputeLimiter, sendMessageLimiter } from "../middleware/rateLimiters";
import { randomUUID } from "crypto";
import {
  sendSellerAcceptanceRequestEmail,
  sendDealCreatedEmail,
  sendDealShippedEmail,
  sendDealCompleteEmail,
  sendDisputeRaisedEmail,
  sendDealCancelledEmail,
  sendNewMessageEmail,
} from "../lib/email";
import {
  smsDealCreated,
  smsDealFunded,
  smsDealShipped,
  smsDealDelivered,
  smsDealDisputed,
} from "../lib/sms";

const router: IRouter = Router();

function dealToResponse(deal: typeof dealsTable.$inferSelect) {
  return {
    ...deal,
    amountNzd: Number(deal.amountNzd),
    feeNzd: Number(deal.feeNzd),
    kycFeeNzd: Number(deal.kycFeeNzd),
    totalNzd: Number(deal.totalNzd),
  };
}

// ─── POST /deals ─────────────────────────────────────────────
router.post("/deals", requireAuth, createDealLimiter, async (req, res): Promise<void> => {
  const parsed = CreateDealBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { title, description, amountNzd, buyerEmail, sellerEmail, buyerPhone, sellerPhone, itemUrl, referenceNumber, creatorRole } = parsed.data;

  const amountError = validateAmount(amountNzd);
  if (amountError) {
    res.status(400).json({ error: amountError });
    return;
  }

  if (buyerEmail.toLowerCase() === sellerEmail.toLowerCase()) {
    res.status(400).json({ error: "Buyer and seller cannot be the same person" });
    return;
  }

  const creatorEmail = sessionEmail(req) ?? "";

  // Enforce that the creator's session email matches the role they claimed.
  // Prevents someone from impersonating the other party at creation time.
  if (creatorRole === "seller" && creatorEmail.toLowerCase() !== sellerEmail.toLowerCase()) {
    res.status(403).json({ error: "Your email must match the seller email when creating as seller" });
    return;
  }
  if (creatorRole === "buyer" && creatorEmail.toLowerCase() !== buyerEmail.toLowerCase()) {
    res.status(403).json({ error: "Your email must match the buyer email when creating as buyer" });
    return;
  }

  const { feeNzd, kycFeeNzd, totalNzd } = calculateFee(amountNzd);
  const id = generateDealId();
  const invoiceNumber = generateInvoiceNumber();

  // State machine:
  // • Seller creates → pending_buyer_confirmation (buyer must authenticate + confirm before paying)
  // • Buyer creates  → pending_seller_acceptance   (seller must accept + confirm item details)
  const initialState: "pending_buyer_confirmation" | "pending_seller_acceptance" =
    creatorRole === "seller" ? "pending_buyer_confirmation" : "pending_seller_acceptance";

  const [deal] = await db
    .insert(dealsTable)
    .values({
      id,
      title,
      description,
      amountNzd: String(amountNzd),
      feeNzd: String(feeNzd),
      kycFeeNzd: String(kycFeeNzd),
      totalNzd: String(totalNzd),
      buyerEmail,
      sellerEmail,
      state: initialState,
      version: 0,
      buyerPhone: buyerPhone ?? null,
      sellerPhone: sellerPhone ?? null,
      itemUrl: itemUrl ?? null,
      referenceNumber: referenceNumber ?? null,
      invoiceNumber,
      creatorRole,
      payByDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .returning();

  await recordTransition(id, null, initialState, creatorEmail || buyerEmail, "Deal created");

  // Record creator's consent immediately (CCLA 2017 digital signature).
  // Counterparty consent is recorded when they confirm (accept/confirm-as-buyer).
  await db.insert(consentsTable).values({
    dealId: id,
    party: creatorRole,
    agreementVersion: "1.0",
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
  req.log.info({ dealId: id, initialState, creatorRole }, "Deal created + consent recorded");

  // Fire-and-forget transactional emails
  const dealSummary = {
    id: deal.id,
    title: deal.title,
    amountNzd: deal.amountNzd,
    totalNzd: deal.totalNzd,
    buyerEmail: deal.buyerEmail,
    sellerEmail: deal.sellerEmail,
    invoiceNumber: deal.invoiceNumber,
  };
  if (creatorRole === "seller") {
    // Seller created — notify buyer to visit and confirm before paying
    void sendDealCreatedEmail(dealSummary);
    void smsDealCreated(deal.buyerPhone, deal.id, deal.title);
  } else {
    // Buyer created — ask seller to accept + confirm item details
    void sendSellerAcceptanceRequestEmail(dealSummary);
  }

  res.status(201).json(GetDealResponse.parse(dealToResponse(deal)));
});

// ─── GET /deals ───────────────────────────────────────────────
// Auth required: session email is the sole identity source — no client-supplied
// email is accepted. Removing the email query param from the OpenAPI spec prevents
// callers from believing they can enumerate other users' deals by email address.
router.get("/deals", requireAuth, async (req, res): Promise<void> => {
  const email = sessionEmail(req);
  if (!email) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // Only role is accepted from the client; identity always comes from session.
  const parsed = ListDealsQueryParams.safeParse(req.query);
  const role = parsed.success ? parsed.data.role : "any";

  const whereClause =
    role === "buyer"
      ? eq(dealsTable.buyerEmail, email)
      : role === "seller"
        ? eq(dealsTable.sellerEmail, email)
        : or(eq(dealsTable.buyerEmail, email), eq(dealsTable.sellerEmail, email));

  const deals = await db
    .select()
    .from(dealsTable)
    .where(whereClause)
    .orderBy(desc(dealsTable.createdAt));

  res.json(ListDealsResponse.parse(deals.map(dealToResponse)));
});

// ─── GET /deals/:dealId ───────────────────────────────────────
// Auth required: session user must be buyer or seller on the deal.
router.get("/deals/:dealId", requireAuth, async (req, res): Promise<void> => {
  const params = GetDealParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const email = sessionEmail(req);
  if (!email) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, params.data.dealId));
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  if (
    deal.buyerEmail.toLowerCase() !== email.toLowerCase() &&
    deal.sellerEmail.toLowerCase() !== email.toLowerCase()
  ) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  res.json(GetDealResponse.parse(dealToResponse(deal)));
});

// ─── POST /deals/:dealId/accept ───────────────────────────────
// Seller accepts deal terms → pending_seller_acceptance → created
router.post("/deals/:dealId/accept", requireAuth, async (req, res): Promise<void> => {
  const params = GetDealParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, params.data.dealId));
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  const actor = sessionEmail(req);
  if (!actor || deal.sellerEmail.toLowerCase() !== actor.toLowerCase()) {
    res.status(403).json({ error: "Only the seller can accept a deal" });
    return;
  }

  try {
    assertValidTransition(deal.state, "created");
  } catch {
    res.status(400).json({ error: `Cannot accept — deal is in '${deal.state}' state` });
    return;
  }

  const updated = await transitionDeal(
    deal.id,
    deal.version,
    deal.state,
    "created",
    {},
    actor,
    "Seller accepted deal terms",
  );

  // Record seller consent for buyer-created deals (seller accepts after the fact)
  await db.insert(consentsTable).values({
    dealId: deal.id,
    party: "seller",
    agreementVersion: "1.0",
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });

  req.log.info({ dealId: deal.id }, "Seller accepted deal + consent recorded");

  // Notify buyer that the deal is accepted and they can now pay
  void sendDealCreatedEmail({
    id: deal.id,
    title: deal.title,
    amountNzd: deal.amountNzd,
    totalNzd: deal.totalNzd,
    buyerEmail: deal.buyerEmail,
    sellerEmail: deal.sellerEmail,
    invoiceNumber: deal.invoiceNumber,
  });

  res.json(GetDealResponse.parse(dealToResponse(updated)));
});

// ─── POST /deals/:dealId/confirm-as-buyer ────────────────────
// Buyer authenticates and confirms a seller-created deal → pending_buyer_confirmation → created
router.post("/deals/:dealId/confirm-as-buyer", requireAuth, async (req, res): Promise<void> => {
  const params = ConfirmAsBuyerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, params.data.dealId));
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  const actor = sessionEmail(req);
  if (!actor || deal.buyerEmail.toLowerCase() !== actor.toLowerCase()) {
    res.status(403).json({ error: "Only the buyer can confirm this deal" });
    return;
  }

  try {
    assertValidTransition(deal.state, "created");
  } catch {
    res.status(400).json({ error: `Cannot confirm — deal is in '${deal.state}' state` });
    return;
  }

  const updated = await transitionDeal(
    deal.id,
    deal.version,
    deal.state,
    "created",
    {},
    actor,
    "Buyer confirmed deal terms",
  );

  // Record buyer consent
  await db.insert(consentsTable).values({
    dealId: deal.id,
    party: "buyer",
    agreementVersion: "1.0",
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });

  req.log.info({ dealId: deal.id }, "Buyer confirmed deal + consent recorded");

  // Notify seller that the buyer has confirmed and funds will be incoming
  void sendDealCreatedEmail({
    id: deal.id,
    title: deal.title,
    amountNzd: deal.amountNzd,
    totalNzd: deal.totalNzd,
    buyerEmail: deal.buyerEmail,
    sellerEmail: deal.sellerEmail,
    invoiceNumber: deal.invoiceNumber,
  });

  res.json(GetDealResponse.parse(dealToResponse(updated)));
});

// ─── POST /deals/:dealId/confirm-payment ─────────────────────
// Creates a real Stripe PaymentIntent. Returns clientSecret for frontend.
router.post("/deals/:dealId/confirm-payment", requireAuth, async (req, res): Promise<void> => {
  const params = ConfirmPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = ConfirmPaymentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, params.data.dealId));
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  const buyerActor = sessionEmail(req);
  if (!buyerActor) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (deal.buyerEmail.toLowerCase() !== buyerActor.toLowerCase()) {
    res.status(403).json({ error: "Only the buyer can confirm payment" });
    return;
  }

  try {
    assertValidTransition(deal.state, "funded");
  } catch {
    res.status(400).json({ error: `Cannot pay for a deal in '${deal.state}' state` });
    return;
  }

  // If there's already a PaymentIntent (e.g. buyer is retrying), reuse it
  let paymentIntentId = deal.stripePaymentIntentId;
  let clientSecret: string;

  if (paymentIntentId) {
    const existing = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (existing.status === "succeeded") {
      res.status(400).json({ error: "Payment already completed for this deal" });
      return;
    }
    clientSecret = existing.client_secret!;
  } else {
    const totalCents = nzdToCents(Number(deal.totalNzd));

    const piParams: Parameters<typeof stripe.paymentIntents.create>[0] = {
      amount: totalCents,
      currency: "nzd",
      metadata: { dealId: deal.id, buyerEmail: deal.buyerEmail, sellerEmail: deal.sellerEmail },
      transfer_group: deal.id,
      description: `SafeSend escrow: ${deal.title}`,
      automatic_payment_methods: { enabled: true },
    };

    const pi = await stripe.paymentIntents.create(piParams);

    // Atomic conditional write: only store the new PI if no other request has
    // already claimed the slot. If 0 rows updated, a concurrent request raced
    // us — cancel our PI and use theirs instead.
    const claimed = await db
      .update(dealsTable)
      .set({ stripePaymentIntentId: pi.id })
      .where(and(eq(dealsTable.id, deal.id), isNull(dealsTable.stripePaymentIntentId)));

    const rowsAffected = claimed.rowCount ?? 0;
    if (rowsAffected === 0) {
      // Another request already wrote a PaymentIntent — cancel ours to avoid
      // a dangling charge and return the existing one.
      void stripe.paymentIntents.cancel(pi.id).catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "unknown";
        req.log.error({ dealId: deal.id, piId: pi.id, err: msg }, "Failed to cancel duplicate PaymentIntent");
      });

      const [refreshed] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
      if (!refreshed?.stripePaymentIntentId) {
        req.log.error({ dealId: deal.id }, "Race condition: no PaymentIntent ID after conditional write loss");
        res.status(500).json({ error: "Payment setup conflict — please try again" });
        return;
      }
      const existing = await stripe.paymentIntents.retrieve(refreshed.stripePaymentIntentId);
      if (existing.status === "succeeded") {
        res.status(400).json({ error: "Payment already completed for this deal" });
        return;
      }
      paymentIntentId = refreshed.stripePaymentIntentId;
      clientSecret = existing.client_secret!;
    } else {
      paymentIntentId = pi.id;
      clientSecret = pi.client_secret!;
    }
  }

  // Record buyer consent (CCLA 2017 digital signature) — buyer ticked the escrow
  // agreement checkbox in the payment modal immediately before initiating this request.
  await db.insert(consentsTable).values({
    dealId: deal.id,
    party: "buyer",
    agreementVersion: "1.0",
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
  req.log.info({ dealId: deal.id }, "Buyer consent recorded at payment initiation");

  req.log.info({ dealId: deal.id, paymentIntentId }, "PaymentIntent ready");
  res.json(
    ConfirmPaymentResponse.parse({
      clientSecret,
      paymentIntentId: paymentIntentId!,
      totalNzd: Number(deal.totalNzd),
    }),
  );
});

// ─── POST /deals/:dealId/mark-shipped ────────────────────────
router.post("/deals/:dealId/mark-shipped", requireAuth, async (req, res): Promise<void> => {
  const params = MarkShippedParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = MarkShippedBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, params.data.dealId));
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  const sellerActor = sessionEmail(req);
  if (!sellerActor) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (deal.sellerEmail.toLowerCase() !== sellerActor.toLowerCase()) {
    res.status(403).json({ error: "Only the seller can mark as shipped" });
    return;
  }

  const courierError = validateCourierSlug(body.data.courierSlug);
  if (courierError) {
    res.status(400).json({ error: courierError });
    return;
  }

  try {
    assertValidTransition(deal.state, "shipped");
  } catch {
    res.status(400).json({ error: `Cannot mark shipped — deal is in '${deal.state}' state` });
    return;
  }

  const signatureRequired = body.data.signatureRequired ?? true;

  // Register with TrackingMore so they push webhook checkpoints to us
  const tmCourierCode = mapToTrackingMoreCourierCode(body.data.courierSlug);
  if (process.env.TRACKINGMORE_API_KEY && tmCourierCode) {
    try {
      const resp = await fetch("https://api.trackingmore.com/v4/trackings", {
        method: "POST",
        headers: {
          "Tracking-Api-Key": process.env.TRACKINGMORE_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tracking_number: body.data.trackingNumber,
          courier_code: tmCourierCode,
          order_id: deal.id,
        }),
      });
      if (!resp.ok && resp.status !== 409) {
        const errText = await resp.text();
        req.log.warn({ status: resp.status, errText }, "TrackingMore registration failed");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown";
      req.log.warn({ err: msg }, "TrackingMore registration network error");
    }
  }

  const updated = await transitionDeal(
    deal.id,
    deal.version,
    deal.state,
    "shipped",
    { trackingNumber: body.data.trackingNumber, courierSlug: body.data.courierSlug.toLowerCase(), shippedAt: new Date(), signatureRequired },
    sellerActor,
    `Tracking: ${body.data.trackingNumber} via ${body.data.courierSlug}`,
  );

  req.log.info({ dealId: deal.id, tracking: body.data.trackingNumber }, "Deal marked shipped");

  void sendDealShippedEmail(
    { id: deal.id, title: deal.title, amountNzd: deal.amountNzd, totalNzd: deal.totalNzd, buyerEmail: deal.buyerEmail, sellerEmail: deal.sellerEmail, invoiceNumber: deal.invoiceNumber },
    body.data.trackingNumber,
    body.data.courierSlug,
  );
  void smsDealShipped(deal.buyerPhone, deal.id, deal.title);

  res.json(GetDealResponse.parse(dealToResponse(updated)));
});

// ─── POST /deals/:dealId/release-funds ───────────────────────
// Buyer confirms receipt. Triggers real Stripe Connect transfer to seller.
router.post("/deals/:dealId/release-funds", requireAuth, async (req, res): Promise<void> => {
  const params = ReleaseFundsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = ReleaseFundsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, params.data.dealId));
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  const buyerActorRelease = sessionEmail(req);
  if (!buyerActorRelease) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (deal.buyerEmail.toLowerCase() !== buyerActorRelease.toLowerCase()) {
    res.status(403).json({ error: "Only the buyer can release funds" });
    return;
  }

  try {
    assertValidTransition(deal.state, "complete");
  } catch {
    res.status(400).json({ error: `Cannot release funds — deal is in '${deal.state}' state` });
    return;
  }

  const result = await releaseDealFunds(deal, buyerActorRelease);
  if (!result.ok) {
    res.status(502).json({
      error: "Transfer to seller failed. Your payment is secure and the deal has not been released. Please try again or contact support if the problem persists.",
      detail: result.error,
    });
    return;
  }

  req.log.info({ dealId: deal.id }, "Deal complete");

  void sendDealCompleteEmail({
    id: deal.id,
    title: deal.title,
    amountNzd: deal.amountNzd,
    totalNzd: deal.totalNzd,
    buyerEmail: deal.buyerEmail,
    sellerEmail: deal.sellerEmail,
    invoiceNumber: deal.invoiceNumber,
  });

  res.json(GetDealResponse.parse(dealToResponse(result.deal)));
});

// ─── POST /deals/:dealId/dispute ─────────────────────────────
router.post("/deals/:dealId/dispute", requireAuth, raiseDisputeLimiter, async (req, res): Promise<void> => {
  const params = RaiseDisputeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = RaiseDisputeBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, params.data.dealId));
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  const disputeActor = sessionEmail(req);
  if (!disputeActor) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const isParticipant =
    deal.buyerEmail.toLowerCase() === disputeActor.toLowerCase() ||
    deal.sellerEmail.toLowerCase() === disputeActor.toLowerCase();
  if (!isParticipant) {
    res.status(403).json({ error: "Only buyer or seller can raise a dispute" });
    return;
  }

  try {
    assertValidTransition(deal.state, "disputed");
  } catch {
    res.status(400).json({ error: `Cannot raise a dispute on a deal in '${deal.state}' state` });
    return;
  }

  const now = new Date();
  const updated = await transitionDeal(
    deal.id,
    deal.version,
    deal.state,
    "disputed",
    {
      disputeReason: body.data.reason,
      disputedAt: now,
      disputeResolveBy: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
    },
    disputeActor,
    body.data.reason,
  );

  req.log.warn({ dealId: deal.id }, "Dispute raised");

  void sendDisputeRaisedEmail(
    { id: deal.id, title: deal.title, amountNzd: deal.amountNzd, totalNzd: deal.totalNzd, buyerEmail: deal.buyerEmail, sellerEmail: deal.sellerEmail },
    disputeActor,
    body.data.reason,
  );
  void smsDealDisputed(deal.sellerPhone, deal.buyerPhone, deal.id, deal.title);

  res.json(GetDealResponse.parse(dealToResponse(updated)));
});

// ─── POST /deals/:dealId/cancel ───────────────────────────────
router.post("/deals/:dealId/cancel", requireAuth, async (req, res): Promise<void> => {
  const params = CancelDealParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = CancelDealBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, params.data.dealId));
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  const cancelActor = sessionEmail(req);
  if (!cancelActor) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const isParticipant =
    deal.buyerEmail.toLowerCase() === cancelActor.toLowerCase() ||
    deal.sellerEmail.toLowerCase() === cancelActor.toLowerCase();
  if (!isParticipant) {
    res.status(403).json({ error: "Only buyer or seller can cancel a deal" });
    return;
  }

  // Cancellation rules per spec table
  if (deal.state === "shipped") {
    if (deal.shipmentVerificationStatus !== "flagged") {
      const msg =
        deal.shipmentVerificationStatus === "pending"
          ? "Cannot cancel — awaiting first courier scan. If not scanned within 48h the deal will be flaggable."
          : "Cannot cancel — shipment is verified in transit. Raise a dispute after delivery if needed.";
      res.status(400).json({ error: msg });
      return;
    }
    // flagged shipped deal — only buyer may cancel
    if (deal.buyerEmail.toLowerCase() !== cancelActor.toLowerCase()) {
      res.status(403).json({ error: "Only the buyer can cancel a flagged shipment" });
      return;
    }
  } else {
    try {
      assertValidTransition(deal.state, "cancelled");
    } catch {
      res.status(400).json({ error: `Cannot cancel a deal in '${deal.state}' state` });
      return;
    }
  }

  // Branch on PI status: cancel if not yet succeeded, refund if already succeeded.
  // IMPORTANT: if Stripe fails, we must NOT mark the deal as cancelled — fail closed
  // to prevent stranded funds.
  if (deal.stripePaymentIntentId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(deal.stripePaymentIntentId);
      if (pi.status === "succeeded") {
        const refund = await stripe.refunds.create({
          payment_intent: deal.stripePaymentIntentId,
          reason: "requested_by_customer",
        });
        await db.update(dealsTable).set({ stripeRefundId: refund.id }).where(eq(dealsTable.id, deal.id));
        req.log.info({ dealId: deal.id, refundId: refund.id, piId: deal.stripePaymentIntentId }, "Full refund issued on cancel");
      } else {
        await stripe.paymentIntents.cancel(deal.stripePaymentIntentId);
        req.log.info({ dealId: deal.id, piId: deal.stripePaymentIntentId }, "PaymentIntent cancelled on cancel");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      req.log.error({ dealId: deal.id, err: msg }, "Stripe operation on cancel failed — deal NOT cancelled to prevent stranded funds");
      res.status(502).json({ error: "Payment provider error — deal was not cancelled. Please try again or contact support." });
      return;
    }
  }

  const updated = await transitionDeal(
    deal.id,
    deal.version,
    deal.state,
    "cancelled",
    {},
    cancelActor,
    body.data.reason ?? "Cancelled by participant",
  );

  req.log.info({ dealId: deal.id }, "Deal cancelled");

  void sendDealCancelledEmail(
    { id: deal.id, title: deal.title, amountNzd: deal.amountNzd, totalNzd: deal.totalNzd, buyerEmail: deal.buyerEmail, sellerEmail: deal.sellerEmail, invoiceNumber: deal.invoiceNumber },
    body.data.reason,
  );

  res.json(GetDealResponse.parse(dealToResponse(updated)));
});

// ─── GET /deals/:dealId/messages ─────────────────────────────
router.get("/deals/:dealId/messages", requireAuth, async (req, res): Promise<void> => {
  const params = GetDealParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const email = sessionEmail(req);
  if (!email) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, params.data.dealId));
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  const isParticipant =
    deal.buyerEmail.toLowerCase() === email.toLowerCase() ||
    deal.sellerEmail.toLowerCase() === email.toLowerCase();
  if (!isParticipant) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const messages = await db
    .select()
    .from(dealMessagesTable)
    .where(eq(dealMessagesTable.dealId, deal.id))
    .orderBy(dealMessagesTable.createdAt);

  res.json(messages);
});

// ─── POST /deals/:dealId/messages ────────────────────────────
router.post("/deals/:dealId/messages", requireAuth, sendMessageLimiter, async (req, res): Promise<void> => {
  const params = GetDealParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = SendDealMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const email = sessionEmail(req);
  if (!email) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, params.data.dealId));
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  const isParticipant =
    deal.buyerEmail.toLowerCase() === email.toLowerCase() ||
    deal.sellerEmail.toLowerCase() === email.toLowerCase();
  if (!isParticipant) {
    res.status(403).json({ error: "Access denied — only deal participants can message" });
    return;
  }

  const senderEmail = body.data.senderEmail;
  // Verify the request sender matches the session user
  if (senderEmail.toLowerCase() !== email.toLowerCase()) {
    res.status(403).json({ error: "Sender email must match your session" });
    return;
  }

  const msgId = `msg_${randomUUID()}`;

  const [message] = await db
    .insert(dealMessagesTable)
    .values({
      id: msgId,
      dealId: deal.id,
      senderEmail,
      content: body.data.content,
    })
    .returning();

  req.log.info({ dealId: deal.id, msgId }, "Deal message sent");

  // Fire-and-forget email notification to the other party
  void sendNewMessageEmail(
    { id: deal.id, title: deal.title, amountNzd: deal.amountNzd, totalNzd: deal.totalNzd, buyerEmail: deal.buyerEmail, sellerEmail: deal.sellerEmail },
    senderEmail,
    body.data.content,
  );

  res.status(201).json(message);
});

export default router;
