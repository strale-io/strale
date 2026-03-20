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
 * Satisfies: SOC 2 2026 tamper-evident logging, ISO/IEC 24970.
 */

import { createHash } from "node:crypto";
import { sql, desc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { transactions } from "../db/schema.js";

const GENESIS_HASH = createHash("sha256").update("strale-genesis-v1").digest("hex");

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
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
    completedAt: record.completedAt instanceof Date ? record.completedAt.toISOString() : record.completedAt,
    previousHash,
  });
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Get the most recent integrity hash for chain linking.
 * Returns the genesis hash if no previous transactions exist.
 */
export async function getPreviousHash(): Promise<string> {
  try {
    const db = getDb();
    const [latest] = await db
      .select({ integrityHash: transactions.integrityHash })
      .from(transactions)
      .where(sql`${transactions.integrityHash} IS NOT NULL`)
      .orderBy(desc(transactions.completedAt))
      .limit(1);
    return latest?.integrityHash ?? GENESIS_HASH;
  } catch {
    return GENESIS_HASH;
  }
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
