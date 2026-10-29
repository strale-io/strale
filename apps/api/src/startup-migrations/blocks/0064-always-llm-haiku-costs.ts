import { sql } from "drizzle-orm";
import { BLOCK_0064_SLUGS } from "../data/llm-capability-costs.js";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0064: always-LLM Haiku capability cost reclassification ─────────
//
// Phase 1 (Contain) for the May 2026 Haiku cost-leak follow-up to audit
// PR #84. PR #46 (2026-05-04) flipped the scheduler cadence from 24h →
// 1h while filtering on `test_suites.external_cost_cents = 0`. PR #49
// covered 5 paid-vendor caps that day (Dilisense × 3, eSortcode,
// risk-narrative-generate) and PR #55 covered invoice-extract. PR #49's
// commit body explicitly deferred "Anthropic-Haiku bulk set (~80 caps)".
// This block closes that gap.
//
// Slug list lives in `llm-capability-costs.ts` (`BLOCK_0064_SLUGS`) so a
// CI assertion can also consume it — adding a new Anthropic-importing
// capability without registering its cost fails CI. See the
// `llm-capability-costs.test.ts` regression for the structural gate.
//
// 1¢ floor matches the PR #49 / block 0062 / block 0063 defensible-
// minimum pattern. Real per-call Haiku cost on typical inputs is below
// 1¢; the floor's only operational job is to flip the scheduler-skip
// semantic. Precise calibration is the existing P2 to-do.
//
// Idempotent via `external_cost_cents = 0` in the WHERE clause — once a
// row is set to 1, a re-run won't match it. dependency_health and
// schema_check are NOT included: those use the auth-less-probe pattern
// (no paid call), legitimately stay at 0.

export async function runMigration0064_alwaysLlmHaikuCosts(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  // sql.join builds a parameterised IN-list — slugs flow through bind
  // parameters, not string concatenation. Sorted at the constant site
  // so the rendered SQL is stable test-run to test-run.
  const slugList = sql.join(
    BLOCK_0064_SLUGS.map((s) => sql`${s}`),
    sql`, `,
  );

  const update = await tx.execute(sql`
    UPDATE test_suites
    SET external_cost_cents = 1, updated_at = NOW()
    WHERE capability_slug IN (${slugList})
      AND active = true
      AND test_mode = 'live'
      AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
      AND external_cost_cents = 0
  `);
  const updateCount = (update as { count?: number }).count ?? 0;

  // Post-condition: no active live non-probe suite for any of the
  // always-LLM Haiku slugs may remain at 0 after this block. If a new
  // suite (or new cap) landed at 0 between deploys, fail boot.
  // COUNT(*)::int → postgres-js coerces int4 to JS number; assertion
  // fires correctly.
  const checkRows = await tx.execute(sql`
    SELECT COUNT(*)::int AS remaining_zero
    FROM test_suites
    WHERE capability_slug IN (${slugList})
      AND active = true
      AND test_mode = 'live'
      AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
      AND external_cost_cents = 0
  `);
  const checkResultRows = Array.isArray(checkRows) ? checkRows : (checkRows as { rows?: unknown[] })?.rows ?? [];
  const remainingZero = (checkResultRows[0] as { remaining_zero?: number })?.remaining_zero ?? 0;
  if (remainingZero > 0) {
    throw new Error(
      `0064_always_llm_haiku_costs post-condition failed: ${remainingZero} always-LLM Haiku suites still at external_cost_cents = 0`,
    );
  }

  return {
    block: "0064_always_llm_haiku_costs",
    outcome:
      updateCount === 0
        ? "no rows to update (already classified)"
        : `always-LLM Haiku suites reclassified across ${BLOCK_0064_SLUGS.length} capabilities: ${updateCount}`,
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}
