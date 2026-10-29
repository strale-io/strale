import { sql } from "drizzle-orm";
import LEDGER from "../lib/startup-migrations.ledger.json" with { type: "json" };
import { StartupFatalError } from "../lib/startup-fatal.js";
import type { BlockRunPolicy } from "./run-policy.js";
import type { MigrationExecutor } from "./types.js";

/**
 * Applied-block-hash skip (H7d). After a block returns, the runner records
 * the ledger id and sha256 it ran under in `startup_migration_applied`
 * (block 0131). On later boots a block whose run policy is "once" is skipped
 * while its recorded hash equals its ledger hash. Until that table exists
 * (the first boot after this shipped) nothing is skipped, so that boot runs
 * every block exactly as before and then records them.
 */

export interface LedgerRow { id: string; function: string; sha256: string }

export const LEDGER_BY_FUNCTION: ReadonlyMap<string, LedgerRow> = new Map(
  (LEDGER.blocks as LedgerRow[]).map((row) => [row.function, row]),
);

export type BlockPlan = { action: "run" } | { action: "skip"; ledgerId: string };

/**
 * Decides whether one block runs. Throws when the recorded hash differs from
 * the ledger hash: a block is append-only, so a changed hash means its code
 * was edited in place after it ran, and running or skipping it would both be
 * wrong.
 */
export function planBlock(
  name: string,
  ledgerRow: LedgerRow | undefined,
  recordedSha: string | undefined,
  policy: BlockRunPolicy | undefined,
  force: boolean,
): BlockPlan {
  if (recordedSha !== undefined && recordedSha !== ledgerRow?.sha256) {
    throw new StartupFatalError(
      `startup migration ${name} ran with ledger hash ${recordedSha} but its ledger hash is now ${ledgerRow?.sha256 ?? "(no ledger row)"}`,
      `A database migration block was edited after it had already run, which is not allowed. ` +
        `This will not fix itself by restarting. Roll back: Railway dashboard -> Deployments -> ` +
        `previous working deploy -> Redeploy, and ask for the edit to be made as a new block.`,
    );
  }
  if (!force && policy === "once" && ledgerRow && recordedSha === ledgerRow.sha256) {
    return { action: "skip", ledgerId: ledgerRow.id };
  }
  return { action: "run" };
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] })?.rows ?? []) as T[];
}

/** Recorded hash per function name, or null while the table does not exist yet. */
export async function readApplied(db: MigrationExecutor): Promise<Map<string, string> | null> {
  const present = rowsOf<{ present: boolean }>(await db.execute(sql`
    SELECT to_regclass('startup_migration_applied') IS NOT NULL AS present
  `));
  if (!present[0]?.present) return null;
  const rows = rowsOf<{ function_name: string; sha256: string }>(await db.execute(sql`
    SELECT function_name, sha256 FROM startup_migration_applied
  `));
  return new Map(rows.map((r) => [r.function_name, r.sha256]));
}

export async function recordApplied(db: MigrationExecutor, row: LedgerRow): Promise<void> {
  await db.execute(sql`
    INSERT INTO startup_migration_applied (function_name, ledger_id, sha256)
    VALUES (${row.function}, ${row.id}, ${row.sha256})
    ON CONFLICT (function_name) DO UPDATE SET
      ledger_id = EXCLUDED.ledger_id,
      sha256 = EXCLUDED.sha256,
      last_applied_at = now()
  `);
}
