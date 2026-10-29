import { sql } from "drizzle-orm";
import { BLOCK_0065_SLUGS } from "../data/llm-capability-costs.js";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0065: PR #86 follow-up — leaky-cap cleanup ──────────────────────
//
// Two narrow UPDATEs against `test_suites`, bundled because both close
// residual leak surface that PR #86's bypass-justification audit
// surfaced. Idempotent via filter clauses; post-condition checks fire
// on first deploy and re-run as no-ops thereafter.
//
// 1. `website-to-company` cost bump (mirrors block 0064 pattern).
//    The bypass premise was that structured-data extraction (JSON-LD,
//    meta tags) bypasses the LLM. PR #86 found this wrong:
//    `llmExtractCompanyName` fires whenever meta-extract returns any
//    title/site_name (i.e. every real site). Bumping to 1¢ flips the
//    scheduler-skip semantic.
//
// 2. `us-company-data` fixture fix. The scheduled-test suites have
//    `input = {"company": "AAPL"}` (ticker symbol) which fails
//    `findCik`'s `/^\d{1,10}$/` regex → falls into the LLM
//    extractCompanyName path on every dispatch. Swapping to a numeric
//    CIK ("320193", Apple) routes directly to the SEC EDGAR API. The
//    manifest update is hygiene; this UPDATE is what makes the fix
//    effective in prod (the test_suites row was populated by
//    onboard.ts at capability-creation time and no longer tracks the
//    manifest).

export async function runMigration0065_pr86LeakyCapsCleanup(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  // (1) website-to-company cost bump
  const slugList = sql.join(
    BLOCK_0065_SLUGS.map((s) => sql`${s}`),
    sql`, `,
  );
  const costBump = await tx.execute(sql`
    UPDATE test_suites
    SET external_cost_cents = 1, updated_at = NOW()
    WHERE capability_slug IN (${slugList})
      AND active = true
      AND test_mode = 'live'
      AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
      AND external_cost_cents = 0
  `);
  const costBumpCount = (costBump as { count?: number }).count ?? 0;

  // (2) us-company-data fixture fix — only touches rows whose current
  // input is the broken "AAPL" ticker. New rows or re-onboarded ones
  // (the manifest is now corrected) won't match the filter and stay.
  const fixtureFix = await tx.execute(sql`
    UPDATE test_suites
    SET input = jsonb_set(input, '{company}', '"320193"'::jsonb), updated_at = NOW()
    WHERE capability_slug = 'us-company-data'
      AND active = true
      AND test_mode = 'live'
      AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
      AND input->>'company' = 'AAPL'
  `);
  const fixtureFixCount = (fixtureFix as { count?: number }).count ?? 0;

  // Post-condition (1): no website-to-company live non-probe suite may
  // remain at external_cost_cents = 0 after this block.
  const checkCostRows = await tx.execute(sql`
    SELECT COUNT(*)::int AS remaining_zero
    FROM test_suites
    WHERE capability_slug IN (${slugList})
      AND active = true
      AND test_mode = 'live'
      AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
      AND external_cost_cents = 0
  `);
  const costRows = Array.isArray(checkCostRows) ? checkCostRows : (checkCostRows as { rows?: unknown[] })?.rows ?? [];
  const remainingZero = (costRows[0] as { remaining_zero?: number })?.remaining_zero ?? 0;
  if (remainingZero > 0) {
    throw new Error(
      `0065_pr86_leaky_caps_cleanup post-condition failed: ${remainingZero} website-to-company suites still at external_cost_cents = 0`,
    );
  }

  // Post-condition (2): no us-company-data live non-probe suite may
  // remain with input.company = 'AAPL' after this block.
  const checkFixtureRows = await tx.execute(sql`
    SELECT COUNT(*)::int AS remaining_aapl
    FROM test_suites
    WHERE capability_slug = 'us-company-data'
      AND active = true
      AND test_mode = 'live'
      AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
      AND input->>'company' = 'AAPL'
  `);
  const fixtureRows = Array.isArray(checkFixtureRows) ? checkFixtureRows : (checkFixtureRows as { rows?: unknown[] })?.rows ?? [];
  const remainingAapl = (fixtureRows[0] as { remaining_aapl?: number })?.remaining_aapl ?? 0;
  if (remainingAapl > 0) {
    throw new Error(
      `0065_pr86_leaky_caps_cleanup post-condition failed: ${remainingAapl} us-company-data suites still have input.company = 'AAPL'`,
    );
  }

  const total = costBumpCount + fixtureFixCount;
  return {
    block: "0065_pr86_leaky_caps_cleanup",
    outcome:
      total === 0
        ? "no rows to update (already classified + fixed)"
        : `website-to-company cost-bumped=${costBumpCount}, us-company-data fixture-fixed=${fixtureFixCount}`,
    rows_affected: total,
    duration_ms: Date.now() - startedAt,
  };
}
