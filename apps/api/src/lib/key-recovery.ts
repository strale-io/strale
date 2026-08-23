/**
 * The one authority for "is this API-key rotation authorized" (WP11, CR-10).
 *
 * `/v1/auth/recover` used to answer that question with "the caller typed an
 * email address that exists". On an unauthenticated request it rotated the
 * account's key immediately and mailed the replacement. Two distinct defects
 * shared one handler:
 *
 *   1. **Revocation denial-of-service.** Anyone who knew a customer's address
 *      could invalidate their working key, repeatedly. The customer's agents
 *      start returning 401 and nothing they can do prevents the next one. The
 *      2-per-5-minutes-per-IP limit bounds the rate, not the outcome — one
 *      request is already the whole attack, and the IP is the attacker's to
 *      change.
 *   2. **A reusable bearer secret delivered by email.** The mailed key is the
 *      credential, permanently, for anyone who reads that mailbox later or
 *      recovers it from a backup.
 *
 * The fix separates *requesting* from *rotating*. A request costs the account
 * nothing: the existing key keeps working. Only redeeming a token that was
 * delivered to the mailbox rotates anything, and that token is single-use,
 * short-lived, and not a credential for anything else.
 *
 * The token is stored hashed for the same reason the API key is: read access
 * to the table must not confer the ability to take over accounts.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";

import { apiKeyRecoveryTokens, users } from "../db/schema.js";
import { generateApiKey, getKeyPrefix, hashApiKey } from "./auth.js";

/** How long a recovery token stays redeemable. */
export const RECOVERY_TOKEN_TTL_MINUTES = 30;

/** 32 bytes → 64 hex characters. Brute force is not a threat model at this size. */
const TOKEN_BYTES = 32;

export function generateRecoveryToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

export function hashRecoveryToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time comparison of two normalised email strings.
 *
 * The confirm endpoint checks that the token belongs to the address the caller
 * named. That check is not a secret comparison — the token is the secret — but
 * doing it in variable time would leak, one byte at a time, which address a
 * captured token belongs to.
 */
export function emailsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a.trim().toLowerCase(), "utf8");
  const right = Buffer.from(b.trim().toLowerCase(), "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export interface IssuedRecoveryToken {
  token: string;
  expiresAt: Date;
}

/**
 * Issue a recovery token for a user.
 *
 * Previously-issued codes stay valid until they expire or are used, and there
 * is deliberately no per-user cap.
 *
 * Two earlier versions of this function both had a displacement primitive in
 * them, and the second one is the more interesting mistake. The first expired
 * every outstanding code on each request, so an attacker looping this
 * unauthenticated endpoint could kill a victim's code before they could paste
 * it, indefinitely. The replacement kept only the newest five — which evicts
 * the OLDEST, so five requests still displace the code the victim is holding,
 * and its own docstring claimed the opposite.
 *
 * The general shape: **any per-user cap on an unauthenticated write is a
 * displacement primitive.** Evict the oldest and a flood pushes the victim's
 * code out; evict the newest and a flood that arrives first blocks the victim
 * from getting one; refuse at the limit and the flood locks the account out
 * entirely. There is no eviction policy that an attacker who controls the
 * request rate cannot turn against the account.
 *
 * So the cap is gone. Table growth is bounded by the things that bound it
 * without touching a specific account's codes: a 30-minute TTL, the
 * 2-per-5-minutes-per-IP limiter, and the 7-day `db-retention` rule. Codes are
 * 256-bit and single-use, so several being live at once costs nothing.
 */
export async function issueRecoveryToken(
  db: any,
  params: { userId: string; ipHash: string | null; now?: Date },
): Promise<IssuedRecoveryToken> {
  const now = params.now ?? new Date();
  const expiresAt = new Date(now.getTime() + RECOVERY_TOKEN_TTL_MINUTES * 60 * 1000);
  const token = generateRecoveryToken();

  await db.insert(apiKeyRecoveryTokens).values({
    userId: params.userId,
    tokenHash: hashRecoveryToken(token),
    expiresAt,
    requestedIpHash: params.ipHash,
  });

  return { token, expiresAt };
}

