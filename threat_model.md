# Threat Model

## Project Overview

SafeSend is a React + Vite single-page web app with an Express 5 API and PostgreSQL/Drizzle backend for marketplace escrow transactions. Buyers and sellers create deals, fund them via Stripe, track shipping through TrackingMore/AfterShip integrations, and admins resolve disputes; production scope is the `artifacts/api-server`, `artifacts/safesend`, and shared `lib/*` packages, while `artifacts/mockup-sandbox` is dev-only and should be ignored unless production reachability is demonstrated.

Production assumptions for future scans:
- `NODE_ENV` is `production` in deployed environments.
- Replit deployment provides TLS termination for client/server traffic.
- Secrets are expected to come from environment variables / Replit Secrets, not source control.
- The mockup sandbox is not deployed to production.

## Assets

- **User accounts and sessions** — magic-link tokens, authenticated session cookies, and user email identities. Compromise allows deal takeover, payment release, dispute actions, seller onboarding, and admin-console access.
- **Deal and escrow records** — titles, descriptions, buyer/seller emails, deal states, dispute notes, amounts, tracking numbers, and Stripe identifiers. This is both PII and business-sensitive transaction data.
- **Payment capabilities** — Stripe PaymentIntent identifiers, Stripe Connect seller accounts, transfer/refund paths, and webhook trust. Abuse can release escrow to the wrong party, block refunds, or cause financial loss.
- **Shipping/tracking data** — courier slugs, tracking numbers, delivery status, and tracking events pulled from external providers. Exposure reveals logistics details; abuse can influence release timing or create third-party API cost.
- **Application secrets** — session secret, Stripe webhook secret, TrackingMore/AfterShip HMAC secrets, API keys, and admin email allowlist. Exposure can undermine authentication or webhook authenticity.
- **Administrative authority** — dispute resolution and global deal/stats access under `/api/admin/*`. Compromise exposes all deals and allows privileged state changes.

## Trust Boundaries

- **Browser to API** — all client input is untrusted, including query params, request bodies, and cross-origin requests. Every protected endpoint must authenticate the caller and enforce authorization server-side.
- **Public to authenticated user boundary** — public pages like `/`, `/login`, `/auth/verify`, and `/track/:dealId` are intentionally exposed, but deal-management, seller, and admin actions must not rely on client-side role checks or URL parameters.
- **Authenticated user to admin boundary** — admin APIs are mounted under `/api/admin/*` and require both a valid session and membership in `ADMIN_EMAILS`.
- **API to PostgreSQL** — API handlers have direct access to deal, seller, token, idempotency, and audit tables. Query scoping and update semantics are critical to prevent data exposure or privilege escalation.
- **API to Stripe** — the server creates payment intents, onboarding links, refunds, and transfers, and trusts signed Stripe webhooks to mutate deal state.
- **API to shipping providers** — the server registers shipments and consumes TrackingMore/AfterShip webhooks and read APIs. Authenticity, idempotency, and abuse control matter because these integrations can alter delivery state.

## Scan Anchors

- **Production entry points:** `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/*`, `artifacts/safesend/src/App.tsx`.
- **Highest-risk code areas:** `artifacts/api-server/src/routes/deals.ts`, `routes/auth.ts`, `routes/webhooks.ts`, `routes/admin.ts`, `routes/tracking.ts`, `routes/sellers.ts`, plus `artifacts/api-server/src/lib/{release-deal-funds,sync-tracking,email}.ts`.
- **Public surfaces:** `GET /api/healthz`, `POST /api/auth/*`, unauthenticated/public deal and tracking reads, provider webhooks, and frontend `/track/:dealId`.
- **Authenticated surfaces:** deal creation and state-changing deal routes, seller onboarding/status, current-session lookup, logout.
- **Admin surfaces:** `/api/admin/deals`, `/api/admin/deals/:dealId/resolve-dispute`, `/api/admin/stats`.
- **Usually dev-only:** `artifacts/mockup-sandbox/**`, test helpers, and code paths guarded only for tests.

## Threat Categories

### Spoofing

Authentication relies on emailed magic links and a cookie-backed session. The system must ensure login links are one-time, time-bounded, and not reusable across concurrent requests, and every protected route must bind actions to the authenticated session rather than trusting client-supplied identities.

Webhook endpoints also cross a spoofing boundary. Stripe, TrackingMore, and AfterShip callbacks must reject unsigned or incorrectly signed requests and should fail closed when authenticity material is configured for production.

### Tampering

Deal state transitions, shipment verification, cancellations, refunds, and fund release are business-critical transitions. The application must calculate and enforce these transitions server-side, validate every actor against the relevant deal participant/admin role, and ensure external callbacks cannot move deals into privileged states without authentic evidence.

User-controlled inputs such as deal IDs, email filters, tracking numbers, courier slugs, return URLs, and dispute text must never let an attacker alter another party’s deal or influence downstream service calls beyond the intended record. Shipment callbacks are especially sensitive: provider events must be correlated to a unique deal-specific shipment binding, not just a bare tracking number that could be reused across deals or couriers.

### Information Disclosure

Deal APIs expose sensitive transaction data: buyer/seller emails, pricing, tracking numbers, dispute reasons, timestamps, and payment identifiers. Public pages and unauthenticated API routes must not leak non-public deal records, and responses should be minimized to the least data needed for each caller.

Logs, error bodies, API responses, and outbound notification templates must avoid exposing secrets, raw provider errors, or unnecessary financial identifiers. Public tracking should reveal only the minimum shipment information needed for the share link use case, and user-controlled strings included in emails or other notifications must be escaped so trusted platform messages cannot be repurposed for phishing.

### Denial of Service

Public endpoints such as auth request-link, public tracking, and any route that fans out to Stripe or shipping providers can be abused for cost amplification or service degradation. The system must rate-limit internet-facing endpoints proportionally to cost and prevent unauthenticated traffic from repeatedly triggering expensive third-party calls.

Background jobs and webhook processing should be idempotent and resilient so duplicate or bursty traffic does not create repeated transfers, refunds, or event ingestion storms. Public tracking views are a special hot path: page refreshes or auto-polling must not translate directly into unbounded paid provider API calls.

### Elevation of Privilege

The main privilege boundaries are public vs authenticated deal access and authenticated vs admin dispute resolution. The backend must not rely on client-side email prompts, URL parameters, or frontend route gating to determine who may view or mutate a deal. All deal reads and writes must be scoped to the authenticated participant unless a route is explicitly designed to be public and returns a reduced dataset.

Cross-origin browser requests are also relevant because cookie-backed auth is used. Production configuration must prevent arbitrary third-party origins from making authenticated reads or state-changing requests with a victim’s session, whether through CORS misconfiguration, classic CSRF, or same-site sibling-origin request forgery on shared hosting domains.
