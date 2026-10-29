/**
 * Block 0132 on a real Postgres: recreates the residual SQS schema the way
 * production still has it (drizzle push no longer creates it), runs the
 * block, and reads the catalogue to prove what is gone and what was counted.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";

import { useTestDatabase } from "../test-support/integration-db.js";
import { runMigration0132_dropSqsResidualSchema } from "../startup-migrations/blocks/0132-drop-sqs-residual-schema.js";
import { recordSqsFieldsRemovedAndServing, SQS_RETIREMENT_MARKER } from "../startup-migrations/sqs-schema-retirement.js";

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

const SQS_COLUMNS = ["qp_score", "rp_score", "matrix_sqs", "matrix_sqs_raw", "trend",
  "guidance_usable", "guidance_strategy", "guidance_confidence"];

describeMaybe("block 0132 drops the residual SQS schema", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 2 });
    db = drizzle(client);
    await db.execute(sql`
      ALTER TABLE capabilities
        ADD COLUMN IF NOT EXISTS qp_score decimal(5,2),
        ADD COLUMN IF NOT EXISTS rp_score decimal(5,2),
        ADD COLUMN IF NOT EXISTS matrix_sqs decimal(5,2),
        ADD COLUMN IF NOT EXISTS matrix_sqs_raw decimal(5,1),
        ADD COLUMN IF NOT EXISTS trend varchar(20) DEFAULT 'stable',
        ADD COLUMN IF NOT EXISTS guidance_usable boolean,
        ADD COLUMN IF NOT EXISTS guidance_strategy text,
        ADD COLUMN IF NOT EXISTS guidance_confidence decimal(5,1)
    `);
    // Start from exactly the rows seeded here, whatever an earlier run left.
    await db.execute(sql`DROP TABLE IF EXISTS sqs_daily_snapshot`);
    await db.execute(sql`
      CREATE TABLE sqs_daily_snapshot (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        capability_slug varchar(100) NOT NULL,
        snapshot_date date NOT NULL,
        matrix_sqs decimal(5,2) NOT NULL
      )
    `);
    await db.execute(sql`
      INSERT INTO sqs_daily_snapshot (capability_slug, snapshot_date, matrix_sqs)
      VALUES ('a', '2026-05-01', 80), ('b', '2026-05-01', 70), ('c', '2026-05-02', 60)
    `);
    await db.execute(sql`DELETE FROM startup_migration_ledger WHERE block = ${SQS_RETIREMENT_MARKER}`);
  });

  const sqsColumnCount = async () => ((await db.execute(sql`
    SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'capabilities' AND column_name = ANY(${`{${SQS_COLUMNS.join(",")}}`}::text[])
  `)) as unknown as Array<{ n: number }>)[0].n;

  it("defers while no build without the SQS fields has recorded that it serves", async () => {
    const result = await runMigration0132_dropSqsResidualSchema(db);
    expect(result).toMatchObject({ rows_affected: 0 });
    expect(result.outcome).toMatch(/^deferred/);
    expect(await sqsColumnCount()).toBe(8);
  });

  it("still defers when that build started serving less than the delay ago", async () => {
    await recordSqsFieldsRemovedAndServing(db);
    await recordSqsFieldsRemovedAndServing(db); // idempotent
    const result = await runMigration0132_dropSqsResidualSchema(db);
    expect(result.outcome).toMatch(/^deferred/);
    expect(await sqsColumnCount()).toBe(8);
    // The old instance has been gone for a while by the next boot.
    await db.execute(sql`
      UPDATE startup_migration_ledger SET applied_at = now() - interval '11 minutes'
      WHERE block = ${SQS_RETIREMENT_MARKER}
    `);
  });

  afterAll(async () => {
    await client.end();
  });

  it("measures what it drops, then drops every column and the table", async () => {
    const result = await runMigration0132_dropSqsResidualSchema(db);
    expect(result.rows_affected).toBe(3);
    expect(result.outcome).toMatch(/^dropped 8 SQS columns from \d+ capabilities rows and sqs_daily_snapshot \(3 rows, \d+ bytes\)$/);

    const columns = (await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'capabilities'
    `)) as unknown as Array<{ column_name: string }>;
    const names = columns.map((c) => c.column_name);
    for (const col of SQS_COLUMNS) expect(names, col).not.toContain(col);
    // Columns that sit next to them in the old schema are untouched.
    expect(names).toContain("freshness_level");
    expect(names).toContain("lifecycle_state");

    const table = (await db.execute(sql`SELECT to_regclass('sqs_daily_snapshot') AS t`)) as unknown as Array<{ t: string | null }>;
    expect(table[0].t).toBeNull();
  });

  it("a re-run finds nothing and changes nothing", async () => {
    const again = await runMigration0132_dropSqsResidualSchema(db);
    expect(again).toMatchObject({ outcome: "skipped (already dropped)", rows_affected: 0 });
  });
});
