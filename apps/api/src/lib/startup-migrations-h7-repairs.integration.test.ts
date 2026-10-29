/**
 * Blocks 0134-0136 and the retirement of 0087 and 0089, on a real Postgres
 * (platform-hardening T7).
 *
 * Reproduces each defect on an already-migrated database first (0103's old
 * trigger function in place, every block recorded), then runs the real runner
 * the way a boot does and reads the rows. A first-boot run (no
 * `startup_migration_applied`) is covered at the start, so both paths a
 * database can take to these blocks are exercised.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";

import { useTestDatabase } from "../test-support/integration-db.js";
import {
  runStartupMigrations,
  runMigration0087_unhideRedactedRows,
  runMigration0103_redactedContentStaysRedacted,
  US_COURT_SEARCH_DEACTIVATION_REASON,
} from "./startup-migrations.js";
import { REDACTED_ROW_DELETION_RULE } from "../startup-migrations/blocks/0135-redacted-row-deletion-reason.js";

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

type Row = { deleted_at: Date | null; deletion_reason: string | null; redacted_at: Date | null };

describeMaybe("startup migrations 0134-0136: a deleted redacted row stays deleted", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  const created: string[] = [];
  let undeletedByOld0087: string | undefined;

  async function redactedTransaction(): Promise<string> {
    const [{ id }] = (await db.execute(sql`
      INSERT INTO transactions (status, input, price_cents, payment_method, created_at)
      VALUES ('completed', '{"q":"x"}'::jsonb, 5, 'wallet', now() - interval '100 days')
      RETURNING id
    `)) as unknown as Array<{ id: string }>;
    created.push(id);
    await db.execute(sql`
      INSERT INTO transaction_quality
        (transaction_id, response_time_ms, schema_conformant, fields_returned, fields_expected, field_completeness_pct)
      VALUES (${id}::uuid, 10, true, 1, 1, 100)
    `);
    // The 90-day content sweep, as data-retention.ts writes it.
    await db.execute(sql`
      UPDATE transactions
         SET input = '{}'::jsonb, output = NULL, redacted_at = now(), deletion_reason = 'content_retention_purge'
       WHERE id = ${id}::uuid
    `);
    return id;
  }

  /** DELETE /v1/transactions/:id, as routes/transactions.ts writes it. */
  async function customerDelete(id: string): Promise<void> {
    await db.execute(sql`
      UPDATE transactions
         SET deleted_at = now(), redacted_at = now(), deletion_reason = 'user_request', input = '{}'::jsonb
       WHERE id = ${id}::uuid
    `);
    await db.execute(sql`UPDATE transaction_quality SET deleted_at = now() WHERE transaction_id = ${id}::uuid`);
  }

  async function read(id: string): Promise<Row> {
    const rows = (await db.execute(sql`
      SELECT deleted_at, deletion_reason, redacted_at FROM transactions WHERE id = ${id}::uuid
    `)) as unknown as Row[];
    return rows[0];
  }

  async function triggerBody(): Promise<string> {
    const rows = (await db.execute(sql`
      SELECT p.prosrc AS body FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
       WHERE t.tgname = 'transactions_redacted_content_stays_cleared_trg'
    `)) as unknown as Array<{ body: string }>;
    return rows[0]?.body ?? "";
  }

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 2 });
    db = drizzle(client);
  });

  afterAll(async () => {
    if (created.length > 0) {
      await db.execute(sql`DELETE FROM transaction_quality WHERE transaction_id = ANY(${`{${created.join(",")}}`}::uuid[])`);
      await db.execute(sql`DELETE FROM transactions WHERE id = ANY(${`{${created.join(",")}}`}::uuid[])`);
    }
    await db.execute(sql`DELETE FROM capabilities WHERE slug = 'us-court-search'`);
    await client.end();
  });

  it("a first boot runs every new block and leaves the trigger with the deletion-reason rule", async () => {
    await db.execute(sql`DROP TABLE IF EXISTS startup_migration_applied`);
    const results = await runStartupMigrations();
    for (const label of ["0134_completeComplianceColumns", "0135_redactedRowDeletionReason", "0136_redeleteCustomerDeletedRedactedRows"]) {
      expect(results.find((r) => r.block === label)?.outcome, label).not.toMatch(/^skipped/);
    }
    expect(await triggerBody()).toContain(REDACTED_ROW_DELETION_RULE);
  });

  it("reproduces the defect: under 0103's function a customer delete keeps the retention reason, and 0087 un-deletes it", async () => {
    await runMigration0103_redactedContentStaysRedacted(db);
    expect(await triggerBody()).not.toContain(REDACTED_ROW_DELETION_RULE);

    const id = await redactedTransaction();
    await customerDelete(id);
    expect((await read(id)).deletion_reason).toBe("content_retention_purge");
    expect((await read(id)).deleted_at).not.toBeNull();

    await runMigration0087_unhideRedactedRows(db);
    expect((await read(id)).deleted_at).toBeNull();
    undeletedByOld0087 = id;
  });

  it("an already-migrated boot skips 0087 and 0103, restores the rule, and deletes the restored row again", async () => {
    const victim = undeletedByOld0087;
    expect(victim, "runs after the reproduction test").toBeDefined();
    const [{ q }] = (await db.execute(sql`
      SELECT deleted_at AS q FROM transaction_quality WHERE transaction_id = ${victim}::uuid
    `)) as unknown as Array<{ q: Date }>;
    // A second row deleted since the last boot, still carrying the wrong reason.
    const stillDeleted = await redactedTransaction();
    await customerDelete(stillDeleted);
    const before = await read(stillDeleted);
    expect(before.deletion_reason).toBe("content_retention_purge");

    // 0136 is recorded from the first boot; a new deploy is its first run in
    // production, so clear its record to stand for that.
    await db.execute(sql`DELETE FROM startup_migration_applied WHERE function_name = 'runMigration0136_redeleteCustomerDeletedRedactedRows'`);
    const results = await runStartupMigrations();
    expect(results.find((r) => r.block === "runMigration0087_unhideRedactedRows")?.outcome).toMatch(/^skipped \(applied;/);
    expect(results.find((r) => r.block === "runMigration0103_redactedContentStaysRedacted")?.outcome).toMatch(/^skipped \(applied;/);
    expect(results.find((r) => r.block === "0136_redeleteCustomerDeletedRedactedRows")?.rows_affected).toBe(2);
    expect(await triggerBody()).toContain(REDACTED_ROW_DELETION_RULE);

    const repaired = await read(victim);
    expect(repaired.deletion_reason).toBe("user_request");
    expect(new Date(repaired.deleted_at!).getTime()).toBe(new Date(q).getTime());
    const kept = await read(stillDeleted);
    expect(kept.deletion_reason).toBe("user_request");
    expect(new Date(kept.deleted_at!).getTime()).toBe(new Date(before.deleted_at!).getTime());
  });

  it("with the new rule a customer delete records user_request, and neither a boot nor a forced run brings the row back", async () => {
    const id = await redactedTransaction();
    const redactedAt = (await read(id)).redacted_at;
    await customerDelete(id);
    const after = await read(id);
    expect(after.deletion_reason).toBe("user_request");
    expect(new Date(after.redacted_at!).getTime()).toBe(new Date(redactedAt!).getTime());

    await runStartupMigrations();
    await runStartupMigrations({ force: true });
    expect((await read(id)).deleted_at).not.toBeNull();
    expect((await read(id)).deletion_reason).toBe("user_request");
    // Force re-runs 0103 (old function) before 0135; 0135 must win.
    expect(await triggerBody()).toContain(REDACTED_ROW_DELETION_RULE);
  });

  it("the 1095-day purge of a content-redacted row records retention_purge", async () => {
    const id = await redactedTransaction();
    await db.execute(sql`
      UPDATE transactions SET deleted_at = now(), redacted_at = now(), deletion_reason = 'retention_purge' WHERE id = ${id}::uuid
    `);
    expect((await read(id)).deletion_reason).toBe("retention_purge");
  });

  it("a redacted row with no reason recorded gets the reason of its deletion", async () => {
    const [{ id }] = (await db.execute(sql`
      INSERT INTO transactions (status, input, price_cents, payment_method, redacted_at)
      VALUES ('completed', '{}'::jsonb, 5, 'wallet', now())
      RETURNING id
    `)) as unknown as Array<{ id: string }>;
    created.push(id);
    await db.execute(sql`UPDATE transactions SET deletion_reason = 'not_a_delete' WHERE id = ${id}::uuid`);
    expect((await read(id)).deletion_reason).toBeNull();
    await db.execute(sql`
      UPDATE transactions SET deleted_at = now(), deletion_reason = 'retention_purge' WHERE id = ${id}::uuid
    `);
    expect((await read(id)).deletion_reason).toBe("retention_purge");
  });

  it("the trigger still pins the reason and clears content on any update that is not the delete", async () => {
    const id = await redactedTransaction();
    await db.execute(sql`
      UPDATE transactions SET deletion_reason = 'something_else', output = '{"late":true}'::jsonb WHERE id = ${id}::uuid
    `);
    const rows = (await db.execute(sql`
      SELECT deletion_reason, output FROM transactions WHERE id = ${id}::uuid
    `)) as unknown as Array<{ deletion_reason: string; output: unknown }>;
    expect(rows[0].deletion_reason).toBe("content_retention_purge");
    expect(rows[0].output).toBeNull();
  });

  it("an Art. 17 closure reason survives the later 1095-day purge", async () => {
    // A row as account closure leaves it: content cleared, erasure reason.
    const [{ id: closed }] = (await db.execute(sql`
      INSERT INTO transactions (status, input, price_cents, payment_method, redacted_at, deletion_reason)
      VALUES ('completed', '{}'::jsonb, 5, 'wallet', now(), 'account_closure_erasure')
      RETURNING id
    `)) as unknown as Array<{ id: string }>;
    created.push(closed);
    await db.execute(sql`
      UPDATE transactions SET deleted_at = now(), redacted_at = now(), deletion_reason = 'retention_purge' WHERE id = ${closed}::uuid
    `);
    const row = await read(closed);
    expect(row.deleted_at).not.toBeNull();
    expect(row.deletion_reason).toBe("account_closure_erasure");
  });

  it("a recorded 0089 no longer re-deactivates us-court-search, even under force", async () => {
    await db.execute(sql`
      INSERT INTO capabilities (name, slug, description, category, input_schema, output_schema, price_cents, is_active, visible)
      VALUES ('US court search', 'us-court-search', 'x', 'compliance', '{}'::jsonb, '{}'::jsonb, 15, true, true)
      ON CONFLICT (slug) DO UPDATE SET is_active = true, visible = true
    `);
    await runStartupMigrations();
    await runStartupMigrations({ force: true });
    const rows = (await db.execute(sql`
      SELECT is_active, deactivation_reason FROM capabilities WHERE slug = 'us-court-search'
    `)) as unknown as Array<{ is_active: boolean; deactivation_reason: string | null }>;
    expect(rows[0].is_active).toBe(true);
    expect(rows[0].deactivation_reason).not.toBe(US_COURT_SEARCH_DEACTIVATION_REASON);
  });

  it("0134 completes a partial 0030, which a recorded or column-checking 0030 never revisits", async () => {
    await db.execute(sql`ALTER TABLE transactions DROP COLUMN previous_hash`);
    await db.execute(sql`DELETE FROM startup_migration_applied WHERE function_name = 'runMigration0134_completeComplianceColumns'`);
    const results = await runStartupMigrations();
    expect(results.find((r) => r.block === "runMigration0030_complianceColumns")?.outcome).toMatch(/^skipped/);
    // 0030 itself, unrecorded, also skips: its check sees integrity_hash only.
    const { runMigration0030_complianceColumns } = await import("./startup-migrations.js");
    await db.execute(sql`ALTER TABLE transactions DROP COLUMN previous_hash`);
    expect((await runMigration0030_complianceColumns(db)).outcome).toMatch(/^skipped \(columns already exist\)/);
    await db.execute(sql`ALTER TABLE transactions ADD COLUMN previous_hash varchar(128)`);
    expect(results.find((r) => r.block === "0134_completeComplianceColumns")?.outcome).toMatch(/previous_hash/);
    const cols = (await db.execute(sql`
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'transactions' AND column_name IN ('integrity_hash', 'previous_hash', 'legal_hold')
    `)) as unknown as unknown[];
    expect(cols).toHaveLength(3);
  });
});
