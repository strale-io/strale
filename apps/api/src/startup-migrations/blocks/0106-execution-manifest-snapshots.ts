import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Phase 4 (execution receipts) — immutable manifest snapshots.
 *
 * The table is content-addressed: `digest` is a function of `snapshot`, so a
 * snapshot cannot change without changing its own primary key. That makes
 * mutation *pointless*, not impossible — these triggers make it impossible.
 *
 * Both refusals are deliberate and neither is defensive decoration:
 *
 *  - UPDATE would let the bytes behind a digest change while receipts keep
 *    pointing at it, so every receipt referencing it would silently start
 *    meaning something else.
 *  - DELETE would make every receipt referencing it unverifiable, with no
 *    error anywhere. Generic retention gets a loud error instead of a row
 *    count. `db-retention.ts` is separately asserted never to list this table
 *    (see execution-receipt.integration.test.ts) — belt and braces, because
 *    the failure is silent and permanent.
 */
export async function runMigration0106_executionManifestSnapshots(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS execution_manifest_snapshots (
      digest        varchar(71) PRIMARY KEY,
      subject_kind  varchar(16) NOT NULL,
      subject_slug  text        NOT NULL,
      snapshot      jsonb       NOT NULL,
      first_seen_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT execution_manifest_snapshots_digest_shape
        CHECK (digest ~ '^sha256:[0-9a-f]{64}$'),
      CONSTRAINT execution_manifest_snapshots_subject_kind
        CHECK (subject_kind IN ('capability', 'solution'))
    )
  `);

  await tx.execute(sql`
    CREATE OR REPLACE FUNCTION "execution_manifest_snapshots_are_immutable"()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION
        'execution_manifest_snapshots is insert-only: % on digest % refused. '
        'Snapshots are the only record of what a capability declared when a '
        'receipt was issued; changing or removing one makes every receipt that '
        'references it silently wrong or unverifiable.',
        TG_OP, COALESCE(OLD.digest, '(unknown)');
    END;
    $$ LANGUAGE plpgsql
  `);

  await tx.execute(sql`
    DROP TRIGGER IF EXISTS execution_manifest_snapshots_no_update
      ON execution_manifest_snapshots
  `);
  await tx.execute(sql`
    CREATE TRIGGER execution_manifest_snapshots_no_update
      BEFORE UPDATE ON execution_manifest_snapshots
      FOR EACH ROW EXECUTE FUNCTION "execution_manifest_snapshots_are_immutable"()
  `);

  await tx.execute(sql`
    DROP TRIGGER IF EXISTS execution_manifest_snapshots_no_delete
      ON execution_manifest_snapshots
  `);
  await tx.execute(sql`
    CREATE TRIGGER execution_manifest_snapshots_no_delete
      BEFORE DELETE ON execution_manifest_snapshots
      FOR EACH ROW EXECUTE FUNCTION "execution_manifest_snapshots_are_immutable"()
  `);

  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS execution_manifest_snapshots_subject_idx
      ON execution_manifest_snapshots (subject_kind, subject_slug)
  `);

  // Verify the triggers exist and are ENABLED. A trigger that is present but
  // disabled ('D') is the nameable failure here — the table would accept
  // mutation while every reader assumed it could not.
  const trg = await tx.execute(sql`
    SELECT tgname, tgenabled FROM pg_trigger
     WHERE tgrelid = 'execution_manifest_snapshots'::regclass
       AND NOT tgisinternal
     ORDER BY tgname
  `);
  const rows = trg as unknown as Array<{ tgname: string; tgenabled: string }>;
  const enabled = rows.filter((r) => r.tgenabled === 'O').map((r) => r.tgname);
  if (!enabled.includes("execution_manifest_snapshots_no_update") ||
      !enabled.includes("execution_manifest_snapshots_no_delete")) {
    throw new Error(
      "execution_manifest_snapshots immutability triggers are missing or disabled " +
        `(found: ${JSON.stringify(rows)}). Refusing to report success: without both, ` +
        "a snapshot can be changed or pruned and every receipt referencing it becomes " +
        "silently wrong or permanently unverifiable.",
    );
  }

  return {
    block: "0106_execution_manifest_snapshots",
    outcome: "table + UPDATE/DELETE refusal triggers present and verified enabled",
    duration_ms: Date.now() - startedAt,
  };
}
