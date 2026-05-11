# SafeSend — Marketplace Escrow

## Overview

SafeSend is a NZ-native marketplace escrow web app (PWA) that lets strangers safely transact secondhand goods. Buyers and sellers on Facebook Marketplace, Instagram, or local communities create a "deal", the buyer pays into escrow, funds release only after delivery is confirmed.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui (at `/`)
- **API framework**: Express 5 (at `/api`)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (ESM bundle for API server)
- **Payments**: Stripe (PaymentIntents + Connect Express + Stripe.js Payment Element)
- **Email**: Resend (magic-link auth emails; falls back to console log if `RESEND_API_KEY` absent)
- **Sessions**: express-session (cookie-based, 7-day TTL)

## Key Features

- **URL-based pre-population**: Share links like `/?title=Gibson+Les+Paul&amount=850` to pre-fill deal creation
- **Deal state machine**: created → funded → shipped → delivered → complete (+ disputed, cancelled, refunded)
- **$2,500 NZD per-deal cap** — larger deals redirected to Escrow.com
- **4% buyer fee, $5 minimum** fee structure; deal minimum is $5 NZD
- **TrackingMore registration on mark-shipped** — `POST /v4/trackings` registers parcel; non-fatal on error
- **48h shipment-verification job** — `verifyShipments()` every 6h; flags deals with no courier scan; buyer can cancel flagged deals
- **48h auto-release job** — `autoReleaseDelivered()` every hour; uses same `releaseDealFunds` helper as manual route; idempotency key prevents double-transfer
- **Auto-cancel unpaid** — `autoCancelUnpaid()` every hour; cancels deals where state='created' and pay_by_deadline (7 days) has passed
- **Auto-refund unshipped** — `autoRefundUnshipped()` every hour; full Stripe refund where state='funded' and ship_by_deadline (5 business days) has passed
- **Auto-refund expired dispute** — `autoRefundExpiredDispute()` every hour; full Stripe refund where state='disputed' and dispute_resolve_by (14 days) has passed
- **TrackingMore + AfterShip webhooks** — HMAC-validated, idempotent, upserts tracking events; flips `shipmentVerificationStatus` to `verified` on first checkpoint
- **Real Stripe SDK** — `stripe.paymentIntents.create`, `stripe.transfers.create`, `stripe.refunds.create`
- **Real Stripe Connect Express** seller onboarding (`stripe.accounts.create` + `stripe.accountLinks.create`)
- **Stripe Payment Element** — embedded in `PaymentModal` component (requires `VITE_STRIPE_PUBLISHABLE_KEY`)
- **Optimistic concurrency** — deals `version` column, retry on 0-rows-updated
- **Canonical state machine** in `lib/state-machine.ts` — all transitions validated centrally
- **Courier slug whitelist** — `ALLOWED_COURIER_SLUGS` in `deal-helpers.ts`; unknown couriers rejected at mark-shipped
- **Magic-link email auth** — `POST /api/auth/request-link`, `POST /api/auth/verify`, `GET /api/auth/me`, `POST /api/auth/logout`
- **Admin console** at `/admin` for dispute resolution — protected by `requireAuth` + `requireAdmin` (ADMIN_EMAILS env var, comma-separated)
- **Public tracking page** at `/track/:dealId` — no auth required

## Required Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `SESSION_SECRET` | Replit secret | express-session signing |
| `STRIPE_WEBHOOK_SECRET` | Replit secret | Webhook HMAC validation |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Replit secret (frontend) | Stripe.js Payment Element |
| `ADMIN_EMAILS` | Env (required in production) | Comma-separated list of admin emails |
| `RESEND_API_KEY` | Optional Replit secret | Magic-link email delivery |
| `EMAIL_FROM` | Optional env | From address (default: `SafeSend <noreply@safesend.nz>`) |
| `APP_BASE_URL` | Optional env | Base URL for magic links in emails |
| `TRACKINGMORE_API_KEY` | Optional env | TrackingMore courier tracking registration |

