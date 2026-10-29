import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0069: reconcile scheduled_testing_eligible from cost_class ───────
//
// Phase A0b commit #4. Block 0066's interim derivation
// (`scheduled_testing_eligible := external_cost_cents = 0`) was the bridge
// behavior that conflated "no per-call cost" with "no quota". This block
// replaces it with the structural rule:
//
//   eligible := cost_class IN ('free_unlimited', 'free_quota', 'paid_with_free_tier')
//
// Unclassified caps (cost_class IS NULL) keep `scheduled_testing_eligible = FALSE`
// — fail-closed, matches the GRACE-mode dispatcher behavior. The scheduler's
// SELECT query is also tightened in test-scheduler.ts to exclude caps whose
// per-window budget counter has reached its cap (defense-in-depth alongside
// the per-call assertBudgetAvailable check).
//
// Idempotency. The UPDATE filters `IS DISTINCT FROM` so re-runs on an
// already-reconciled DB match zero rows.

export async function runMigration0069_reconcileEligibilityFromCostClass(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const update = await tx.execute(sql`
    UPDATE test_suites ts
       SET scheduled_testing_eligible = (
             c.cost_class IN ('free_unlimited', 'free_quota', 'paid_with_free_tier')
           )
      FROM capabilities c
     WHERE c.slug = ts.capability_slug
       AND c.cost_class IS NOT NULL
       AND ts.scheduled_testing_eligible IS DISTINCT FROM (
             c.cost_class IN ('free_unlimited', 'free_quota', 'paid_with_free_tier')
           )
  `);
  const updateCount = (update as { count?: number }).count ?? 0;

  // Post-condition: for every classified cap, its suites' eligibility
  // matches the cost_class derivation. Mismatch means the UPDATE didn't
  // reach the rows we expected — fail boot rather than silently leave
  // the scheduler reading stale eligibility.
  const checkRows = await tx.execute(sql`
    SELECT COUNT(*)::int AS mismatched
      FROM test_suites ts
      JOIN capabilities c ON c.slug = ts.capability_slug
     WHERE c.cost_class IS NOT NULL
       AND ts.scheduled_testing_eligible IS DISTINCT FROM (
             c.cost_class IN ('free_unlimited', 'free_quota', 'paid_with_free_tier')
           )
  `);
  const checkResultRows = Array.isArray(checkRows)
    ? checkRows
    : (checkRows as { rows?: unknown[] })?.rows ?? [];
  const mismatched = (checkResultRows[0] as { mismatched?: number })?.mismatched ?? 0;
  if (mismatched > 0) {
    throw new Error(
      `0069_reconcile_eligibility_from_cost_class post-condition failed: ${mismatched} rows still mismatched after UPDATE`,
    );
  }

  return {
    block: "0069_reconcile_eligibility_from_cost_class",
    outcome:
      updateCount === 0
        ? "no rows to reconcile (already aligned with cost_class)"
        : `reconciled ${updateCount} row(s) to cost_class-derived eligibility`,
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}
