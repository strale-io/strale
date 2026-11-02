import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0137 — finish what block 0030 may have left half done.
 *
 * Block 0030 adds three `transactions` columns and an index, but decides
 * whether to run by looking at the first column only, and the runner opens no
 * transaction around a block. A boot that died after `integrity_hash` was added
 * and before `legal_hold` was would leave every later boot skipping 0030 with
 * "columns already exist", forever.
 *
 * This block ensures each object on its own, so it completes a partial run and
 * is a no-op on a complete one (production, and every fresh database where
 * drizzle-kit push already created the columns). No block between 0030 and
 * here reads `previous_hash` or `legal_hold` (0097, 0108 and 0127 touch only
 * `integrity_hash`, which a partial 0030 always has), so a partial state
 * reaches this block instead of failing an earlier one. `ADD COLUMN IF NOT EXISTS` on an existing
 * `legal_hold` changes nothing: Postgres skips the whole clause, default and
 * NOT NULL included.
 */
export async function runMigration0137_completeComplianceColumns(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const before = (await tx.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'transactions'
      AND column_name IN ('integrity_hash', 'previous_hash', 'legal_hold')
  `)) as unknown as Array<{ column_name: string }>;
  const present = new Set((Array.isArray(before) ? before : []).map((r) => r.column_name));
  const missing = ["integrity_hash", "previous_hash", "legal_hold"].filter((c) => !present.has(c));

  await tx.execute(sql`ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "integrity_hash" varchar(128)`);
  await tx.execute(sql`ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "previous_hash" varchar(128)`);
  await tx.execute(sql`ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "legal_hold" boolean DEFAULT false NOT NULL`);
  await tx.execute(sql`CREATE INDEX IF NOT EXISTS "transactions_integrity_hash_idx" ON "transactions" ("integrity_hash")`);

  return {
    block: "0137_completeComplianceColumns",
    outcome:
      missing.length === 0
        ? "no change (all three compliance columns present; index ensured)"
        : `added missing compliance column(s) ${missing.join(", ")} left by a partial 0030; index ensured`,
    duration_ms: Date.now() - startedAt,
  };
}
