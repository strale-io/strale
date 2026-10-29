import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0134: rename capability_health to source_health (H7) ──────────────
//
// The table holds circuit-breaker state, which survived the SQS deletion
// (DEC-20260503-B); the new name says what it tracks. The rename is
// mechanical: same columns, same rows, same behaviour.
//
// Expand/contract: a build deployed before this block keeps serving while the
// new one boots, and it names capability_health. So the rename and a view
// under the old name happen in ONE statement (a DO block runs as a single
// transaction even though the runner opens none): there is no moment where
// capability_health resolves to nothing. The view is a plain SELECT * over
// one table, which Postgres updates automatically, so the old build's
// inserts (base-table defaults apply), ON CONFLICT upserts, updates and
// SELECT ... FOR UPDATE all keep working through it. A later block drops the
// view once production shows no reads of the old name; until then a rollback
// to a build before this block also keeps working.
//
// Constraint and index names that start with capability_health_ are renamed
// to match, so production carries the names drizzle derives for source_health
// (source_health_pkey, source_health_capability_slug_unique), as a fresh
// database does.
//
// Workload (DEC-20260504-B): a rename is a catalogue change, not a table
// rewrite, so its cost does not depend on the row count. The table holds at
// most one row per capability slug (its unique constraint). The block measures
// it anyway and reports rows and bytes in its outcome. It needs an ACCESS
// EXCLUSIVE lock for the length of a catalogue update; the runner's
// lock_timeout and retries bound the wait.
//
// Runs only while capability_health is a table. Afterwards the name is the
// view (or, after the later drop, nothing), and on a fresh database
// schema.ts creates source_health directly, so the block skips.
export async function runMigration0134_renameCapabilityHealthToSourceHealth(tx: MigrationExecutor): Promise<BlockResult> {
  const startedAt = Date.now();
  const BLOCK = "0134_renameCapabilityHealthToSourceHealth";
  const state = (await tx.execute(sql`
    SELECT
      (SELECT relkind::text FROM pg_class WHERE oid = to_regclass('capability_health')) AS old_kind,
      to_regclass('source_health') IS NOT NULL AS new_present
  `)) as unknown as Array<{ old_kind: string | null; new_present: boolean }>;
  const { old_kind: oldKind, new_present: newPresent } = state[0];

  if (oldKind !== "r") {
    return { block: BLOCK, outcome: `skipped (capability_health is ${oldKind === null ? "absent" : `relkind ${oldKind}`}; source_health ${newPresent ? "present" : "absent"})`, rows_affected: 0, duration_ms: Date.now() - startedAt };
  }
  if (newPresent) {
    // Both names hold data: renaming would fail, and picking one would lose
    // the other's rows. Abort boot rather than guess.
    throw new Error("block 0134: capability_health and source_health both exist as relations; refusing to rename");
  }

  const measured = (await tx.execute(sql`
    SELECT count(*)::int AS row_count, pg_total_relation_size('capability_health')::bigint AS bytes
    FROM capability_health
  `)) as unknown as Array<{ row_count: number; bytes: string | number }>;
  const { row_count: rowCount, bytes } = measured[0];

  await tx.execute(sql.raw(`
    DO $rename$
    DECLARE
      r record;
    BEGIN
      IF (SELECT relkind FROM pg_class WHERE oid = to_regclass('capability_health')) = 'r' THEN
        ALTER TABLE capability_health RENAME TO source_health;
        FOR r IN
          SELECT conname FROM pg_constraint
          WHERE conrelid = 'source_health'::regclass AND conname LIKE 'capability\\_health\\_%'
        LOOP
          EXECUTE format('ALTER TABLE source_health RENAME CONSTRAINT %I TO %I',
            r.conname, 'source_health' || substr(r.conname, length('capability_health') + 1));
        END LOOP;
        FOR r IN
          SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
          WHERE i.indrelid = 'source_health'::regclass AND c.relname LIKE 'capability\\_health\\_%'
        LOOP
          EXECUTE format('ALTER INDEX %I RENAME TO %I',
            r.relname, 'source_health' || substr(r.relname, length('capability_health') + 1));
        END LOOP;
        CREATE VIEW capability_health AS SELECT * FROM source_health;
      END IF;
    END
    $rename$
  `));

  return {
    block: BLOCK,
    outcome: `renamed capability_health to source_health (${rowCount} rows, ${Number(bytes)} bytes) and left a capability_health view`,
    rows_affected: 0,
    duration_ms: Date.now() - startedAt,
  };
}
