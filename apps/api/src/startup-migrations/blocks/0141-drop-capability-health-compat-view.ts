import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0141: drop the capability_health compatibility view (H7) ──────────
//
// Block 0134 renamed `capability_health` to `source_health` and left a view
// under the old name in the same statement, so a build deployed before the
// rename kept reading and writing while the new one booted. This is the
// contract half of that expand/contract: the view goes away.
//
// Why it is safe to drop now (read-only production checks, 2026-10-30):
// production has run the renamed build since 0134 first applied at
// 2026-10-29T16:22:53Z, `capability_health` is relkind `v` and `source_health`
// relkind `r` with 318 rows and its drizzle-derived constraint names, and the
// breaker is still recording through the table (317 closed, 1 open). No
// application code names the old table: the only remaining writer by that
// name is block 0118, which returns before its UPDATE on any database where
// it has already run (production: first and last applied 2026-10-29T01:21:42Z).
// Postgres keeps no read counters for views and `pg_stat_statements` is not
// installed here (checked), so the deploy record is the signal, as the H7
// rename handoff said it would be.
//
// Rollback hazard, stated plainly: after this block runs, a build between 0132
// and 0134 — one that names `capability_health` — can no longer read or write
// the circuit-breaker table, so its breaker reads fail. Rolling back that far
// needs the view recreated by hand
// (`CREATE VIEW capability_health AS SELECT * FROM source_health`). A build
// older than 0132 is already incompatible for a second reason: 0132 dropped
// the SQS residual columns and the `sqs_daily_snapshot` table, which the view
// does not bring back.
//
// On a fresh database `drizzle-kit push` creates the view from schema.ts
// (`capabilityHealthCompat`), block 0118 updates through it, and this block —
// which runs after 0118 — drops it, so a fresh database ends in the same
// shape as production. That is why the declaration stays in schema.ts.
//
// It refuses to act unless the name is a view, so it can never drop the
// table, and it uses a bare DROP VIEW (never CASCADE), so a dependent object
// fails the boot loudly instead of being dropped with it.
//
// Workload (DEC-20260504-B): one catalogue statement, no rows touched.
export async function runMigration0141_dropCapabilityHealthCompatView(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const BLOCK = "0141_dropCapabilityHealthCompatView";

  const rows = (await tx.execute(sql`
    SELECT
      (SELECT relkind::text FROM pg_class WHERE oid = to_regclass('capability_health')) AS old_kind,
      (SELECT relkind::text FROM pg_class WHERE oid = to_regclass('source_health')) AS new_kind
  `)) as unknown as Array<{ old_kind: string | null; new_kind: string | null }>;
  const oldKind = rows[0]?.old_kind ?? null;
  // A table, deliberately: if source_health were itself a view — someone
  // reversing the rename by hand — dropping the old name could orphan the
  // real table, so the block refuses rather than guessing.
  const newPresent = rows[0]?.new_kind === "r";

  if (oldKind === null) {
    return {
      block: BLOCK,
      outcome: "no change (capability_health is absent)",
      rows_affected: 0,
      duration_ms: Date.now() - startedAt,
    };
  }

  if (oldKind !== "v") {
    throw new Error(
      `block 0141: capability_health is relkind ${oldKind}, not a view; refusing to drop it`,
    );
  }

  if (!newPresent) {
    throw new Error(
      `block 0141: source_health is ${rows[0]?.new_kind === null || rows[0]?.new_kind === undefined ? "absent" : `relkind ${rows[0]?.new_kind}`}, not a table, so dropping the capability_health view could leave no breaker surface; refusing`,
    );
  }

  await tx.execute(sql`DROP VIEW capability_health`);

  return {
    block: BLOCK,
    outcome: "dropped the capability_health compatibility view; source_health is the only name",
    rows_affected: 0,
    duration_ms: Date.now() - startedAt,
  };
}
