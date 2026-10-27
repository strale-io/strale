import { timingSafeEqual } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { apiKeys, users } from "../db/schema.js";
import { getKeyPrefix, hashApiKey } from "./auth.js";
import { logError } from "./log.js";
import { apiError, type ApiError } from "./errors.js";
import type { User } from "../types.js";
import type { WalletTx } from "./wallet-service.js";

function hashMatches(stored: string, supplied: string): boolean {
  const left = Buffer.from(stored, "utf-8");
  const right = Buffer.from(supplied, "utf-8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Both mandatory and optional auth use the same prefix + SHA-256 comparison. */
export async function authenticateApiKey(key: string): Promise<{
  user: User;
  apiKeyId: string | null;
} | null> {
  if (!key.startsWith("sk_live_")) return null;
  const db = getDb();
  const prefix = getKeyPrefix(key);
  const hash = hashApiKey(key);
  const primaryCandidates = await db.select().from(users).where(eq(users.keyPrefix, prefix));
  const primary = primaryCandidates.find((u) => !u.deletedAt && hashMatches(u.apiKeyHash, hash));
  if (primary) return { user: primary, apiKeyId: null };

  const candidates = await db.select({ key: apiKeys, user: users })
    .from(apiKeys).innerJoin(users, eq(apiKeys.userId, users.id))
    .where(and(eq(apiKeys.keyPrefix, prefix), isNull(apiKeys.revokedAt), isNull(users.deletedAt)));
  const match = candidates.find((row) => !row.key.revokedAt && !row.user.deletedAt && hashMatches(row.key.apiKeyHash, hash));
  if (!match) return null;

  // Fresh rows avoid even an UPDATE statement. The database predicate handles
  // races across processes: at most one actual row write per minute per key.
  if (!match.key.lastUsedAt || Date.now() - match.key.lastUsedAt.getTime() >= 60_000) {
    try {
      await db.update(apiKeys).set({ lastUsedAt: sql`now()` }).where(and(
        eq(apiKeys.id, match.key.id), isNull(apiKeys.revokedAt),
        sql`(${apiKeys.lastUsedAt} IS NULL OR ${apiKeys.lastUsedAt} <= now() - interval '1 minute')`,
      ));
    } catch (err) {
      logError("api-key-last-used-update-failed", err, { api_key_id: match.key.id });
    }
  }
  return { user: match.user, apiKeyId: match.key.id };
}

/**
 * Count ledger purchases (including open async reservations), less refunds
 * linked to each original purchase. Hourly usage follows the purchase's time,
 * so a late refund cannot cancel unrelated new spending. No shadow counters.
 * Optional keyId scopes the authoritative check; list gets all keys at once.
 */
export async function keySpending(tx: WalletTx, userId: string, keyId: string | null = null, activeOnly = false): Promise<Array<{
  id: string; spent_hour_cents: number; spent_total_cents: number;
}>> {
  const rows = await tx.execute(sql`
    SELECT k.id,
      COALESCE(SUM(p.net_cents) FILTER (WHERE p.created_at >= now() - interval '1 hour'), 0)::text AS spent_hour_cents,
      COALESCE(SUM(p.net_cents), 0)::text AS spent_total_cents
    FROM api_keys k
    LEFT JOIN LATERAL (
      SELECT d.created_at, GREATEST(0, -d.amount_cents - COALESCE((
        SELECT SUM(r.amount_cents) FROM wallet_transactions r
        WHERE r.wallet_id = d.wallet_id AND r.reference_id = d.reference_id AND r.type = 'refund'
      ), 0)) AS net_cents
      FROM wallet_transactions d
      JOIN wallets w ON w.id = d.wallet_id AND w.user_id = k.user_id
      WHERE d.api_key_id = k.id AND d.type = 'purchase' AND d.amount_cents < 0
    ) p ON true
    WHERE k.user_id = ${userId} ${keyId ? sql`AND k.id = ${keyId}` : sql``}
      ${activeOnly ? sql`AND k.revoked_at IS NULL` : sql``}
    GROUP BY k.id
  `);
  return rows.map((r: { id: string; spent_hour_cents: string; spent_total_cents: string }) => ({
    id: r.id, spent_hour_cents: Number(r.spent_hour_cents), spent_total_cents: Number(r.spent_total_cents),
  }));
}

/** Caller holds the wallet FOR UPDATE lock; updates/revocations take it too. */
export async function keyCapError(
  tx: WalletTx, userId: string, keyId: string | null | undefined, requestedCents: number,
): Promise<ApiError | null> {
  if (!keyId) return null; // Primary and x402 have no additional-key policy.
  const [key] = await tx.select().from(apiKeys).where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)));
  if (!key || key.revokedAt) return apiError("unauthorized", "Invalid API key.");
  const [usage] = await keySpending(tx, userId, keyId);
  for (const [period, limit, spent] of [
    ["hourly", key.maxSpendPerHourCents, usage.spent_hour_cents],
    ["total", key.maxSpendTotalCents, usage.spent_total_cents],
  ] as const) {
    if (limit !== null && spent + requestedCents > limit) {
      return apiError(period === "hourly" ? "key_hourly_cap_exceeded" : "key_total_cap_exceeded",
        `This key's ${period} spend limit would be exceeded. Ask the account owner to raise this key's limit using the primary key, or use another key.`,
        { spent_cents: spent, requested_cents: requestedCents, limit_cents: limit, retryable: false });
    }
  }
  return null;
}
