import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0094: discard baselines this codebase's own churn invalidated ───
//
// One-time repair for the 0066/0069 ping-pong described at
// UNCLASSIFIED_ONLY. Fixing the churn stops NEW false invalidations, but
// the suites already carrying a polluted `updated_at` stay stale forever:
// `checkBaselineStaleness` compares against a timestamp that no longer
// corresponds to any edit, and `recordStaleFixture` refuses to re-baseline
// a suite that costs money to run.
//
// Scope, deliberately narrow. Only fixture suites that are BOTH
// external_cost_cents > 0 (so they took the refuse-and-wait path) AND
// owned by a capability 0069 classifies as free — that intersection IS
// the ping-pong set, and nothing else lands in it. Genuinely paid-vendor
// suites (`pep-check`, `sanctions-check`, `adverse-media-check`) are also
// stale, but for the honest reason the guard was built for: a human has
// not confirmed their edited input. They are left alone.
//
// Clearing the baseline rather than back-dating `updated_at`: the next
// scheduled run then executes live and captures a fresh baseline through
// the normal `captureBaseline` path (~1¢ per suite, twice, once). Writing
// a fabricated timestamp would re-bless output nobody has verified.
//
// Idempotent: the WHERE requires `baseline_output IS NOT NULL`, so a
// re-run after the recapture (which writes a baseline_captured_at newer
// than updated_at) matches nothing.

export async function runMigration0094_clearChurnInvalidatedBaselines(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const update = await tx.execute(sql`
    UPDATE test_suites ts
       SET baseline_output = NULL,
           baseline_captured_at = NULL
      FROM capabilities c
     WHERE c.slug = ts.capability_slug
       AND ts.active
       AND ts.test_mode = 'fixture'
       AND ts.external_cost_cents > 0
       AND ts.baseline_output IS NOT NULL
       AND ts.baseline_captured_at IS NOT NULL
       AND ts.baseline_captured_at < ts.updated_at
       AND c.cost_class IN ('free_unlimited', 'free_quota', 'paid_with_free_tier')
  `);
  const updateCount = (update as { count?: number }).count ?? 0;

  return {
    block: "0094_clear_churn_invalidated_baselines",
    outcome:
      updateCount === 0
        ? "no churn-invalidated baselines remain"
        : `cleared ${updateCount} baseline(s) for live recapture`,
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}
