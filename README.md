# SafeSend

NZ-native marketplace escrow platform. Buyers and sellers on Facebook Marketplace, TradeMe, or local communities create a "deal" — the buyer pays into escrow, funds release only after delivery is confirmed.

## Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces |
| Frontend | React + Vite + Tailwind CSS + shadcn/ui |
| Backend | Express 5 + TypeScript |
| Database | PostgreSQL + Drizzle ORM |
| Payments | Stripe Connect Express + Payment Element |
| Email | Resend (magic-link auth) |
| Tracking | TrackingMore |
| Sessions | express-session (cookie, 7-day TTL) |

## Getting Started

### Prerequisites

- Node.js 24+
- pnpm 9+
- PostgreSQL (or a Supabase project)
- Stripe account

### Install

```bash
pnpm install
```

### Configure

Copy `.env.example` to `artifacts/api-server/.env` and fill in your keys:

```
DATABASE_URL=postgresql://...
SESSION_SECRET=<random 64-char string>
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
APP_BASE_URL=http://localhost:3000
ADMIN_EMAILS=you@example.com
```

Copy `.env.example` to `artifacts/safesend/.env`:

```
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### Run (development)

```bash
# Terminal 1 — API server (with live Stripe webhook forwarding)
cd artifacts/api-server
stripe listen --forward-to localhost:5000/api/webhooks/stripe &
node --env-file=.env --enable-source-maps ./dist/index.mjs

# Terminal 2 — Frontend
cd artifacts/safesend
pnpm run dev
```

### Build

```bash
# API server
cd artifacts/api-server && node build.mjs

# Frontend
pnpm run build
```

### Test

```bash
pnpm run test
```

## Key Features

- **Deal state machine** — `created → funded → shipped → delivered → complete` (+ disputed / cancelled / refunded)
- **NZD $2,500 per-deal cap** — larger deals redirected to Escrow.com
- **4% buyer fee, $5 minimum** — deal minimum $5 NZD
- **Magic-link email auth** — no passwords; links valid 30 min, single-use
- **Stripe Connect Express** — seller onboarding, direct transfers, automatic refunds
- **Optimistic concurrency** — `version` column prevents double-spend race conditions
- **48h shipment verification** — flags deals with no courier scan; buyer can cancel
- **48h auto-release** — funds release automatically after confirmed delivery
- **Auto-cancel / auto-refund** — scheduled jobs handle unpaid, unshipped, and expired dispute states
- **Public tracking page** — `/track/:dealId` requires no login
- **Admin console** — `/admin` for dispute resolution, protected by `ADMIN_EMAILS`

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | express-session signing key |
| `STRIPE_SECRET_KEY` | Yes | Stripe API |
| `STRIPE_WEBHOOK_SECRET` | Yes (prod) | Stripe webhook HMAC |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Yes | Stripe.js Payment Element |
| `RESEND_API_KEY` | No | Magic-link email delivery (logs to console if absent) |
| `EMAIL_FROM` | No | From address (default: `SafeSend <noreply@safesend.nz>`) |
| `APP_BASE_URL` | No | Base URL for magic links |
| `TRACKINGMORE_API_KEY` | No | Courier tracking registration |
| `ADMIN_EMAILS` | Yes (prod) | Comma-separated admin email addresses |

## Compliance Notes

- Stripe Connect Express rails = lighter regulatory posture (tech platform, not money services business)
- FSP registration + DRS membership required before live transactions in NZ
- Basic AML programme required (Stripe KYC alone is not sufficient)
- Dispute SLA target: 3–5% of deals, manual admin triage

## License

Private — SafeSend NZ Ltd. All rights reserved.
