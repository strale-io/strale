import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0145 — give vasp-verify and vasp-non-compliant-check a routing latency
 * (2026-11-06).
 *
 * After the ESMA source fix (PR #943) the onboarding backfill verified both
 * tools live, and readiness then reported "Missing avg_latency_ms": the column
 * is NULL for both. `avg_latency_ms` is db-canonical (capability-field-
 * authority.ts), so the manifest value never reaches it, and the only
 * automated writer, POST /v1/internal/onboarding/fix-latency, needs the admin
 * secret and at least 20 completed executions (lib/latency-estimate.ts),
 * which two tools that threw on every call since the ESMA paths went 404 do
 * not have.
 *
 * 1,200 ms is a routing budget, not a mean (latency-estimate.ts): that
 * module's note records a measured p95 of 1,146 ms for vasp-verify; the
 * non-compliant check reads the same ESMA file through the same cache. Both
 * stay on the sync path (threshold 10 s). NULL already routed them sync, so
 * this changes readiness, not behaviour.
 *
 * Run policy "once"; the UPDATE only fills a NULL, so a measured value
 * written later is never overwritten. Two rows at most; no bulk operation
 * (DEC-20260504-B). Only strings and an integer are bound (DEC-20260504-A).
 * capabilities.updated_at is not written (blocks 0123, 0143, 0144).
 */
export const VASP_ROUTING_LATENCY_SLUGS = ["vasp-verify", "vasp-non-compliant-check"] as const;
export const VASP_ROUTING_LATENCY_MS = 1200;

export async function runMigration0145_vaspRoutingLatency(tx: MigrationExecutor): Promise<BlockResult> {
  const startedAt = Date.now();
  const res = await tx.execute(sql`
    UPDATE capabilities
       SET avg_latency_ms = ${VASP_ROUTING_LATENCY_MS}
     WHERE slug IN (${VASP_ROUTING_LATENCY_SLUGS[0]}, ${VASP_ROUTING_LATENCY_SLUGS[1]})
       AND avg_latency_ms IS NULL
  `);
  const rows = (res as { count?: number }).count ?? 0;
  return {
    block: "0145_vaspRoutingLatency",
    outcome: rows === 0 ? "no change (routing latency already set)" : `routing latency set on ${rows} vasp capabilit${rows === 1 ? "y" : "ies"}`,
    rows_affected: rows,
    duration_ms: Date.now() - startedAt,
  };
}