export type RedeemResult =
  | { ok: true; userId: string; apiKey: string; keyPrefix: string }
  | { ok: false; reason: "invalid_or_expired" };

/**
 * Redeem a token and rotate the key, atomically.
 *
 * The single-use property is enforced by `SELECT … FOR UPDATE` on the token
 * row: two concurrent redemptions serialise on the lock, so one rotates and
 * the other sees `used_at` already set. Without the lock this shape would be a
 * check-then-act race producing two rotations, where the customer is emailed a
 * key the second redemption has already replaced.
 *
 * A deleted (Art. 17 redacted) account cannot be recovered into. Its key hash
 * was already burned on closure and its email replaced with a sentinel; a
 * token issued before closure must not resurrect access.
 */
export async function redeemRecoveryToken(
  db: any,
  params: { token: string; email: string; now?: Date },
): Promise<RedeemResult> {
  const now = params.now ?? new Date();
  const tokenHash = hashRecoveryToken(params.token);

  return await db.transaction(async (tx: any) => {
    // Locked, not yet claimed. The row lock is what makes this safe to split
    // into a check and a claim: two concurrent redemptions of the same token
    // serialise here, and the second one sees `used_at` already set.
    //
    // Splitting matters because the claim used to come first, so a caller who
    // typed a different address than the one the code was issued to burned the
    // code and had to start over. The token is single-use against successful
    // redemption, not against every attempt.
    const [row] = await tx
      .select({
        id: apiKeyRecoveryTokens.id,
        userId: apiKeyRecoveryTokens.userId,
      })
      .from(apiKeyRecoveryTokens)
      .where(
        and(
          eq(apiKeyRecoveryTokens.tokenHash, tokenHash),
          isNull(apiKeyRecoveryTokens.usedAt),
          // Expiry is decided by the DATABASE clock, not the caller's.
          // Comparing a stored timestamp against `new Date()` straddles two
          // clocks that are not the same clock — the database runs in its own
          // container — and measured skew here drifted about a second and a
          // half over fifteen seconds. Whichever way the skew points, a token
          // is then live or dead depending on which process asks.
          sql`${apiKeyRecoveryTokens.expiresAt} > now()`,
        ),
      )
      .for("update");

    if (!row) {
      return { ok: false as const, reason: "invalid_or_expired" as const };
    }

    const [user] = await tx
      .select({ id: users.id, email: users.email, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1);

    if (!user || user.deletedAt !== null || !emailsMatch(user.email, params.email)) {
      return { ok: false as const, reason: "invalid_or_expired" as const };
    }

    await tx
      .update(apiKeyRecoveryTokens)
      .set({ usedAt: now })
      .where(eq(apiKeyRecoveryTokens.id, row.id));

    const apiKey = generateApiKey();
    await tx
      .update(users)
      .set({
        apiKeyHash: hashApiKey(apiKey),
        keyPrefix: getKeyPrefix(apiKey),
        updatedAt: now,
      })
      .where(eq(users.id, user.id));

    return {
      ok: true as const,
      userId: user.id,
      apiKey,
      keyPrefix: getKeyPrefix(apiKey),
    };
  });
}


/**
 * Delete every recovery token belonging to a closing account.
 *
 * Runs inside the erasure transaction. `redeemRecoveryToken` already refuses a
 * redacted user, so this is not what stops a token resurrecting access — it is
 * what stops `user_id` and `requested_ip_hash` outliving the account whose
 * erasure response claims the IP hash was anonymised.
 */
export async function purgeRecoveryTokensOnClosure(
  tx: any,
  params: { userId: string },
): Promise<number> {
  const deleted = await tx
    .delete(apiKeyRecoveryTokens)
    .where(eq(apiKeyRecoveryTokens.userId, params.userId))
    .returning({ id: apiKeyRecoveryTokens.id });
  return deleted.length;
}
