import { rateLimit } from "express-rate-limit";

/**
 * 20 magic-link requests per IP per hour.
 * Prevents inbox-flooding and Resend quota abuse.
 */
export const authRequestLinkLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many sign-in requests from this IP. Please try again in an hour." },
  skip: () => process.env.TEST_BYPASS_AUTH === "1",
});

/**
 * 10 deal creations per IP per hour.
 * Prevents DB pollution and email spam from unauthenticated attackers.
 */
export const createDealLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many deals created from this IP. Please try again later." },
  skip: () => process.env.TEST_BYPASS_AUTH === "1",
});

/**
 * 20 messages per IP per minute on deal threads.
 * Prevents message spam from authenticated users.
 */
export const sendMessageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many messages. Please slow down." },
  skip: () => process.env.TEST_BYPASS_AUTH === "1",
});

/**
 * 5 dispute raises per IP per hour.
 * Prevents dispute spam.
 */
export const raiseDisputeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many dispute requests from this IP. Please try again later." },
  skip: () => process.env.TEST_BYPASS_AUTH === "1",
});

/**
 * 5 OTP send requests per IP per hour.
 * Prevents Twilio SMS cost abuse and phone number enumeration.
 */
export const phoneVerifySendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many verification requests. Please try again in an hour." },
  skip: () => process.env.TEST_BYPASS_AUTH === "1",
});

/**
 * 10 OTP confirm attempts per IP per hour.
 * Prevents brute-force of 6-digit codes (1,000,000 combos, this limits to 10 guesses/hr).
 */
export const phoneVerifyConfirmLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many verification attempts. Please try again in an hour." },
  skip: () => process.env.TEST_BYPASS_AUTH === "1",
});

/**
 * 30 public tracking requests per IP per 5 minutes.
 * The public tracking page is intentionally unauthenticated but it must not
 * allow anonymous callers to drive unlimited outbound TrackingMore API calls.
 * 30 req / 5 min covers normal browser polling (every 5 min per page) for up
 * to ~30 open tabs before throttling kicks in.
 */
export const publicTrackingLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many tracking requests from this IP. Please try again in a few minutes." },
  skip: () => process.env.TEST_BYPASS_AUTH === "1",
});
