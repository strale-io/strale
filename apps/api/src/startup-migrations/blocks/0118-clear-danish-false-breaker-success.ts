import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// Block 0118 (2026-09-27): clear the last standing invariant alert,
// `lying_breaker` on `danish-company-data`, which has fired on every
// invariant tick since 2026-08-25 (twelve times a day).
//
// Block 0117 left it alone because the breaker row had been frozen since
// 2026-08-16 while the harness still called the capability daily, and a
// value written without explaining that would paper over a broken writer.
// Explained on 2026-09-27, read-only against production:
//
// - The row is not frozen by a broken writer. Only `/v1/do` writes breaker
//   failures and successes (routes/do.ts); the test runner deliberately never
//   records a failure (test-runner.ts: the breaker is driven by customer
//   traffic) and only feeds `recordTestEvidence`, which is a no-op on a closed
//   row. The last `/v1/do` call to this capability was a `test2@strale.io`
//   call at 2026-08-16T13:49:19.928Z; the row's `last_failure_at` and
//   `updated_at` are 2026-08-16T13:49:20.235Z. Every call since is the
//   internal harness, and the capability is `visible = false`,
//   `x402_enabled = false`, so no customer can reach it.
// - The row's `last_success_at` (2026-08-12T22:38:22.974Z) is false. It
//   lands within milliseconds of the harness's first call, a transaction
//   recorded as `failed` (2026-08-12T22:38:22.979Z), and no test result
//   passed on 2026-08-11 or 2026-08-12. It is the pre-fix
//   `recordTestEvidence` path the invariant exists to catch (it set
//   `last_success_at` from a test that never executed successfully);
//   `total_successes` is 0.
//
// So the correct repair is to remove the one false value, not the alert's
// suggested hand UPDATE, which would add a failure that did not happen.
// `last_success_at = NULL` is what the row would hold had the bug never
// fired. Nothing re-creates the shape: the fixed `shouldRecordTestEvidence`
// gate requires a real execution, and `recordTestEvidence` does nothing to a
// closed row.
//
// The predicate names the slug, the closed state, zero successes, and the
// one-second window holding the false timestamp, so it cannot match a row
// that has since recorded a genuine success. One row, once; ledger-guarded.
// Workload (DEC-20260504-B): a single row. Authority: DEC-20260815-A and
// DEC-20260822-A (obvious, reversible, evidence-backed correction of our
// own data).

export async function runMigration0118_clearDanishFalseBreakerSuccess(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const BLOCK = "0118_clearDanishFalseBreakerSuccess";

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS startup_migration_ledger (
      block text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      rows_affected integer NOT NULL DEFAULT 0
    )`);

  const prior = (await tx.execute(sql`
    SELECT block FROM startup_migration_ledger WHERE block = ${BLOCK}
  `)) as unknown as Array<{ block: string }>;

  if (prior.length > 0) {
    return {
      block: BLOCK,
      outcome: "no change (already applied once)",
      rows_affected: 0,
      duration_ms: Date.now() - startedAt,
    };
  }

  const cleared = (await tx.execute(sql`
    UPDATE capability_health
       SET last_success_at = NULL
     WHERE capability_slug = 'danish-company-data'
       AND state = 'closed'
       AND total_successes = 0
       AND last_success_at >= '2026-08-12T22:38:22Z'::timestamptz
       AND last_success_at <  '2026-08-12T22:38:23Z'::timestamptz
     RETURNING capability_slug
  `)) as unknown as Array<{ capability_slug: string }>;

  if (cleared.length > 0) {
    await tx.execute(sql`
      INSERT INTO health_monitor_events (event_type, capability_slug, tier, action_taken, details, human_override)
      VALUES (
        'auto_fix',
        'danish-company-data',
        2,
        'cleared_false_breaker_success',
        ${JSON.stringify({
          cleared_last_success_at: "2026-08-12T22:38:22.974Z",
          reason:
            "lying_breaker had alerted on every tick since 2026-08-25. The row's last_success_at came from the pre-fix recordTestEvidence path on a harness call recorded as failed; no real success ever occurred (total_successes 0). The row is otherwise accurate: the last /v1/do call was 2026-08-16T13:49Z and the capability is hidden and off x402.",
          source: "startup-migration 0118",
        })}::jsonb,
        true
      )
    `);
  }

  await tx.execute(sql`
    INSERT INTO startup_migration_ledger (block, rows_affected)
    VALUES (${BLOCK}, ${cleared.length})
    ON CONFLICT (block) DO NOTHING
  `);

  return {
    block: BLOCK,
    outcome:
      cleared.length === 0
        ? "no matching false danish-company-data breaker success remains"
        : "cleared the false last_success_at on danish-company-data",
    rows_affected: cleared.length,
    duration_ms: Date.now() - startedAt,
  };
}
