/**
 * Block 0132 on a real Postgres: recreates the residual SQS schema the way
 * production still has it (drizzle push no longer creates it), sets the
 * retirement heartbeat to each state that matters, and reads the catalogue to
 * prove what is gone, what was counted, and when the block refuses to drop.
 * Every case sets its own state, so the cases do not depend on their order.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";

import { useTestDatabase } from "../test-support/integration-db.js";
import { runMigration0132_dropSqsResidualSchema } from "../startup-migrations/blocks/0132-drop-sqs-residual-schema.js";
import {
  recordSqsFieldsRemovedAndServing,
  SQS_RETIREMENT_LAST_BEAT,
  SQS_RETIREMENT_MARKER,
} from "../startup-migrations/sqs-schema-retirement.js";

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

const SQS_COLUMNS = ["qp_score", "rp_score", "matrix_sqs", "matrix_sqs_raw", "trend",
  "guidance_usable", "guidance_strategy", "guidance_confidence"];

describeMaybe("block 0132 drops the residual SQS schema", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;

  async function recreateResidualSchema() {
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
  }

  /** Heartbeat state: first live beat and latest beat, as minutes ago (null = absent). */
  async function setBeats(firstMinutesAgo: number | null, lastMinutesAgo: number | null) {
    await db.execute(sql`DELETE FROM startup_migration_ledger WHERE block IN (${SQS_RETIREMENT_MARKER}, ${SQS_RETIREMENT_LAST_BEAT})`);
    if (firstMinutesAgo !== null) {
      await db.execute(sql`INSERT INTO startup_migration_ledger (block, applied_at)
        VALUES (${SQS_RETIREMENT_MARKER}, now() - make_interval(mins => ${firstMinutesAgo}))`);
    }
    if (lastMinutesAgo !== null) {
      await db.execute(sql`INSERT INTO startup_migration_ledger (block, applied_at)
        VALUES (${SQS_RETIREMENT_LAST_BEAT}, now() - make_interval(mins => ${lastMinutesAgo}))`);
    }
  }

  const sqsColumnCount = async () => ((await db.execute(sql`
    SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'capabilities'
      AND column_name = ANY(${`{${SQS_COLUMNS.join(",")}}`}::text[])
  `)) as unknown as Array<{ n: number }>)[0].n;
  const snapshotExists = async () => ((await db.execute(sql`
    SELECT to_regclass('sqs_daily_snapshot') IS NOT NULL AS present
  `)) as unknown as Array<{ present: boolean }>)[0].present;

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 2 });
    db = drizzle(client);
  });

  beforeEach(async () => {
    await recreateResidualSchema();
  });

  afterAll(async () => {
    // Leave the lane's database as the deployed schema expects it.
    await setBeats(15, 1);
    await runMigration0132_dropSqsResidualSchema(db);
    await db.execute(sql`DELETE FROM startup_migration_ledger WHERE block IN (${SQS_RETIREMENT_MARKER}, ${SQS_RETIREMENT_LAST_BEAT})`);
    await client.end();
  });

  for (const [name, first, last] of [
    ["no build without the fields has beaten", null, null],
    ["that build has been live for less than the delay", 2, 0],
    ["its beats stopped (a rollback to old code)", 60, 30],
  ] as const) {
    it(`defers when ${name}`, async () => {
      await setBeats(first, last);
      const result = await runMigration0132_dropSqsResidualSchema(db);
      expect(result).toMatchObject({ rows_affected: 0 });
      expect(result.outcome).toMatch(/^deferred/);
      expect(await sqsColumnCount()).toBe(8);
      expect(await snapshotExists()).toBe(true);
    });
  }

  it("the heartbeat writes both keys and keeps the first one fixed", async () => {
    await setBeats(null, null);
    await recordSqsFieldsRemovedAndServing(db);
    await db.execute(sql`UPDATE startup_migration_ledger SET applied_at = now() - interval '1 hour'
      WHERE block IN (${SQS_RETIREMENT_MARKER}, ${SQS_RETIREMENT_LAST_BEAT})`);
    await recordSqsFieldsRemovedAndServing(db);
    const rows = (await db.execute(sql`
      SELECT block, applied_at < now() - interval '30 minutes' AS old
      FROM startup_migration_ledger WHERE block IN (${SQS_RETIREMENT_MARKER}, ${SQS_RETIREMENT_LAST_BEAT})
    `)) as unknown as Array<{ block: string; old: boolean }>;
    expect(Object.fromEntries(rows.map((r) => [r.block, r.old]))).toEqual({
      [SQS_RETIREMENT_MARKER]: true, // first live beat stays fixed
      [SQS_RETIREMENT_LAST_BEAT]: false, // latest beat moves
    });
  });

  it("drops every column and the table once that build has been live long enough and still beats; a re-run does nothing", async () => {
    await setBeats(15, 1);
    const result = await runMigration0132_dropSqsResidualSchema(db);
    expect(result.rows_affected).toBe(3);
    expect(result.outcome).toMatch(/^dropped 8 SQS columns from \d+ capabilities rows and sqs_daily_snapshot \(3 rows, \d+ bytes\)$/);
    expect(await sqsColumnCount()).toBe(0);
    expect(await snapshotExists()).toBe(false);

    const columns = (await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'capabilities'
    `)) as unknown as Array<{ column_name: string }>;
    // Columns that sat next to them in the old schema are untouched.
    expect(columns.map((c) => c.column_name)).toEqual(expect.arrayContaining(["freshness_level", "lifecycle_state"]));

    const again = await runMigration0132_dropSqsResidualSchema(db);
    expect(again).toMatchObject({ outcome: "skipped (already dropped)", rows_affected: 0 });
  });

  it("finishes a partial drop where only the table is left", async () => {
    await setBeats(15, 1);
    await db.execute(sql`ALTER TABLE capabilities DROP COLUMN qp_score, DROP COLUMN rp_score, DROP COLUMN matrix_sqs,
      DROP COLUMN matrix_sqs_raw, DROP COLUMN trend, DROP COLUMN guidance_usable, DROP COLUMN guidance_strategy,
      DROP COLUMN guidance_confidence`);
    const result = await runMigration0132_dropSqsResidualSchema(db);
    expect(result.outcome).toMatch(/^dropped 0 SQS columns .* \(3 rows, \d+ bytes\)$/);
    expect(await snapshotExists()).toBe(false);
  });
});
