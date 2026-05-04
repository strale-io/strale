/**
 * Apply pending migrations for ACI session.
 * Run via: railway run npx tsx scripts/apply-migrations.ts
 */

import { sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";

async function main() {
  const db = getDb();

  // Migration 0028: sqs_daily_snapshot table
  console.log("[migration] Checking sqs_daily_snapshot...");
  const check1 = await db.execute(sql`
    SELECT count(*)::text as cnt FROM information_schema.tables
    WHERE table_name = 'sqs_daily_snapshot'
  `);
  const rows1 = Array.isArray(check1) ? check1 : (check1 as any)?.rows ?? [];
  if (rows1[0]?.cnt === "0") {
    console.log("[migration] Creating sqs_daily_snapshot table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "sqs_daily_snapshot" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "capability_slug" text NOT NULL,
        "snapshot_date" date NOT NULL,
        "matrix_sqs" numeric(5, 2) NOT NULL,
        "qp_score" numeric(5, 2),
        "rp_score" numeric(5, 2),
        "qp_grade" varchar(2),
        "rp_grade" varchar(2),
        "trend" varchar(20),
        "health_state" varchar(20),
        "runs_analyzed" integer,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "sqs_daily_snapshot_slug_date_unique"
      ON "sqs_daily_snapshot" ("capability_slug", "snapshot_date")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "sqs_daily_snapshot_slug_date_desc_idx"
      ON "sqs_daily_snapshot" ("capability_slug", "snapshot_date" DESC)
    `);
    console.log("[migration] sqs_daily_snapshot created");
  } else {
    console.log("[migration] sqs_daily_snapshot already exists — skipping");
  }

  // Migration 0029: actual_cost_cents on test_run_log
  console.log("[migration] Checking test_run_log.actual_cost_cents...");
  const check2 = await db.execute(sql`
    SELECT count(*)::text as cnt FROM information_schema.columns
    WHERE table_name = 'test_run_log' AND column_name = 'actual_cost_cents'
  `);
  const rows2 = Array.isArray(check2) ? check2 : (check2 as any)?.rows ?? [];
  if (rows2[0]?.cnt === "0") {
    console.log("[migration] Adding actual_cost_cents column...");
    await db.execute(sql`
      ALTER TABLE "test_run_log" ADD COLUMN "actual_cost_cents" integer DEFAULT 0 NOT NULL
    `);
    console.log("[migration] actual_cost_cents added");
  } else {
    console.log("[migration] actual_cost_cents already exists — skipping");
  }

  // Migration 0061: archive + truncate solutions + solution_steps per
  // DEC-20260503-A. Idempotent because the archive tables use IF NOT
  // EXISTS, the source tables are TRUNCATEd unconditionally each run,
  // and a second run finds the live tables already empty (no-op).
  // After archive tables exist on first run, future runs skip the
  // CREATE TABLE AS step (no clobber) but still re-TRUNCATE — fine
  // because the schema's intended steady state is empty live tables.
  console.log("[migration] Ensuring solutions archive + truncate (DEC-20260503-A)...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS solutions_archived_2026_05_04 AS
      SELECT *, NOW() AS archived_at FROM solutions
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS solution_steps_archived_2026_05_04 AS
      SELECT *, NOW() AS archived_at FROM solution_steps
  `);
  // TRUNCATE both. Using two statements keeps intent explicit; CASCADE
  // on solutions handles the FK to solution_steps either way.
  await db.execute(sql`TRUNCATE TABLE solutions CASCADE`);
  await db.execute(sql`TRUNCATE TABLE solution_steps`);
  console.log("[migration] solutions retired (archived + truncated)");

  console.log("[migration] All migrations applied");
  process.exit(0);
}

main().catch((e) => {
  console.error("[migration] FAILED:", e);
  process.exit(1);
});
