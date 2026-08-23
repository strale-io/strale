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
export interface IntegrityHashRecord {
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
  /**
   * Chain v2 only: the execution receipt digest this row anchors.
   *
   * `null` is a legitimate v2 value — a post-epoch row whose receipt could not
   * be built still chains, and records `receipt_status = 'failed'` alongside.
   * What must never happen is the KEY going missing, which is why v2 always
   * writes it.
   */
  receiptDigest?: string | null;
}

/**
 * Which payload rule hashed a row.
 *
 * v1 is every row written before the receipt epoch. It is `null` in the
 * database — absent MEANS v1, by definition — so no historical row had to be
 * touched to introduce versioning, and none was.
 */
export const CHAIN_PAYLOAD_V1 = 1;
export const CHAIN_PAYLOAD_V2 = 2;
export type ChainPayloadVersion = typeof CHAIN_PAYLOAD_V1 | typeof CHAIN_PAYLOAD_V2;

/** A stored `integrity_payload_version` to the rule that produced the hash. */
export function chainVersionOf(stored: number | null | undefined): ChainPayloadVersion {
  if (stored === null || stored === undefined) return CHAIN_PAYLOAD_V1;
  if (stored === CHAIN_PAYLOAD_V2) return CHAIN_PAYLOAD_V2;
  // FAIL CLOSED. The first version returned v1 for anything unrecognised, so a
  // stored 3 or 0 would be verified under the wrong rule and reported as
  // corruption rather than as a version we do not understand. The CHECK on the
  // column bounds this today; the function should not depend on that.
  throw new Error(
    `unknown integrity_payload_version ${stored}: refusing to guess which rule ` +
      `hashed this row. A version this code does not know is not a v1 row.`,
  );
}

/**
 * Compute the integrity hash under an explicit payload version.
 *
 * ## Why two rules coexist permanently
 *
 * This is a transition, not a migration. **No historical hash is ever
 * recomputed**, so a v1 row must keep verifying under the v1 payload forever —
 * otherwise 883,296 production rows would appear corrupt the moment v2 shipped,
 * which is the single worst outcome available here.
 *
 * The verifier picks the rule from the row's own `integrity_payload_version`.
 * Linkage crosses the boundary unchanged: a v2 row's `previous_hash` points at
 * the last v1 hash exactly like any other link, so the chain stays continuous
 * and `reaches_genesis` still holds.
 *
 * ## What v2 adds, and why only that
 *
 * One member: `receiptDigest`. Because it is inside the hashed payload,
 * swapping a receipt digest on a post-epoch row invalidates that row's chain
 * hash and therefore every row after it — which is the property "a receipt
 * digest cannot be swapped without invalidating the chain" asks for.
 *
 * Nothing else changes. v2 is v1 plus one member, so a reader comparing them
 * can see the entire difference at once.
 *
 * `JSON.stringify` over a fixed literal is retained deliberately rather than
 * switched to RFC 8785: changing the serialization would change every future
 * chain hash for reasons unrelated to the receipt, and the nested-value
 * canonicalization gap it carries is documented in PHASE-1-CURRENT-TRUTH.md
 * as a separate, known limitation of the chain — not something this phase
 * quietly fixes while doing something else.
 */
export function computeIntegrityHashVersioned(
  record: IntegrityHashRecord,
  previousHash: string,
  version: ChainPayloadVersion,
): string {
  const base = {
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
  };

  // v2 appends one member. The key is ALWAYS present in v2 — a conditional
  // spread would make the payload shape depend on the value, which is the
  // call-site-varies-what-is-hashed defect this program exists to remove.
  const payload =
    version === CHAIN_PAYLOAD_V2
      ? JSON.stringify({ ...base, receiptDigest: record.receiptDigest ?? null })
      : JSON.stringify(base);

  return createHash("sha256").update(payload).digest("hex");
}

/**
 * The v1 entry point, unchanged in behaviour.
 *
 * Kept as its own export so every existing caller and every existing test
 * keeps hashing exactly what it hashed before. A default parameter on the
 * versioned function would have been terser and would have made a v1/v2 mixup
 * a one-character mistake.
 */
export function computeIntegrityHash(
  record: IntegrityHashRecord,
  previousHash: string,
): string {
  return computeIntegrityHashVersioned(record, previousHash, CHAIN_PAYLOAD_V1);
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
  record: IntegrityHashRecord,
  storedHash: string,
  previousHash: string,
  storedVersion: number | null | undefined,
): { verified: boolean } {
  const computed = computeIntegrityHashVersioned(
    record,
    previousHash,
    chainVersionOf(storedVersion),
  );
  return { verified: computed === storedHash };
}
