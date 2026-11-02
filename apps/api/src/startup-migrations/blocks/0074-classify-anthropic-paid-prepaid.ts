import { sql } from "drizzle-orm";
import { PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS } from "../data/phase-b3-anthropic-paid-prepaid-slugs.js";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0074: classify 83 ANTHROPIC_API_KEY caps as paid_prepaid ─────────
//
// Phase B.3 of DEC-20260512-A. Every capability that reads
// process.env.ANTHROPIC_API_KEY classifies as paid_prepaid — Anthropic's
// API has no free tier, no quota, bills per token on every call.
// Mechanical batch; no per-cap variation.
//
// Zero behavior change vs current state per DEC-20260503-B: these 83
// caps already had scheduled_testing_eligible=FALSE via Block 0066's
// bridge derivation from external_cost_cents > 0. After B.3 the
// scheduler eligibility result stays FALSE but its source flips from
// external_cost_cents to cost_class (Block 0069 reconcile). No test
// signal lost. Dispatcher gate's NULL × internal_test = refuse already
// blocked test-runner invocations; paid_prepaid × internal_test =
// refuse keeps the same outcome.
//
// Side effect: first paid_prepaid classifications in production
// activate A0c.2b's "Awaiting production traffic" frontend display
// for any cap with stale last_customer_call_at. Validates the A0c
// arc end-to-end.
//
// Idempotency: WHERE cost_class IS NULL. Slug list lives separately
// in phase-b3-anthropic-paid-prepaid-slugs.ts (same pattern as
// PHASE_B1_FREE_UNLIMITED_SLUGS).

export async function runMigration0074_classifyAnthropicPaidPrepaid(
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
     WHERE slug IN ${sql.raw("(" + PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS.map((s) => `'${s.replace(/'/g, "''")}'`).join(",") + ")")}
       AND cost_class IS NULL
  `);
  const updateCount = (result as { count?: number }).count ?? 0;

  return {
    block: "0074_classify_anthropic_paid_prepaid",
    outcome:
      updateCount === 0
        ? `no rows to classify (all ${PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS.length} slugs already have cost_class set)`
        : `classified ${updateCount} cap(s) as paid_prepaid (of ${PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS.length} target slugs)`,
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}
