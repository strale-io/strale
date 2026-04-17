/**
 * Shared admin-auth helper (F-0-003).
 *
 * Before Phase C three separate internal-*.ts files each copied the same
 * `isValidAdminAuth(auth)` helper. That duplication made it easy to use
 * a slightly different check in one place and miss the mismatch in code
 * review. This module is the single source of truth. Mount-level
 * middleware in app.ts calls `adminOnly`; per-handler callers (kept for
 * defence-in-depth) use `isValidAdminAuth`.
 */

import { timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import { apiError } from "./errors.js";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

/** Constant-time compare against `Bearer <ADMIN_SECRET>`. */
export function isValidAdminAuth(auth: string | undefined): boolean {
  if (!auth || !ADMIN_SECRET) return false;
  const expected = Buffer.from(`Bearer ${ADMIN_SECRET}`, "utf-8");
  const provided = Buffer.from(auth, "utf-8");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

/**
 * Hono middleware: 401 unless `Authorization: Bearer <ADMIN_SECRET>` is
 * present. Mount at the top of admin-only route trees.
 */
export const adminOnly = async (c: Context, next: Next): Promise<Response | void> => {
  if (!ADMIN_SECRET) {
    // Fail closed if the secret is unset — never serve admin content
    // on a misconfigured deploy.
    return c.json(
      apiError("unauthorized", "Admin endpoint is not configured."),
      503,
    );
  }
  if (!isValidAdminAuth(c.req.header("Authorization"))) {
    return c.json(apiError("unauthorized", "Admin authentication required."), 401);
  }
  return next();
};
