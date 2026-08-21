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
  // WP7: the head is THE LAST ROW THE WORKER HASHED, read from a monotonic
  // sequence assigned at hash time.
  //
  // It cannot be max(completed_at), which was WP7's first attempt and is what
  // the adversarial review caught. That column is stamped from a clock read
  // before the row's own `created_at` default — median delta in production is
  // MINUS 1.5 ms — so a row can be admitted after the head while carrying an
  // earlier completion time. It then chains onto the head without becoming it,
  // and the next row chains onto the same parent: one parent, two children.
  // Replaying that rule over 30 days of real traffic yields nine forks. The
  // same shape also arises from a per-row failure inside a batch, which is
  // retried on a later tick with a smaller completed_at.
  //
  // A sequence is monotone in the only order that matters — the order rows
  // were actually chained — so backdating, clock skew and retries become
  // structurally incapable of forking rather than merely unlikely to.
  //
  // FAILS CLOSED. This was once wrapped in `catch { return GENESIS_HASH; }`,
  // so a transient DB error silently started a second chain; genesis has 11
  // children in production, which is what that looks like. Genesis is now
  // returned for exactly one reason: no row has ever been sequenced.
  const db = getDb();
  const [latest] = await db
    .select({ integrityHash: transactions.integrityHash })
    .from(transactions)
    .where(sql`${transactions.chainSeq} IS NOT NULL`)
    .orderBy(desc(transactions.chainSeq))
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
