import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0084 — reserve customer headroom in danish-company-data's test budget.
 *
 * cvrapi.dk documents exactly 50 free lookups per day. quota_cap was also 50,
 * so the scheduler was entitled to the entire vendor allowance and customers
 * got whatever was left, which was nothing. Measured in the week to
 * 2026-08-15: 12-31 upstream-consuming executions a day, our own budget
 * refusing 12-15 of them, and cvrapi.dk still returning "quota exceeded" 2-4
 * times a day. The single genuinely external call in the 30-day window failed
 * with exactly that error.
 *
 * Only internal_test/ci contexts are budget-checked — customer_paid is always
 * ALLOW in the ALLOW_MATRIX — so the budget cannot protect customers from us;
 * it can only stop us before we exhaust the shared pool. Setting it to 20
 * leaves 30/day for real callers, comfortably above the observed 12/day
 * baseline for a full suite cycle.
 *
 * Guarded on the old value so an operator who has since retuned it is left
 * alone, and so a redeploy is a no-op.
 */
export async function runMigration0084_danishQuotaHeadroom(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const result = await tx.execute(sql`
    UPDATE capabilities
       SET quota_cap = 20,
           updated_at = NOW()
     WHERE slug = 'danish-company-data'
       AND cost_class = 'free_quota'
       AND quota_cap = 50
  `);
  const updateCount = (result as { count?: number }).count ?? 0;

  return {
    block: "0084_danish_quota_headroom",
    outcome:
      updateCount === 0
        ? "no change (danish-company-data quota_cap already retuned or capability absent)"
        : "danish-company-data test budget cut from 50 to 20, reserving 30/day of the vendor's 50 for customers",
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}
