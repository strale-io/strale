/**
 * Applied-block-hash skip on a real Postgres (H7d).
 *
 * Runs the real runner twice, the way two boots do, and reads what it wrote:
 * the first run (no `startup_migration_applied` table) runs every block and
 * then records every ledgered block; the second skips every "once" block and
 * runs only the "every_boot" ones. A recorded hash that no longer matches the
 * ledger fails the run. Asserts on rows and run results, not on source text.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";

import { useTestDatabase } from "../test-support/integration-db.js";
import { BLOCKS, runStartupMigrations } from "./startup-migrations.js";
import { BLOCK_RUN_POLICY } from "../startup-migrations/run-policy.js";
import { LEDGER_BY_FUNCTION } from "../startup-migrations/applied.js";

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

const ONCE = BLOCKS.map((b) => b.name).filter((n) => BLOCK_RUN_POLICY[n]?.policy === "once");
const EVERY_BOOT = BLOCKS.map((b) => b.name).filter((n) => BLOCK_RUN_POLICY[n]?.policy === "every_boot");
const isSkip = (outcome: string) => outcome.startsWith("skipped (applied;");

describeMaybe("startup migrations skip blocks whose ledger hash is recorded", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 2 });
    db = drizzle(client);
    // The state of the first boot after this shipped: the table is absent.
    await db.execute(sql`DROP TABLE IF EXISTS startup_migration_applied`);
  });

  afterAll(async () => {
    await client.end();
  });

  it("the first boot runs every block, then records every ledgered block", async () => {
    const results = await runStartupMigrations();
    expect(results).toHaveLength(BLOCKS.length);
    expect(results.filter((r) => isSkip(r.outcome))).toEqual([]);

    const rows = (await db.execute(sql`
      SELECT function_name, ledger_id, sha256 FROM startup_migration_applied
    `)) as unknown as Array<{ function_name: string; ledger_id: string; sha256: string }>;
    expect(rows).toHaveLength(BLOCKS.length);
    for (const row of rows) {
      const ledger = LEDGER_BY_FUNCTION.get(row.function_name);
      expect(ledger, row.function_name).toBeDefined();
      expect(row.sha256).toBe(ledger!.sha256);
      expect(row.ledger_id).toBe(ledger!.id);
    }
  });

  it("a second boot skips every once block and runs only the every-boot blocks", async () => {
    expect(ONCE.length).toBeGreaterThan(30);
    const results = await runStartupMigrations();
    const skipped = results.filter((r) => isSkip(r.outcome)).map((r) => r.block).sort();
    expect(skipped).toEqual([...ONCE].sort());
    expect(results.length - skipped.length).toBe(EVERY_BOOT.length);
  });

  it("force runs every block even when recorded (the admin endpoint)", async () => {
    const results = await runStartupMigrations({ force: true });
    expect(results.filter((r) => isSkip(r.outcome))).toEqual([]);
    expect(results).toHaveLength(BLOCKS.length);
  });

  it("a recorded hash that differs from the ledger fails the run instead of skipping", async () => {
    const victim = ONCE[0];
    await db.execute(sql`UPDATE startup_migration_applied SET sha256 = 'edited-in-place' WHERE function_name = ${victim}`);
    try {
      await expect(runStartupMigrations()).rejects.toThrow(new RegExp(`${victim} ran with ledger hash edited-in-place`));
    } finally {
      await db.execute(sql`
        UPDATE startup_migration_applied SET sha256 = ${LEDGER_BY_FUNCTION.get(victim)!.sha256}
        WHERE function_name = ${victim}
      `);
    }
  });
});
