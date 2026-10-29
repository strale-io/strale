import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0066: ensure scheduled_testing_eligible column + reconcile from cost
//
// Owns the lifecycle of the `test_suites.scheduled_testing_eligible`
// column entirely: ADD COLUMN IF NOT EXISTS (idempotent — no-op on prod
// where the column already exists from PR #88's manual recovery apply,
// adds the column on fresh DBs), then reconciles eligibility from cost
// as the PR A interim derivation bridge.
//
// History. PR A (PR #88, merged 2026-05-11) added the column via a
// Drizzle SQL file at `apps/api/drizzle/0063_decouple_scheduled_testing_eligibility.sql`.
// That file never ran at deploy time — the Dockerfile CMD invokes the
// Node entrypoint, which calls `runStartupMigrations()`, which never
// invokes `drizzle-kit migrate`. PR #88 healthchecked-failed in prod
// because this block referenced the column before any mechanism created
// it. Phase 1 (Contain) applied the column manually via `railway ssh`;
// Phase 2 (Understand) named the failure pattern (Journal
// `35d67c87082c815da2ead8ff87c638e2`); this revised block is Phase 3
// (Harden) — the schema fact lives here, in the same place that already
// reconciles eligibility from cost. DEC-20260511-C codifies the
// in-TS-block convention.
//
// PR B will force explicit `scheduledTestingEligible` declarations at
// the 12 INSERT call sites and remove the reconciliation UPDATE; whether
// the ADD COLUMN portion stays here or moves to a dedicated block is a
// PR B design choice.
//
// Idempotency.
//   - ADD COLUMN IF NOT EXISTS is a Postgres no-op when the column
//     already exists.
//   - The reconciliation UPDATE filters `IS DISTINCT FROM` so a re-run
//     against an already-reconciled DB matches zero rows.

/**
 * The rows block 0066 owns: suites whose capability carries no `cost_class`.
 *
 * Why this scoping exists (found 2026-08-21 by the morning check-in).
 * Blocks 0066 and 0069 derived the SAME column from two different sources —
 * 0066 from `test_suites.external_cost_cents`, 0069 from
 * `capabilities.cost_class` — and both ran on every boot, in that order.
 * For any suite where the two disagreed, each boot flipped the flag twice:
 * 0066 set it one way, 0069 set it back. Both post-conditions passed,
 * because each checked only its own derivation immediately after its own
 * UPDATE. Nothing ever converged and nothing ever complained.
 *
 * In production this hit exactly 8 suites — `eu-regulation-search` and
 * `seo-audit`, both `cost_class = 'free_unlimited'` (so 0069 says eligible)
 * with `external_cost_cents = 1` for their Haiku call (so 0066 says not).
 * Both readings are correct about different questions; only the column is
 * shared.
 *
 * The damage was not the churn itself but the `updated_at = NOW()` both
 * UPDATEs carried. `checkBaselineStaleness` (test-runner.ts) reads
 * `updated_at` as "the suite's content was edited", so a scheduling-flag
 * write invalidated the fixture baseline — on every single deploy. Those
 * suites cost money to re-run, so `recordStaleFixture` refused to
 * re-baseline and wrote `passed: false` instead, forever:
 * `eu-regulation-search` scored 51% over 24h and 60% in the Codebase
 * Quality Program's exit measurement without a single real failure.
 *
 * Both halves are fixed here: the two blocks now partition the table
 * (0069 owns classified capabilities, 0066 owns the rest), and neither
 * touches `updated_at`, because changing which suites the scheduler picks
 * up is not an edit to what a suite asserts.
 */
const UNCLASSIFIED_ONLY = sql`NOT EXISTS (
        SELECT 1 FROM capabilities c
         WHERE c.slug = ts.capability_slug AND c.cost_class IS NOT NULL
      )`;

export async function runMigration0066_ensureEligibilityColumnAndReconcile(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  // Schema: ensure column exists. No-op on existing prod; creates it on
  // fresh DBs (local dev, staging, restored snapshots).
  await tx.execute(sql`
    ALTER TABLE test_suites
      ADD COLUMN IF NOT EXISTS scheduled_testing_eligible BOOLEAN NOT NULL DEFAULT FALSE
  `);

  // Data: reconcile eligibility from cost, ONLY for suites whose capability
  // has no cost_class. Block 0069 owns every classified capability; see
  // UNCLASSIFIED_ONLY's comment for why the two must not overlap.
  const update = await tx.execute(sql`
    UPDATE test_suites ts
       SET scheduled_testing_eligible = (ts.external_cost_cents = 0)
     WHERE ${UNCLASSIFIED_ONLY}
       AND ts.scheduled_testing_eligible IS DISTINCT FROM (ts.external_cost_cents = 0)
  `);
  const updateCount = (update as { count?: number }).count ?? 0;

  // Post-condition: every row this block owns matches the cost derivation.
  // Scoped identically to the UPDATE — asserting over classified rows too
  // would fail boot the moment 0069 legitimately disagrees, which is the
  // whole point of splitting them.
  const checkRows = await tx.execute(sql`
    SELECT COUNT(*)::int AS mismatched
      FROM test_suites ts
     WHERE ${UNCLASSIFIED_ONLY}
       AND ts.scheduled_testing_eligible IS DISTINCT FROM (ts.external_cost_cents = 0)
  `);
  const checkResultRows = Array.isArray(checkRows)
    ? checkRows
    : (checkRows as { rows?: unknown[] })?.rows ?? [];
  const mismatched = (checkResultRows[0] as { mismatched?: number })?.mismatched ?? 0;
  if (mismatched > 0) {
    throw new Error(
      `0066_ensure_eligibility_column_and_reconcile post-condition failed: ${mismatched} rows still mismatched after UPDATE`,
    );
  }

  return {
    block: "0066_ensure_eligibility_column_and_reconcile",
    outcome:
      updateCount === 0
        ? "column ensured; no rows to reconcile (already aligned)"
        : `column ensured; reconciled ${updateCount} rows to derived eligibility`,
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}
