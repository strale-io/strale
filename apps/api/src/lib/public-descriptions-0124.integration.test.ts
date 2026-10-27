/** Exact-value guards and unchanged non-description columns against disposable Postgres. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { useTestDatabase } from "../test-support/integration-db.js";
import { runMigration0124_publicDescriptions } from "./startup-migrations.js";

const DATABASE_URL_TEST = useTestDatabase();
const BLOCK = "0124_publicDescriptions";
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

describeMaybe("block 0124 against a real database", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let parked: { rows_affected: number; applied_at: Date } | undefined;
  const prefix = `pd${randomUUID().slice(0, 8)}`;
  const slug = (suffix: string) => `${prefix}-${suffix}`;

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 2 });
    db = drizzle(client);
    await client`CREATE TABLE IF NOT EXISTS startup_migration_ledger (
      block text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now(),
      rows_affected integer NOT NULL DEFAULT 0)`;
    [parked] = await client<{ rows_affected: number; applied_at: Date }[]>`
      SELECT rows_affected, applied_at FROM startup_migration_ledger WHERE block = ${BLOCK}`;
    await client`DELETE FROM startup_migration_ledger WHERE block = ${BLOCK}`;
    for (const [suffix, description] of [["match", "Old description."], ["edited", "Edited since snapshot."], ["unchanged", "Same description."]]) {
      await client`INSERT INTO capabilities
        (slug, name, description, category, input_schema, output_schema, price_cents, lifecycle_state, visible, x402_enabled, updated_at)
        VALUES (${slug(suffix)}, 'Keep name', ${description}, 'validation', '{}'::jsonb, '{}'::jsonb, 7, 'active', true, false, '2020-01-01T00:00:00Z')`;
    }
  });

  afterAll(async () => {
    if (!client) return;
    await client`DELETE FROM capabilities WHERE slug LIKE ${`${prefix}-%`}`;
    await client`DELETE FROM startup_migration_ledger WHERE block = ${BLOCK}`;
    if (parked) await client`INSERT INTO startup_migration_ledger (block, rows_affected, applied_at)
      VALUES (${BLOCK}, ${parked.rows_affected}, ${parked.applied_at.toISOString()})`;
    await client.end();
  });

  async function snapshot() {
    const rows = await client<{ slug: string; row: Record<string, unknown> }[]>`
      SELECT slug, to_jsonb(c) AS row FROM capabilities c WHERE slug LIKE ${`${prefix}-%`} ORDER BY slug`;
    return new Map(rows.map((r) => [r.slug, r.row]));
  }

  it("changes only a matching description, preserves all other fields, and runs once", async () => {
    const rows = ["match", "edited", "missing"].map((s) => ({ slug: slug(s), old_description: "Old description.", description: "New description." }));
    rows.push({ slug: slug("unchanged"), old_description: "Same description.", description: "Same description." });
    const before = await snapshot();
    const result = await runMigration0124_publicDescriptions({ execute: (q) => db.execute(q) }, rows);
    const after = await snapshot();
    expect(result.rows_affected).toBe(1);
    expect(result.outcome).toContain("2 left alone");
    for (const [s, original] of before) {
      expect(after.get(s), s).toEqual(s === slug("match") ? { ...original, description: "New description." } : original);
    }
    const [ledger] = await client<{ rows_affected: number }[]>`SELECT rows_affected FROM startup_migration_ledger WHERE block = ${BLOCK}`;
    expect(ledger.rows_affected).toBe(1);
    await client`UPDATE capabilities SET description = 'Old description.' WHERE slug = ${slug("match")}`;
    const again = await runMigration0124_publicDescriptions({ execute: (q) => db.execute(q) }, rows);
    expect(again.rows_affected).toBe(0);
    expect(again.outcome).toContain("already applied once");
    expect((await snapshot()).get(slug("match"))?.description).toBe("Old description.");
  });
});
