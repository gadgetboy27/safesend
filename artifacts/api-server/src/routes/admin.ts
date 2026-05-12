import { Router, type IRouter } from "express";
import { eq, and, desc, count, sum } from "drizzle-orm";
import { db, dealsTable, stateTransitionsTable } from "@workspace/db";
import {
  AdminListDealsQueryParams,
  AdminListDealsResponse,
  ResolveDisputeParams,
  ResolveDisputeBody,
  GetAdminStatsResponse,
  GetDealResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { requireAuth } from "../middleware/requireAuth";
import { requireAdmin } from "../middleware/requireAdmin";
import { releaseDealFunds } from "../lib/release-deal-funds";
import { refundDeal } from "../lib/refund-deal";

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

// GET /admin/deals/:dealId/transitions — full audit trail for a deal
router.get("/admin/deals/:dealId/transitions", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { dealId } = req.params;
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, dealId));
  if (!deal) { res.status(404).json({ error: "Deal not found" }); return; }

  const transitions = await db
    .select()
    .from(stateTransitionsTable)
    .where(eq(stateTransitionsTable.dealId, dealId))
    .orderBy(stateTransitionsTable.createdAt);

  res.json({ deal: dealToResponse(deal), transitions });
});

router.get("/admin/deals", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const parsed = AdminListDealsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { status, disputed, page, limit } = parsed.data;
  const conditions = [];
  if (status) {
    conditions.push(eq(dealsTable.state, status as typeof dealsTable.$inferSelect["state"]));
  }
  if (disputed === true) {
    conditions.push(eq(dealsTable.state, "disputed"));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = ((page ?? 1) - 1) * (limit ?? 20);

  const [totalResult] = await db.select({ count: count() }).from(dealsTable).where(whereClause);
  const deals = await db
    .select()
    .from(dealsTable)
    .where(whereClause)
    .orderBy(desc(dealsTable.createdAt))
    .limit(limit ?? 20)
    .offset(offset);

  res.json(
    AdminListDealsResponse.parse({
      deals: deals.map(dealToResponse),
      total: totalResult.count,
      page: page ?? 1,
      limit: limit ?? 20,
    }),
  );
});

router.post(
  "/admin/deals/:dealId/resolve-dispute",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = ResolveDisputeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const body = ResolveDisputeBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, params.data.dealId));
    if (!deal) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }
    if (deal.state !== "disputed") {
      res.status(400).json({ error: "Deal is not in disputed state" });
      return;
    }

    const adminEmail = (req.session as { email?: string } | undefined)?.email ?? "admin";
    const triggeredBy = `admin:${adminEmail}`;

    if (body.data.resolution === "refund_buyer") {
      const result = await refundDeal(deal, triggeredBy, body.data.adminNote);
      if (!result.ok) {
        res.status(502).json({ error: `Stripe refund failed: ${result.error}. Deal remains in disputed state.` });
        return;
      }

      logger.info({ dealId: deal.id, resolution: body.data.resolution }, "Dispute resolved by admin");
      res.json(GetDealResponse.parse(dealToResponse(result.deal)));
      return;
    }

    if (body.data.resolution === "release_to_seller") {
      const result = await releaseDealFunds(deal, triggeredBy, body.data.adminNote);
      if (!result.ok) {
        res.status(502).json({ error: `Stripe transfer failed: ${result.error}. Deal remains in disputed state.` });
        return;
      }

      logger.info({ dealId: deal.id, resolution: body.data.resolution }, "Dispute resolved by admin");
      res.json(GetDealResponse.parse(dealToResponse(result.deal)));
      return;
    }

    res.status(400).json({ error: "Unknown resolution type" });
  },
);

router.get("/admin/stats", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  // Use SQL aggregations instead of loading all rows into memory (H2).
  const stateStats = await db
    .select({
      state: dealsTable.state,
      cnt: count(),
      volume: sum(dealsTable.amountNzd),
      fees: sum(dealsTable.feeNzd),
    })
    .from(dealsTable)
    .groupBy(dealsTable.state);

  const dealsByState: Record<string, number> = {};
  let totalVolumeNzd = 0;
  let totalFeeRevenueNzd = 0;
  let totalDeals = 0;
  let activeDeals = 0;
  let completedDeals = 0;
  let disputedDeals = 0;
  let cancelledDeals = 0;

  for (const row of stateStats) {
    const cnt = Number(row.cnt);
    const volume = Number(row.volume ?? 0);
    const fees = Number(row.fees ?? 0);
    dealsByState[row.state] = cnt;
    totalDeals += cnt;
    totalVolumeNzd += volume;
    if (row.state === "complete") {
      totalFeeRevenueNzd += fees;
      completedDeals = cnt;
    }
    if (["funded", "shipped", "delivered"].includes(row.state)) activeDeals += cnt;
    if (row.state === "disputed") disputedDeals = cnt;
    if (["cancelled", "refunded"].includes(row.state)) cancelledDeals += cnt;
  }

  res.json(
    GetAdminStatsResponse.parse({
      totalDeals,
      activeDeals,
      completedDeals,
      disputedDeals,
      cancelledDeals,
      totalVolumeNzd: Math.round(totalVolumeNzd * 100) / 100,
      totalFeeRevenueNzd: Math.round(totalFeeRevenueNzd * 100) / 100,
      dealsByState,
    }),
  );
});

export default router;
