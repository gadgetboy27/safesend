/**
 * Test app helper.
 * Imports the production app.ts and exposes it for supertest.
 *
 * The helper sets up a minimal env so the imports don't throw at module load,
 * and clears DB tables between tests so suites don't pollute each other.
 */
import { config } from "dotenv";
// override: true ensures .env.test values win over Replit-injected production secrets
// so tests always run against the Stripe test-mode key.
config({ path: ".env.test", override: true });

// Sanity — fail fast if test env isn't configured
if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL not set. Create .env.test pointing at a SEPARATE database — tests truncate tables.",
  );
}
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY not set in .env.test");
}
if (!process.env.STRIPE_SECRET_KEY.startsWith("sk_test_")) {
  throw new Error(
    "STRIPE_SECRET_KEY in .env.test must be a test key (sk_test_...). Never use a live key for tests.",
  );
}
if (!process.env.STRIPE_WEBHOOK_SECRET) {
  throw new Error("STRIPE_WEBHOOK_SECRET not set in .env.test (any non-empty string is fine)");
}

// Point the production code at the test DB — must happen BEFORE app import
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

// Now safe to import — env is set
import app from "../../src/app";
import {
  db,
  dealsTable,
  stateTransitionsTable,
  sellersTable,
  trackingEventsTable,
  idempotencyKeysTable,
  magicLinkTokensTable,
} from "@workspace/db";
import { randomUUID } from "crypto";
import request from "supertest";

export { app };

/**
 * Truncate all tables. Run in beforeEach so tests are isolated.
 * Order matters — child tables first.
 */
export async function resetDb(): Promise<void> {
  await db.delete(stateTransitionsTable);
  await db.delete(trackingEventsTable);
  await db.delete(idempotencyKeysTable);
  await db.delete(magicLinkTokensTable);
  await db.delete(dealsTable);
  await db.delete(sellersTable);
}

/**
 * Creates a valid magic-link session for the given email.
 * Inserts a token into the DB, calls POST /api/auth/verify, returns the
 * session cookie string to pass as `.set("Cookie", cookie)` in supertest.
 *
 * Only works when TEST_BYPASS_AUTH is NOT "1" — auth tests temporarily set it to "0".
 */
export async function createSession(email: string): Promise<string> {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await db.insert(magicLinkTokensTable).values({ email, token, expiresAt });

  const res = await request(app).post("/api/auth/verify").send({ token });

  if (res.status !== 200) {
    throw new Error(`createSession: verify returned ${res.status}: ${JSON.stringify(res.body)}`);
  }

  const setCookie = res.headers["set-cookie"] as string[] | string | undefined;
  if (!setCookie) throw new Error("createSession: no Set-Cookie header in verify response");
  return Array.isArray(setCookie) ? setCookie[0] : setCookie;
}

export {
  db,
  dealsTable,
  stateTransitionsTable,
  sellersTable,
  trackingEventsTable,
  idempotencyKeysTable,
  magicLinkTokensTable,
};
