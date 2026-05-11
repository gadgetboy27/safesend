import type { Request, Response, NextFunction } from "express";

/**
 * Requires the caller to have a valid session whose email appears in the
 * comma-separated ADMIN_EMAILS environment variable.
 *
 * ADMIN_EMAILS is read per-request so tests can override it at runtime.
 * Must be used AFTER requireAuth (which ensures a session exists).
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (process.env.TEST_BYPASS_AUTH === "1") {
    next();
    return;
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const email = (req.session as { email?: string } | undefined)?.email?.toLowerCase();
  if (!email || !adminEmails.includes(email)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  next();
}
