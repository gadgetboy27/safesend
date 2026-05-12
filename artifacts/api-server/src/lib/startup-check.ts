import { logger } from "./logger";

const DEV_FALLBACK_SECRET = "dev-secret-change-in-production";

export function checkStartupRequirements(): void {
  const isProduction = process.env.NODE_ENV === "production";
  const errors: string[] = [];

  if (!process.env.NODE_ENV) {
    errors.push(
      "NODE_ENV is not set. Set NODE_ENV=production on the deployed server. " +
      "Without it, dev-mode shortcuts are active in production: magic links are " +
      "returned in API responses and CORS allows all origins.",
    );
  }

  if (isProduction && process.env.TEST_BYPASS_AUTH === "1") {
    errors.push("TEST_BYPASS_AUTH=1 is set in a production environment — this disables all authentication.");
  }

  if (!process.env.SESSION_SECRET) {
    errors.push("SESSION_SECRET is not set.");
  } else if (process.env.SESSION_SECRET === DEV_FALLBACK_SECRET) {
    errors.push(`SESSION_SECRET is still the dev fallback value ("${DEV_FALLBACK_SECRET}"). Set a strong random secret.`);
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    if (isProduction) {
      errors.push(
        "STRIPE_WEBHOOK_SECRET is not set. Without this, all Stripe payment webhooks will " +
        "return 500 and deals will never advance to funded state.",
      );
    } else {
      logger.warn(
        "STRIPE_WEBHOOK_SECRET is not set — payment webhooks will fail. " +
        "Run `stripe listen --forward-to localhost:5001/api/webhooks/stripe` to get a test secret.",
      );
    }
  }

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) {
    if (isProduction) {
      errors.push(
        "Twilio credentials incomplete (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID). " +
        "Phone verification is required for buyer protection — payments will be blocked without it.",
      );
    } else {
      logger.warn(
        "Twilio Verify not configured — phone OTP is in dev-bypass mode (code 000000 accepted). " +
        "Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID before going live.",
      );
    }
  }

  if (!process.env.APP_BASE_URL && !process.env.APP_URL) {
    logger.warn(
      "Neither APP_BASE_URL nor APP_URL is set — " +
      "deal links in transactional emails will be broken relative paths. " +
      "Set APP_BASE_URL=https://yourdomain.com in Replit Secrets.",
    );
  }

  if (isProduction) {
    const adminEmails = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    if (adminEmails.length === 0) {
      errors.push(
        "ADMIN_EMAILS is not set in production. Set it to a comma-separated list of admin email addresses.",
      );
    }
  }

  if (errors.length > 0) {
    for (const msg of errors) {
      logger.error(`STARTUP CHECK FAILED: ${msg}`);
    }
    throw new Error(`Server refused to start due to ${errors.length} configuration error(s). See logs above.`);
  }

  logger.info("Startup checks passed.");
}
