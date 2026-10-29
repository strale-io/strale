import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0076: classify 10 non-Anthropic paid_prepaid caps ────────────────
//
// Phase B.5 of DEC-20260512-A. Final paid_prepaid batch. 7 caps are
// DB-present (the boot invariant's 9 visible unclassified rows = these
// 7 + the 2 in Block 0077). 3 caps are code-but-not-DB orphans
// (us-company-data-cobalt, us-ein-match, us-sec-filings-extended) —
// they have executor files calling registerCapability AND manifest
// files BUT no DB rows, suggesting onboard.ts was never run for them.
// They're included in this slug list so when chat fixes their
// onboarding the UPDATE classifies them on next boot via idempotency
// (`AND cost_class IS NULL`).
//
// Vendor breakdown:
//   - Dilisense (3): adverse-media-check, pep-check, sanctions-check
//   - Serper.dev (3): backlink-check, google-search, serp-analyze
//   - eSortcode (1): uk-cop-check  (Pay.UK CoP commercial bank verification)
//   - Cobalt Intelligence (1): us-company-data-cobalt  [orphan]
//   - Liberty Data EINsearch (1): us-ein-match  [orphan]
//   - sec-api.io (1): us-sec-filings-extended  [orphan; 100-call trial only]
//
// All 10 ship paid_prepaid / quota_window='none' / quota_cap=NULL /
// quota_reset_dom=NULL (same shape as Block 0074's Anthropic batch).

export const PHASE_B5_NON_ANTHROPIC_PAID_PREPAID_SLUGS: ReadonlyArray<string> = [
  "adverse-media-check",
  "backlink-check",
  "google-search",
  "pep-check",
  "sanctions-check",
  "serp-analyze",
  "uk-cop-check",
  "us-company-data-cobalt",
  "us-ein-match",
  "us-sec-filings-extended",
];

export async function runMigration0076_classifyNonAnthropicPaidPrepaid(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const result = await tx.execute(sql`
    UPDATE capabilities
       SET cost_class = 'paid_prepaid',
           quota_window = 'none',
           quota_cap = NULL,
           quota_reset_dom = NULL,
           updated_at = NOW()
     WHERE slug IN ${sql.raw("(" + PHASE_B5_NON_ANTHROPIC_PAID_PREPAID_SLUGS.map((s) => `'${s.replace(/'/g, "''")}'`).join(",") + ")")}
       AND cost_class IS NULL
  `);
  const updateCount = (result as { count?: number }).count ?? 0;

  return {
    block: "0076_classify_non_anthropic_paid_prepaid",
    outcome:
      updateCount === 0
        ? `no rows to classify (all ${PHASE_B5_NON_ANTHROPIC_PAID_PREPAID_SLUGS.length} slugs already classified or 3 orphan slugs not in DB)`
        : `classified ${updateCount} cap(s) as paid_prepaid (of ${PHASE_B5_NON_ANTHROPIC_PAID_PREPAID_SLUGS.length} target slugs; 3 orphans excluded by DB filter)`,
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}
