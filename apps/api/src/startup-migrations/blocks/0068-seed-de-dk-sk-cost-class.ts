import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0068: seed cost_class for DE/DK/SK ───────────────────────────────
//
// Phase A0b strategy (b) self-throttling: classifies only the three caps
// whose vendors have the most-urgent quota exhaustion risk. DE OpenRegister
// resets 2026-06-01 and was the original DE/DK breakage trigger; cvrapi.dk
// (DK) is IP-quota-limited at ~50/day empirical; SK RPO is free_unlimited
// because its only limit is a per-IP burst rate, not a cumulative quota.
//
// The remaining ~312 capabilities are Phase B (post-A0b) work — they stay
// cost_class IS NULL and the scheduler/dispatcher fail-closed for internal
// callers while still serving customer_paid traffic during the GRACE window.
//
// Idempotency. Each UPDATE filters `AND cost_class IS NULL`, so a re-run
// after the seed lands is a no-op. A future Phase B classification that
// lands a different cost_class on these rows is also preserved — this
// block only fills in the blank.

export async function runMigration0068_seedDeDkSkCostClass(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  let totalAffected = 0;

  // DE OpenRegister — 50 req/month, resets on the 1st.
  const de = await tx.execute(sql`
    UPDATE capabilities
       SET cost_class = 'free_quota',
           quota_window = 'monthly',
           quota_cap = 50,
           quota_reset_dom = 1,
           updated_at = NOW()
     WHERE slug = 'german-company-data' AND cost_class IS NULL
  `);
  totalAffected += (de as { count?: number }).count ?? 0;

  // DK cvrapi.dk — empirical floor ~50/day, no per-day reset_dom needed.
  const dk = await tx.execute(sql`
    UPDATE capabilities
       SET cost_class = 'free_quota',
           quota_window = 'daily',
           quota_cap = 50,
           updated_at = NOW()
     WHERE slug = 'danish-company-data' AND cost_class IS NULL
  `);
  totalAffected += (dk as { count?: number }).count ?? 0;

  // SK RPO — gov registry, CC-BY 4.0, only 60 req/min/IP burst limit.
  // No cumulative quota → no quota_cap needed.
  const sk = await tx.execute(sql`
    UPDATE capabilities
       SET cost_class = 'free_unlimited',
           quota_window = 'none',
           updated_at = NOW()
     WHERE slug = 'slovak-company-data' AND cost_class IS NULL
  `);
  totalAffected += (sk as { count?: number }).count ?? 0;

  return {
    block: "0068_seed_de_dk_sk_cost_class",
    outcome:
      totalAffected === 0
        ? "no rows to update (DE/DK/SK already classified or missing)"
        : `seeded cost_class on ${totalAffected} row(s) (DE/DK/SK)`,
    rows_affected: totalAffected,
    duration_ms: Date.now() - startedAt,
  };
}
