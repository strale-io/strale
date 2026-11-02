import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * WP10 (CR-08) — the durable job schedule.
 *
 * Creates the table that owns "when is this job next due". Idempotent DDL, so
 * unlike 0102 it needs no ledger gate: the point of the table is that its
 * CONTENT survives deploys, and `CREATE TABLE IF NOT EXISTS` never touches
 * content.
 *
 * The verification below is deliberately behavioural rather than a mere
 * existence check. `next_run_at` being NOT NULL is the invariant the whole
 * package rests on: a nullable column would let a row exist with no schedule,
 * and `claimJob`'s `next_run_at <= now()` predicate would silently never match
 * — a job that appears registered and never runs, which is a worse failure
 * than the boot-relative scheduling it replaces.
 */
export async function runMigration0104_jobSchedule(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS job_schedule (
      job_name             varchar(64) PRIMARY KEY,
      interval_ms          bigint      NOT NULL,
      next_run_at          timestamptz NOT NULL,
      lease_owner          varchar(64),
      lease_expires_at     timestamptz,
      last_started_at      timestamptz,
      last_finished_at     timestamptz,
      last_outcome         varchar(16),
      last_error           text,
      consecutive_failures integer     NOT NULL DEFAULT 0,
      updated_at           timestamptz NOT NULL DEFAULT now()
    )
  `);

  // Poll cycle reads "which jobs are due"; this keeps that a range scan
  // rather than a seq scan once the table has a row per job.
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS job_schedule_due_idx ON job_schedule (next_run_at)
  `);

  const notNull = await tx.execute(sql`
    SELECT is_nullable FROM information_schema.columns
     WHERE table_name = 'job_schedule' AND column_name = 'next_run_at'
  `);
  const nullable = (notNull as unknown as Array<{ is_nullable?: string }>)[0]?.is_nullable;
  if (nullable !== "NO") {
    throw new Error(
      `job_schedule.next_run_at is nullable (is_nullable=${String(nullable)}). Refusing to ` +
        "report success: a row with a NULL next_run_at can never satisfy claimJob's " +
        "`next_run_at <= now()` predicate, so the job would look registered and never run.",
    );
  }

  return {
    block: "0104_job_schedule",
    outcome: "job_schedule present, next_run_at verified NOT NULL",
    duration_ms: Date.now() - startedAt,
  };
}
