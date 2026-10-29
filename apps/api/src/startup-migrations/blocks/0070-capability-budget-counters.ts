import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0070: capability_budget_counters table ───────────────────────────
//
// Per-capability test-budget counter (free_quota / paid_with_free_tier).
// Modeled on rate_limit_counters (composite PK + atomic ON CONFLICT
// increment). budget_cap is snapshotted at counter creation from
// capabilities.quota_cap × 5..20% depending on cost_class + window kind;
// see guarded-executor.ts for the formula.
//
// Idempotency. CREATE TABLE IF NOT EXISTS; CHECK constraint guarded by
// pg_constraint NOT EXISTS lookup.

export async function runMigration0070_capabilityBudgetCounters(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS capability_budget_counters (
      capability_slug TEXT NOT NULL,
      window_start TIMESTAMP WITH TIME ZONE NOT NULL,
      window_kind TEXT NOT NULL,
      test_count INTEGER NOT NULL DEFAULT 0,
      budget_cap INTEGER NOT NULL,
      alert_30_fired_at TIMESTAMP WITH TIME ZONE,
      alert_50_fired_at TIMESTAMP WITH TIME ZONE,
      alert_80_fired_at TIMESTAMP WITH TIME ZONE,
      hard_stop_fired_at TIMESTAMP WITH TIME ZONE,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      PRIMARY KEY (capability_slug, window_start, window_kind)
    )
  `);

  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS capability_budget_counters_window_idx
      ON capability_budget_counters (window_kind, window_start)
  `);

  // CHECK constraint guarded against re-add.
  const checkExists = await tx.execute(sql`
    SELECT count(*)::text AS cnt FROM pg_constraint
    WHERE conname = 'capability_budget_counters_window_kind_chk'
      AND conrelid = 'capability_budget_counters'::regclass
  `);
  const rows = Array.isArray(checkExists)
    ? checkExists
    : (checkExists as { rows?: unknown[] })?.rows ?? [];
  if ((rows[0] as { cnt?: string })?.cnt === "0") {
    await tx.execute(sql`
      ALTER TABLE capability_budget_counters
        ADD CONSTRAINT capability_budget_counters_window_kind_chk
        CHECK (window_kind IN ('daily', 'monthly'))
    `);
  }

  return {
    block: "0070_capability_budget_counters",
    outcome: "table + index + CHECK ensured",
    duration_ms: Date.now() - startedAt,
  };
}
