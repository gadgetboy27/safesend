import type { Request, Response, NextFunction } from "express";

/**
 * Ensures the caller has a valid session (set by POST /api/auth/verify).
 *
 * Set TEST_BYPASS_AUTH=1 to skip in tests so the integration suite doesn't
 * need to spin up a full session for every request.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (process.env.TEST_BYPASS_AUTH === "1") {
    next();
    return;
  }

  const email = (req.session as { email?: string } | undefined)?.email;
  if (!email) {
    res.status(401).json({ error: "Authentication required. Please sign in via /api/auth/request-link" });
    return;
  }

  next();
}

/**
 * Returns the authenticated email from the session, or null if not logged in.
 * In test bypass mode, reads the email from the X-Test-Email header so
 * integration tests can simulate specific authenticated identities.
 */
export function sessionEmail(req: Request): string | null {
  if (process.env.TEST_BYPASS_AUTH === "1") {
    return (req.headers["x-test-email"] as string) ?? null;
  }
  return (req.session as { email?: string } | undefined)?.email ?? null;
}
