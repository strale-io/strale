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
 * How many simultaneously-valid tokens one account may hold.
 *
 * The first version expired every outstanding token on each new request, on
 * the reasoning that the most recent email should be the only one that works.
 * That reasoning has an attacker in it: requesting a code is unauthenticated
 * and needs only the address, so anyone can loop the endpoint and kill the
 * victim's code before they can paste it — indefinitely. And `/v1/auth/api-key`
 * needs the key the victim has already lost, so there is no other path. The
 * flow this replaces revoked the key outright, so that would still have been
 * an improvement; it would also have been the same *class* of defect shipped
 * again, which is worse than being no better.
 *
 * Several concurrent codes cost nothing — each is single-use, 256-bit and
 * expires on its own — and the cap only stops the table growing without bound.
 * Oldest are expired first, so a flood cannot push a legitimate code out
 * faster than the flood's own codes leave.
 */
export const MAX_OUTSTANDING_TOKENS = 5;

/**
 * Issue a recovery token for a user.
 *
 * Previously-issued codes stay valid until they expire or are used. See
 * MAX_OUTSTANDING_TOKENS for why.
 */
export async function issueRecoveryToken(
  db: any,
  params: { userId: string; ipHash: string | null; now?: Date },
): Promise<IssuedRecoveryToken> {
  const now = params.now ?? new Date();
  const expiresAt = new Date(now.getTime() + RECOVERY_TOKEN_TTL_MINUTES * 60 * 1000);
  const token = generateRecoveryToken();

  await db.transaction(async (tx: any) => {
    // Keep the newest MAX-1, expire everything older, in ONE statement.
    //
    // The first version read the outstanding rows, computed the surplus in
    // JavaScript and wrote it back. That was intermittently off by one, and
    // the reason is worth keeping: the read and the write use the application
    // clock while `now()` inside the database uses the database's, and the two
    // are not the same clock — the database runs in its own container. A row
    // stamped "expires at `new Date()`" can still read as future to `now()`
    // milliseconds later. Doing the whole thing in SQL means one clock decides
    // both which rows are live and when they stop being live.
    await tx.execute(sql`
      UPDATE api_key_recovery_tokens
         SET expires_at = now() - interval '1 second'
       WHERE id IN (
         SELECT id
           FROM api_key_recovery_tokens
          WHERE user_id = ${params.userId}::uuid
            AND used_at IS NULL
            AND expires_at > now()
          ORDER BY created_at DESC
         OFFSET ${MAX_OUTSTANDING_TOKENS - 1}
       )
    `);

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
        usedAt: apiKeyRecoveryTokens.usedAt,
        expiresAt: apiKeyRecoveryTokens.expiresAt,
      })
      .from(apiKeyRecoveryTokens)
      .where(eq(apiKeyRecoveryTokens.tokenHash, tokenHash))
      .for("update");

    if (!row || row.usedAt !== null || row.expiresAt <= now) {
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
