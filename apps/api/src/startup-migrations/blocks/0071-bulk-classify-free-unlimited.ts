import { sql } from "drizzle-orm";
import { PHASE_B1_FREE_UNLIMITED_SLUGS } from "../data/phase-b1-free-unlimited-slugs.js";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0071: bulk-classify 180 high-confidence free_unlimited caps ──────
//
// Phase B.1 of DEC-20260512-A. Sets cost_class = 'free_unlimited',
// quota_window = 'none' on the 180 capabilities surfaced by the Phase
// B.0 audit (c:/tmp/phase-b-audit-report.csv, filter:
// proposed_cost_class=free_unlimited AND confidence=high).
//
// The slug list lives in `phase-b1-free-unlimited-slugs.ts` for the
// same reason BLOCK_0064_SLUGS lives in `llm-capability-costs.ts` —
// keeps the 200-line literal out of this orchestrator and pinned by
// a dedicated regression test.
//
// Idempotency. WHERE cost_class IS NULL gates the UPDATE so:
//   (a) re-runs after the first successful apply are no-ops,
//   (b) any cap operator has reclassified between deploys is preserved.
// Manifest YAMLs were updated in the same commit (180 files); they
// are the source-of-truth for fresh-DB onboarding.

export async function runMigration0071_bulkClassifyFreeUnlimited(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  // Drizzle's array-of-text binding: build sql`VALUES (...), (...)` from
  // the slug list. Same shape as Block 0064 (BLOCK_0064_SLUGS UPDATE).
  // Why not ANY($1::text[]): postgres-js + drizzle's sql template
  // doesn't expose a clean array binding for ANY; the WHERE slug IN
  // (slug1, slug2, ...) form is what the existing BLOCK_0064 block
  // already uses and is the established convention.
  const result = await tx.execute(sql`
    UPDATE capabilities
       SET cost_class = 'free_unlimited',
           quota_window = 'none',
           quota_cap = NULL,
           quota_reset_dom = NULL,
           updated_at = NOW()
     WHERE slug IN ${sql.raw("(" + PHASE_B1_FREE_UNLIMITED_SLUGS.map((s) => `'${s.replace(/'/g, "''")}'`).join(",") + ")")}
       AND cost_class IS NULL
  `);
  const updateCount = (result as { count?: number }).count ?? 0;

  return {
    block: "0071_bulk_classify_free_unlimited",
    outcome:
      updateCount === 0
        ? `no rows to classify (all ${PHASE_B1_FREE_UNLIMITED_SLUGS.length} slugs already have cost_class set)`
        : `bulk-classified ${updateCount} cap(s) as free_unlimited (of ${PHASE_B1_FREE_UNLIMITED_SLUGS.length} target slugs)`,
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}
