import { defineConfig } from "vitest/config";
import { resolve } from "path";
import { config as loadDotenv } from "dotenv";

// Load .env.test at config time so process.env is populated before any
// module is imported. This is necessary because ES module imports are hoisted
// and stripe.ts initialises the Stripe client at module load — we must set
// STRIPE_SECRET_KEY to the test key BEFORE that happens, overriding any
// Replit-injected production secret.
const testEnv = loadDotenv({ path: resolve(__dirname, ".env.test"), processEnv: {} });

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Inject .env.test values ahead of every test worker so the Stripe client
    // and other module-level singletons initialise with test credentials.
    env: testEnv.parsed ?? {},
    // Run test files sequentially to avoid DB race conditions between suites.
    // Each suite does beforeEach resetDb — concurrent files would wipe each other's data.
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: {
        maxForks: 1,
        minForks: 1,
      },
    },
    retry: 0,
  },
  resolve: {
    alias: {
      "@workspace/db": resolve(__dirname, "../../lib/db/src/index.ts"),
      "@workspace/api-zod": resolve(__dirname, "../../lib/api-zod/src/index.ts"),
    },
  },
});
