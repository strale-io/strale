import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0067: cost_class taxonomy columns on `capabilities` ──────────────
//
// Adds four nullable columns plus CHECK constraints. NULL means "not yet
// classified" — scheduler skips, dispatcher refuses internal callers, but
// customer_paid still flows through (Phase A0b GRACE-mode self-throttling).
// Phase B will backfill the remaining ~312 caps under no time pressure;
// commit #2's Block 0068 seeds DE/DK/SK because OpenRegister's free-tier
// quota resets 2026-06-01 and the scheduler would burn the next cycle
// without the gate.
//
// Idempotency. Each ADD COLUMN uses IF NOT EXISTS; CHECK constraints are
// guarded by a NOT EXISTS lookup against pg_constraint so the second
// invocation is a no-op.
//
// Rollback. ALTER TABLE ... DROP COLUMN cascades any downstream UPDATE
// blocks (0068 etc.) automatically. See "## Rollback" in the Phase A0b
// prompt for the manual SQL.

export async function runMigration0067_costClassTaxonomy(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  // Columns first (idempotent).
  await tx.execute(sql`
    ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS cost_class TEXT
  `);
  await tx.execute(sql`
    ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS quota_window TEXT
  `);
  await tx.execute(sql`
    ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS quota_cap INTEGER
  `);
  await tx.execute(sql`
    ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS quota_reset_dom INTEGER
  `);

  // Constraints — guard each with a NOT EXISTS lookup so re-runs no-op.
  // information_schema.constraint_column_usage doesn't expose CHECK
  // constraints reliably across PG versions; pg_constraint is the
  // authoritative catalog.
  const ensureConstraint = async (
    name: string,
    definition: string,
  ): Promise<void> => {
    const exists = await tx.execute(sql`
      SELECT count(*)::text AS cnt FROM pg_constraint
      WHERE conname = ${name} AND conrelid = 'capabilities'::regclass
    `);
    const rows = Array.isArray(exists) ? exists : (exists as { rows?: unknown[] })?.rows ?? [];
    if ((rows[0] as { cnt?: string })?.cnt === "0") {
      // Note: sql.raw is acceptable here because both `name` and `definition`
      // are hardcoded literals controlled by this file, not user input.
      await tx.execute(
        sql.raw(`ALTER TABLE capabilities ADD CONSTRAINT ${name} CHECK (${definition})`),
      );
    }
  };

  await ensureConstraint(
    "capabilities_cost_class_chk",
    `cost_class IS NULL OR cost_class IN ('free_unlimited', 'free_quota', 'paid_with_free_tier', 'paid_prepaid', 'paid_subscription')`,
  );
  await ensureConstraint(
    "capabilities_quota_window_chk",
    `quota_window IS NULL OR quota_window IN ('daily', 'monthly', 'none')`,
  );
  await ensureConstraint(
    "capabilities_quota_reset_dom_chk",
    `quota_reset_dom IS NULL OR (quota_reset_dom >= 1 AND quota_reset_dom <= 31)`,
  );

  return {
    block: "0067_cost_class_taxonomy",
    outcome: "columns + CHECK constraints ensured",
    duration_ms: Date.now() - startedAt,
  };
}
