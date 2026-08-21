/**
 * Cryptographic audit integrity — hash chain for tamper-evident logging.
 *
 * Each completed/failed transaction gets a SHA-256 integrity hash computed
 * from its contents + the previous transaction's hash, creating a chain.
 * Modifying any historical record breaks the chain — detectable on audit.
 *
 * Chain is per-day (not globally sequential) to avoid serialization bottleneck.
 * Each day's first transaction uses the previous day's last hash.
 *
 * Aligned with: SOC 2 2026 tamper-evident logging.
 *
 * Note (cert-audit 2026-04-30): an earlier comment cited ISO/IEC 24970
 * as also satisfied; that standard is a Draft International Standard
 * (DIS), not yet adopted. Removed to avoid asserting conformance to
 * something that doesn't yet exist as a published standard.
 */

import { createHash } from "node:crypto";
import { sql, desc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { transactions } from "../db/schema.js";

// F-A-010: exported as the single source of truth for the chain's anchor.
// Any chain-walking consumer (verify.ts, audit.ts) imports this constant
// rather than re-deriving — a divergent reseed in one file would silently
// break `reaches_genesis` checks in the other.
export const GENESIS_HASH = createHash("sha256").update("strale-genesis-v1").digest("hex");

// F-AUDIT-12: Date-serialization defensive coercion.
// Drizzle returns Dates from `timestamp` columns, but JSONB-cached rows,
// raw-SQL paths, and serialized Date strings would otherwise hash to a
// different value. "2026-04-20T12:00:00Z" and "2026-04-20T12:00:00.000Z"
// represent the same instant but produce different SHA-256s. Coerce
// every datetime through `new Date(x).toISOString()` so all
// representations of an instant collapse to one canonical form.
function toCanonicalIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  // Already a string — re-parse and re-serialize so equivalent forms hash equally.
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    // Unparseable: preserve verbatim. Safer than silently producing a different hash.
    // The chain will detect the divergence at verify time.
    return value;
  }
  return d.toISOString();
}

/**
 * Compute the integrity hash for a transaction record.
 * Includes all compliance-relevant fields + the previous hash.
 */
export function computeIntegrityHash(
  record: {
    id: string;
    userId: string | null;
    status: string;
    input: unknown;
    output: unknown;
    error: string | null;
    priceCents: number;
    latencyMs: number | null;
    provenance: unknown;
    auditTrail: unknown;
    transparencyMarker: string;
    dataJurisdiction: string;
    createdAt: string | Date;
    completedAt: string | Date | null;
  },
  previousHash: string,
): string {
  const payload = JSON.stringify({
    id: record.id,
    userId: record.userId,
    status: record.status,
    input: record.input,
    output: record.output,
    error: record.error,
    priceCents: record.priceCents,
    latencyMs: record.latencyMs,
    provenance: record.provenance,
    auditTrail: record.auditTrail,
    transparencyMarker: record.transparencyMarker,
    dataJurisdiction: record.dataJurisdiction,
    createdAt: toCanonicalIso(record.createdAt),
    completedAt: toCanonicalIso(record.completedAt),
    previousHash,
  });
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Get the most recent integrity hash for chain linking.
 * Returns the genesis hash if no previous transactions exist.
 */
export async function getPreviousHash(): Promise<string> {
  // WP7: FAILS CLOSED. This used to be wrapped in `try { … } catch { return
  // GENESIS_HASH; }`, so a transient database error during head selection
  // silently started a SECOND chain from genesis. That is worse than stopping:
  // it produces a plausible-looking chain with an unexplained second root, and
  // nothing anywhere records that it happened. Genesis is now returned for
  // exactly one reason — the chain is genuinely empty — and a read failure
  // propagates to the caller, which is a worker that can retry on its next tick.
  const db = getDb();
  const [latest] = await db
    .select({ integrityHash: transactions.integrityHash })
    .from(transactions)
    // WP7, and the defect that actually broke the chain. Postgres sorts NULLs
    // FIRST under DESC, so a hashed row with a null `completed_at` occupies the
    // head permanently. One health_probe row from 2026-05-04 did exactly that:
    // every batch for the next three and a half months linked to it, giving one
    // parent 150,719 children. The chain was a star, and a star has no
    // sequence, so it proves nothing about ordering or deletion.
    //
    // Two independent guards, because this must not silently recur: the head
    // must HAVE a completed_at, and the sort states NULLS LAST explicitly
    // rather than relying on the filter to make it moot.
    .where(
      sql`${transactions.integrityHash} IS NOT NULL AND ${transactions.completedAt} IS NOT NULL`,
    )
    // F-A-008: stable sort via `id DESC` as tiebreaker — same-ms
    // `completedAt` rows would otherwise be returned in storage-layer
    // order (non-deterministic). `id` is uuid().defaultRandom(), so
    // the secondary sort is deterministic without being time-ordered.
    //
    // WP7: this key must stay identical to the batch ordering in
    // jobs/integrity-hash-retry.ts. They disagreed — batch by created_at,
    // head by completed_at — so the tip a batch produced was not the head the
    // next tick resumed from, and one parent acquired two children. See
    // CHAIN_ORDER_NOTE there.
    .orderBy(
      sql`${transactions.completedAt} DESC NULLS LAST`,
      desc(transactions.id),
    )
    .limit(1);
  return latest?.integrityHash ?? GENESIS_HASH;
}

/**
 * Verify a single transaction's integrity hash.
 */
export function verifyIntegrityHash(
  record: Parameters<typeof computeIntegrityHash>[0],
  storedHash: string,
  previousHash: string,
): { verified: boolean } {
  const computed = computeIntegrityHash(record, previousHash);
  return { verified: computed === storedHash };
}

/**
 * Rows that share a parent — i.e. the chain forked (WP7).
 *
 * The property that makes a hash chain evidence is that each node has exactly
 * one child. Nothing enforced that: a unique index cannot be added because
 * production is already forked (ten parents with more than one child, the
 * largest with 150,719, caused by a null-`completed_at` row permanently holding
 * the head from 2026-05-04). So the constraint is checked rather than enforced.
 *
 * `since` scopes the question to rows created after the fix. Asking globally
 * would return the historical break on every call and drown the signal that
 * matters: whether a NEW fork has appeared. History is deliberately not
 * rewritten — recomputing 863,946 hashes would erase the evidence that the
 * break happened, which is the opposite of an audit chain's purpose.
 */
export async function detectChainForks(
  since: Date,
  limit = 20,
): Promise<Array<{ previousHash: string; childCount: number }>> {
  const db = getDb();
  const rows = (await db.execute(sql`
    SELECT previous_hash, count(*)::int AS child_count
    FROM transactions
    WHERE previous_hash IS NOT NULL
      AND created_at >= ${since.toISOString()}
    GROUP BY previous_hash
    HAVING count(*) > 1
    ORDER BY count(*) DESC
    LIMIT ${limit}
  `)) as unknown as Array<{ previous_hash: string; child_count: number }>;

  return rows.map((r) => ({
    previousHash: r.previous_hash,
    childCount: r.child_count,
  }));
}
