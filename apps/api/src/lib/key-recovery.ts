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
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";

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
 * Outstanding tokens for the same user are expired first, so a stream of
 * requests cannot accumulate a pile of simultaneously-valid tokens — the most
 * recent email is the only one that works, which is also what a user who
 * requested twice expects.
 */
export async function issueRecoveryToken(
  db: any,
  params: { userId: string; ipHash: string | null; now?: Date },
): Promise<IssuedRecoveryToken> {
  const now = params.now ?? new Date();
  const expiresAt = new Date(now.getTime() + RECOVERY_TOKEN_TTL_MINUTES * 60 * 1000);
  const token = generateRecoveryToken();

  await db.transaction(async (tx: any) => {
    await tx
      .update(apiKeyRecoveryTokens)
      .set({ expiresAt: now })
      .where(
        and(
          eq(apiKeyRecoveryTokens.userId, params.userId),
          isNull(apiKeyRecoveryTokens.usedAt),
          gt(apiKeyRecoveryTokens.expiresAt, now),
        ),
      );

    await tx.insert(apiKeyRecoveryTokens).values({
      userId: params.userId,
      tokenHash: hashRecoveryToken(token),
      expiresAt,
      requestedIpHash: params.ipHash,
    });
  });

  return { token, expiresAt };
}

export type RedeemResult =
  | { ok: true; userId: string; apiKey: string; keyPrefix: string }
  | { ok: false; reason: "invalid_or_expired" };

/**
 * Redeem a token and rotate the key, atomically.
 *
 * The single-use property is enforced by the conditional UPDATE, not by a
 * read-then-write: `WHERE used_at IS NULL AND expires_at > now` inside the
 * transaction means two concurrent redemptions of the same token produce one
 * rotation and one `invalid_or_expired`, rather than two rotations where the
 * customer is emailed a key that the second redemption already replaced.
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
    const [claimed] = await tx
      .update(apiKeyRecoveryTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(apiKeyRecoveryTokens.tokenHash, tokenHash),
          isNull(apiKeyRecoveryTokens.usedAt),
          gt(apiKeyRecoveryTokens.expiresAt, now),
        ),
      )
      .returning({ userId: apiKeyRecoveryTokens.userId });

    if (!claimed) return { ok: false as const, reason: "invalid_or_expired" as const };

    const [user] = await tx
      .select({ id: users.id, email: users.email, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, claimed.userId))
      .limit(1);

    if (!user || user.deletedAt !== null || !emailsMatch(user.email, params.email)) {
      return { ok: false as const, reason: "invalid_or_expired" as const };
    }

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
 * Delete spent and expired tokens. Nothing reads them after redemption, and a
 * table of hashes tied to user ids is not worth retaining indefinitely.
 */
export async function pruneRecoveryTokens(
  db: any,
  params: { olderThan?: Date } = {},
): Promise<number> {
  const cutoff = params.olderThan ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(apiKeyRecoveryTokens)
    .where(
      or(
        lt(apiKeyRecoveryTokens.expiresAt, cutoff),
        and(
          sql`${apiKeyRecoveryTokens.usedAt} IS NOT NULL`,
          lt(apiKeyRecoveryTokens.usedAt, cutoff),
        ),
      ),
    )
    .returning({ id: apiKeyRecoveryTokens.id });
  return deleted.length;
}
