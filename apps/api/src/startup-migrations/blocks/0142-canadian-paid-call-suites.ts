import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";
import { PAID_CALL_QUARANTINE_MARKER } from "../../lib/paid-call-guard.js";

/**
 * Block 0142 — settle the two canadian-company-data suites the paid-call
 * guard parked (2026-11-02).
 *
 * The guard (lib/paid-call-guard.ts, PR #878) stops Strale's own tests from
 * making paid upstream calls and parks a suite whose run reaches one. On its
 * first run after deploy it parked exactly two suites, both canadian-company-data
 * (read through GET /v1/ops-read/parked-suites, 2026-11-02, handoff
 * 2026-11-02-paid-test-call-cost-result.md):
 *
 *   - c3743322-48d9-41ac-80bf-c623b9bd17a2, known_answer, input
 *     `{company_name: "Shopify"}`. The only live name-path test, which Gate 5
 *     (DEC-20260411-B) requires. It was paid only because the executor called
 *     Claude to extract a name from text that already was a name. The same PR
 *     as this block makes a structured `company_name` go straight to the free
 *     Corporations Canada search, so this suite is UN-PARKED: test_status
 *     back to 'normal', quarantine_reason cleared. If the direct search ever
 *     stops matching, the executor falls back to Claude, the guard blocks it
 *     and parks the suite again, so this cannot reintroduce spend.
 *
 *   - f4bba1a4-afc3-4019-ad6c-da22f11d0cdd, known_bad. Free text the
 *     capability is expected to refuse; refusing it is the Claude extraction
 *     step's job, so the test can only work by paying. DEACTIVATED
 *     (active = false). Its public "last result" (a pass from before the
 *     guard) leaves the trust surfaces with it, since they read active suites
 *     only.
 *
 * `updated_at` is left alone for both: neither change edits what a suite
 * asserts, and touching it would invalidate the fixture baseline (block
 * 0066's note).
 *
 * Idempotent and narrow: each UPDATE matches its row by id, slug and test
 * type, and only in the state this block expects (parked; active), so a
 * re-run, or a row a person already changed, matches nothing. Two rows; no
 * bulk operation (DEC-20260504-B).
 *
 * Authority: DEC-20260815-A (quarantine and promotion are platform acts),
 * on Petter's instruction in session 2026-11-02 ("do the canadian test
 * cleanup now").
 */
export const CANADIAN_NAME_PATH_SUITE_ID = "c3743322-48d9-41ac-80bf-c623b9bd17a2";
export const CANADIAN_KNOWN_BAD_SUITE_ID = "f4bba1a4-afc3-4019-ad6c-da22f11d0cdd";

export async function runMigration0142_canadianPaidCallSuites(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const unparked = await tx.execute(sql`
    UPDATE test_suites
       SET test_status = 'normal',
           quarantine_reason = NULL
     WHERE id = ${CANADIAN_NAME_PATH_SUITE_ID}::uuid
       AND capability_slug = 'canadian-company-data'
       AND test_type = 'known_answer'
       AND test_status = 'quarantined'
       AND starts_with(quarantine_reason, ${PAID_CALL_QUARANTINE_MARKER})
  `);
  const deactivated = await tx.execute(sql`
    UPDATE test_suites
       SET active = false
     WHERE id = ${CANADIAN_KNOWN_BAD_SUITE_ID}::uuid
       AND capability_slug = 'canadian-company-data'
       AND test_type = 'known_bad'
       AND active = true
  `);
  const unparkedCount = (unparked as { count?: number }).count ?? 0;
  const deactivatedCount = (deactivated as { count?: number }).count ?? 0;

  return {
    block: "0142_canadianPaidCallSuites",
    outcome:
      unparkedCount + deactivatedCount === 0
        ? "no change (canadian suites already settled)"
        : `canadian-company-data: un-parked ${unparkedCount} name-path suite, deactivated ${deactivatedCount} known_bad suite`,
    rows_affected: unparkedCount + deactivatedCount,
    duration_ms: Date.now() - startedAt,
  };
}
