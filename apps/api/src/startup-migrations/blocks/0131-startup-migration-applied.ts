import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0131: the ledger hash each block last ran with (H7d) ──────────────
//
// The runner writes one row per block after the block returns, keyed by its
// function name, carrying the ledger id and sha256 it ran under. Blocks whose
// run policy is "once" are skipped on later boots while the recorded hash
// equals the ledger hash; a recorded hash that differs is a boot failure,
// because a block's content cannot change in place. Separate from
// `startup_migration_ledger`, which individual blocks use for their own
// one-shot guards and which the runner never writes.
export async function runMigration0131_startupMigrationApplied(tx: MigrationExecutor): Promise<BlockResult> {
  const startedAt = Date.now();
  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS startup_migration_applied (
      function_name text PRIMARY KEY,
      ledger_id text NOT NULL,
      sha256 text NOT NULL,
      first_applied_at timestamptz NOT NULL DEFAULT now(),
      last_applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  return { block: "0131_startupMigrationApplied", outcome: "ensured startup_migration_applied", duration_ms: Date.now() - startedAt };
}