> Without `VITE_STRIPE_PUBLISHABLE_KEY` the Payment Element shows a setup-required message. Without `RESEND_API_KEY` magic links are printed to the API server console.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm run test` — run all API server tests (134 tests)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Database Tables

- `deals` — escrow transactions with state machine (`version` column for optimistic concurrency; `shipmentVerificationStatus`: pending/verified/flagged; deadline columns: `pay_by_deadline`, `ship_by_deadline`, `dispute_resolve_by`, `disputed_at`)
- `state_transitions` — audit trail of all state changes
- `sellers` — seller Stripe Connect account records
- `tracking_events` — AfterShip/TrackingMore delivery events per deal
- `idempotency_keys` — webhook idempotency deduplication
- `magic_link_tokens` — one-time auth tokens (30-min expiry, single-use)

## Routes

### Frontend (React)
- `/` — Landing page + value prop
- `/login` — Magic-link sign-in page
- `/auth/verify` — Token verification redirect handler
- `/deals/new` — Create deal (supports URL query params: title, amount, description, buyerEmail, sellerEmail)
- `/deals` — My deals list (filter by email)
- `/deals/:id` — Deal detail + state machine actions (PaymentModal, ShipModal with courier dropdown)
- `/track/:dealId` — Public shipment tracking
- `/seller/onboard` — Stripe Connect onboarding
- `/seller/status` — Seller verification status
- `/admin` — Admin dashboard (protected by simple key gate)
- `/admin/deals/:id` — Admin dispute resolution

### API (Express)
- `POST /api/auth/request-link` — Send magic-link email
- `POST /api/auth/verify` — Validate token, create session
- `GET /api/auth/me` — Current session info
- `POST /api/auth/logout` — Destroy session
- `POST /api/deals` — Create deal
- `GET /api/deals` — List deals by email
- `GET /api/deals/:id` — Get deal
- `POST /api/deals/:id/confirm-payment` — Buyer initiates payment (returns `clientSecret`)
- `POST /api/deals/:id/mark-shipped` — Seller marks shipped (validates courier slug)
- `POST /api/deals/:id/release-funds` — Buyer releases to seller
- `POST /api/deals/:id/dispute` — Raise dispute
- `POST /api/deals/:id/cancel` — Cancel deal
- `GET /api/deals/:id/tracking` — Get tracking events
- `POST /api/seller/onboard` — Start Stripe Connect
- `GET /api/seller/status` — Check seller status
- `GET /api/admin/deals` — Admin: list all deals
- `POST /api/admin/deals/:id/resolve-dispute` — Admin: resolve dispute
- `GET /api/admin/stats` — Admin: dashboard stats
- `POST /api/webhooks/aftership` — AfterShip tracking webhook
- `POST /api/webhooks/trackingmore` — TrackingMore tracking webhook (flips verification status on first checkpoint)
- `POST /api/webhooks/stripe` — Stripe payment webhook

## Test Infrastructure

- All 198 tests pass (unit 96, security 40 [+10 audit findings], integration 62)
- `TEST_BYPASS_AUTH=1` in `.env.test` — all suites except `authorization.test.ts` run with auth bypassed
- `authorization.test.ts` temporarily sets `TEST_BYPASS_AUTH=0` to enforce real session checks; restores after
- `createSession(email)` helper in `test/helpers/app.ts` — inserts token → POST /auth/verify → returns cookie
- `fileParallelism: false` + `singleFork: true` in vitest config prevent DB race conditions

## Compliance Notes (from product design)
- Stripe Connect Express rails = lighter regulatory posture (tech platform, not money services business)
- FSP registration + DRS membership needed before live transactions
- Basic AML program required (Stripe KYC alone not sufficient)
- Dispute SLA target: 3-5% of deals, manual admin triage

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
