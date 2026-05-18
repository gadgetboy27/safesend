import express, { type Express, type Request, type Response, type NextFunction } from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import pinoHttp from "pino-http";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger";

// Webhook routes need the raw body BEFORE JSON parsing so HMAC signatures work.
// We import these directly to mount them with express.raw() first.
import webhookRouter from "./routes/webhooks";
import router from "./routes";

const app: Express = express();

// Trust Replit's reverse proxy so express-rate-limit can correctly identify
// clients from X-Forwarded-For headers rather than the proxy's internal IP.
app.set("trust proxy", 1);

// Canonical domain redirect — runs before all other middleware.
// Any request arriving on a non-canonical host is 301'd to safesend.nz.
// This covers all redirect domains (safesend.co.nz, sendsafe.nz, etc.)
// and the www.safesend.nz alias, all of which are pointed at Railway.
const CANONICAL_HOST = "safesend.nz";
app.use((req: Request, res: Response, next: NextFunction): void => {
  if (process.env.NODE_ENV !== "production") { next(); return; }
  // Skip redirect for health checks — Railway probes the container's internal
  // address so the host header is never "safesend.nz", but the probe must reach
  // the endpoint directly or the deployment fails in a boot-loop.
  if (req.path === "/api/healthz" || req.path === "/healthz") { next(); return; }
  const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.hostname;
  if (host && host !== CANONICAL_HOST) {
    res.redirect(301, `https://${CANONICAL_HOST}${req.url}`);
    return;
  }
  next();
});

// Security headers — must be first middleware so all responses are covered.
// In production: CSP blocks inline scripts and restricts asset origins.
// In development: CSP is relaxed so Vite HMR and devtools work without friction.
app.use(
  helmet({
    contentSecurityPolicy:
      process.env.NODE_ENV === "production"
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "https://js.stripe.com"],
              frameSrc: ["'self'", "https://js.stripe.com"],
              connectSrc: ["'self'", "https://api.stripe.com"],
              imgSrc: ["'self'", "data:", "https:"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              fontSrc: ["'self'", "data:"],
              objectSrc: ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// CORS: restrict to known origins only — never reflect arbitrary Origins with credentials.
// In production: set ALLOWED_ORIGINS=https://your-domain.com (comma-separated).
// REPLIT_DOMAINS is automatically set by the platform to the deployed app domains.
const configuredOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const replitOrigins = (process.env.REPLIT_DOMAINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((d) => `https://${d}`);
const allowedOrigins = [...configuredOrigins, ...replitOrigins];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no Origin (same-origin, curl, server-to-server)
      if (!origin) {
        callback(null, true);
        return;
      }
      // In development allow all localhost origins
      if (
        process.env.NODE_ENV !== "production" &&
        (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1"))
      ) {
        callback(null, true);
        return;
      }
      // In development with no allowlist configured, allow all origins so the
      // dev preview works without env-var setup. In production an empty allowlist
      // is treated as deny-all to prevent credential leakage to arbitrary origins.
      if (process.env.NODE_ENV !== "production" && allowedOrigins.length === 0) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // Do NOT pass an Error — that would short-circuit to the 500 handler before
        // the CSRF middleware can send a proper 403.  Passing `false` instructs the
        // cors library to omit the Access-Control-Allow-Origin header (browsers will
        // block the response) while still calling next() so downstream middleware runs.
        callback(null, false);
      }
    },
    credentials: true,
  }),
);

// CSRF origin check — guards all state-changing non-webhook routes.
//
// Browser-sent cross-origin requests (including same-site sibling origins like
// another *.replit.app app) always include an `Origin` header. Server-to-server
// callers (Stripe, TrackingMore, curl) do not. If an `Origin` header is present
// we require it to be in our explicit allowlist, preventing forged form POSTs
// from sibling same-site origins that would otherwise carry the session cookie.
//
// This check runs BEFORE the session middleware so that rejected requests
// never touch the session store (avoids any session-save interaction on 403).
// The allowlist is re-read from env vars per-request so tests can override it
// without restarting the process.
app.use((req: Request, res: Response, next: NextFunction): void => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }

  // Webhook routes authenticate via HMAC signatures — skip CSRF check there.
  if (req.path.startsWith("/api/webhooks")) {
    next();
    return;
  }

  const origin = req.headers["origin"] as string | undefined;

  // No Origin header: same-origin browser navigation, curl, or server-to-server → allow.
  if (!origin) {
    next();
    return;
  }

  // Re-read allowlist from env so tests and hot-reload work without restart.
  const csrfAllowedOrigins = [
    ...(process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    ...(process.env.REPLIT_DOMAINS ?? "").split(",").map((s) => s.trim()).filter(Boolean).map((d) => `https://${d}`),
  ];

  // Dev: always allow localhost origins.
  if (
    process.env.NODE_ENV !== "production" &&
    (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1"))
  ) {
    next();
    return;
  }

  // Dev: if no allowlist is configured, allow all origins (mirrors CORS behaviour).
  if (process.env.NODE_ENV !== "production" && csrfAllowedOrigins.length === 0) {
    next();
    return;
  }

  if (csrfAllowedOrigins.includes(origin)) {
    next();
    return;
  }

  res.setHeader("Content-Type", "application/json");
  res.statusCode = 403;
  res.end(JSON.stringify({ error: "Forbidden: request origin not allowed" }));
});

// Session middleware — must come before routes that use req.session.
// SESSION_SECRET is validated by checkStartupRequirements() in index.ts — the server
// will hard-exit before accepting any traffic if the secret is missing or is still
// the insecure dev fallback value.
//
// Store: connect-pg-simple persists sessions to the "session" table in Postgres.
// This means sessions survive server restarts and work correctly across multiple
// processes. The MemoryStore default is explicitly NOT used (it leaks memory in
// production and wipes all sessions on restart).
const PgSession = ConnectPgSimple(session);
const sessionSecret = process.env.SESSION_SECRET ?? "dev-secret-change-in-production";
app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: sessionSecret,
    name: "sid",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }),
);

// Raw-body middleware for webhook routes — MUST come before express.json()
app.use(
  "/api/webhooks",
  express.raw({ type: "application/json" }),
  webhookRouter,
);

// JSON body parser for all other routes.
// express.urlencoded() is intentionally omitted: this API is JSON-only, and
// accepting form-encoded bodies would widen the CSRF attack surface unnecessarily.
app.use(express.json());

app.use("/api", router);

// In production, serve the compiled React SPA for all non-API routes.
// The build step compiles safesend into artifacts/safesend/dist/public,
// and the Express process is started from the workspace root, so cwd() works.
if (process.env.NODE_ENV === "production") {
  const spaDir = path.join(process.cwd(), "artifacts/safesend/dist/public");
  app.use(express.static(spaDir));
  // SPA fallback: serve index.html for any unmatched route (client-side routing).
  // app.use() avoids path-to-regexp so bare wildcards aren't needed (Express 5 compat).
  app.use((_req: Request, res: Response): void => {
    res.sendFile(path.join(spaDir, "index.html"));
  });
}

// Global error handler — must be registered last.
// Catches any error thrown or passed to next() from route handlers.
// Without this, Express's default handler would return full stack traces in the response body.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "An unexpected error occurred" });
});

export default app;
