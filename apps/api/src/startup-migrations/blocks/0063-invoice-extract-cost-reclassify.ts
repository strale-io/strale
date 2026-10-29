import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0063: invoice-extract paid-vendor cost reclassification ──────────
//
// Sibling of block 0062. Prod query 2026-05-04 found that all 4 active
// non-probe live test suites for `invoice-extract` had external_cost_cents
// = 0, which causes the DEC-20260503-B scheduler to schedule them hourly
// — paying Anthropic Haiku vision to extract invoice fields from the
// `httpbin.org/image/jpeg` placeholder fixture (a JPEG of a dog) on a
// cadence that was supposed to be excluded for paid vendors. The fixture
// itself is a separate hygiene to-do; this block stops the scheduled
// bleed by reclassifying the suites' cost above the scheduler's skip
// threshold.
//
// 1¢ floor matches the PR #49 / block 0062 defensible-minimum pattern
// for paid vendors where calibrated cost isn't yet available. Real
// per-call cost on a small JPEG via Haiku is below 1¢, but the floor's
// only operational job is to flip the scheduler-skip semantic; precise
// calibration is the existing P2 to-do on Anthropic-Haiku cost across
// all vision-using capabilities.
//
// Idempotent via `external_cost_cents = 0` in the WHERE clause — once a
// row is set to 1, a re-run won't match it. dependency_health and
// schema_check are NOT included: those use the auth-less-probe pattern
// (no paid call), legitimately stay at 0.

export async function runMigration0063_invoiceExtractCostReclassify(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const update = await tx.execute(sql`
    UPDATE test_suites
    SET external_cost_cents = 1, updated_at = NOW()
    WHERE capability_slug = 'invoice-extract'
      AND active = true
      AND test_mode = 'live'
      AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
      AND external_cost_cents = 0
  `);
  const updateCount = (update as { count?: number }).count ?? 0;

  // Post-condition: no active live non-probe suite for invoice-extract
  // may remain at 0 after this block. If a new suite shows up at 0,
  // fail boot so the operator notices.
  // COUNT(*)::int → postgres-js coerces int4 to JS number; assertion fires correctly.
  const checkRows = await tx.execute(sql`
    SELECT COUNT(*)::int AS remaining_zero
    FROM test_suites
    WHERE capability_slug = 'invoice-extract'
      AND active = true
      AND test_mode = 'live'
      AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
      AND external_cost_cents = 0
  `);
  const checkResultRows = Array.isArray(checkRows) ? checkRows : (checkRows as { rows?: unknown[] })?.rows ?? [];
  const remainingZero = (checkResultRows[0] as { remaining_zero?: number })?.remaining_zero ?? 0;
  if (remainingZero > 0) {
    throw new Error(
      `0063_invoice_extract_cost_reclassify post-condition failed: ${remainingZero} invoice-extract suites still at external_cost_cents = 0`,
    );
  }

  return {
    block: "0063_invoice_extract_cost_reclassify",
    outcome:
      updateCount === 0
        ? "no rows to update (already classified)"
        : `invoice-extract suites reclassified: ${updateCount}`,
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}
