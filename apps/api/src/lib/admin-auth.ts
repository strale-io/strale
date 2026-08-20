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

/**
 * Minimum ADMIN_SECRET length (WP0 §3, CR-10).
 *
 * A single static bearer token guards every admin surface, including
 * `/v1/admin/external-transactions`, which returns raw customer transaction
 * input and output. Before this floor a one-character ADMIN_SECRET was
 * accepted — while AUDIT_HMAC_SECRET next door has enforced >= 32 since
 * F-0-001. This aligns the two.
 *
 * Verified read-only against production before landing: the deployed
 * ADMIN_SECRET is 64 characters, so this floor is satisfied and cannot lock
 * operators out or crash the boot.
 */
export const ADMIN_SECRET_MIN_LENGTH = 32;

/**
 * True when the given secret exists and meets the strength floor.
 *
 * The argument is required rather than defaulted to ADMIN_SECRET: with a
 * default, `isAdminSecretUsable(undefined)` would silently fall back to the
 * configured env value and report a weak/absent secret as usable.
 */
export function isAdminSecretUsable(secret: string | undefined): boolean {
  return typeof secret === "string" && secret.length >= ADMIN_SECRET_MIN_LENGTH;
}

/**
 * Constant-time compare against `Bearer <ADMIN_SECRET>`.
 *
 * Fails closed on a weak secret: a short ADMIN_SECRET is treated as
 * misconfiguration, not as a usable credential, so a guessable value cannot
 * authenticate even if the caller supplies it correctly.
 */
export function isValidAdminAuth(auth: string | undefined): boolean {
  if (!auth || !ADMIN_SECRET) return false;
  if (!isAdminSecretUsable(ADMIN_SECRET)) return false;
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
  if (!ADMIN_SECRET || !isAdminSecretUsable(ADMIN_SECRET)) {
    // Fail closed if the secret is unset OR too weak to be a credential —
    // never serve admin content on a misconfigured deploy.
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
