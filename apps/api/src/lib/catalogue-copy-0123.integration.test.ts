/**
 * Block 0123 (catalogue copy) against a real Postgres (DEC-20260504-A).
 *
 * The unit tests in startup-migrations.test.ts pin the SQL shape and the bound
 * parameters through a stub. This suite makes Postgres run the statements: it
 * seeds synthetic capabilities and solutions, runs the block on synthetic
 * (slug, old, new) rows, and checks that a row is rewritten only while it
 * still holds the snapshot value, that name and description are independent,
 * and that a second run changes nothing. Skips cleanly without
 * DATABASE_URL_TEST; the CI integration lane requires it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { useTestDatabase } from "../test-support/integration-db.js";
import { runMigration0123_catalogueCopy } from "./startup-migrations.js";

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;
const BLOCK = "0123_catalogueCopy";

describeMaybe("block 0123 (catalogue copy) against a real database", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let hadLedgerRow = false;
  const run = `cc${randomUUID().slice(0, 8)}`;
  const slug = (name: string) => `${run}-${name}`;

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 2 });
    db = drizzle(client);
    // The lane applies every startup migration before the suites, so the real
    // block has already recorded itself here. Park that row and put it back.
    await client`CREATE TABLE IF NOT EXISTS startup_migration_ledger (
      block text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      rows_affected integer NOT NULL DEFAULT 0)`;
    const prior = await client`SELECT block FROM startup_migration_ledger WHERE block = ${BLOCK}`;
    hadLedgerRow = prior.length > 0;
    await client`DELETE FROM startup_migration_ledger WHERE block = ${BLOCK}`;

    for (const [s, name, description] of [
      [slug("fresh"), "Old Name", "Old description."],
      [slug("renamed"), "Someone renamed it", "Old description."],
      [slug("redescribed"), "Old Name", "Someone rewrote this."],
      [slug("same-name"), "Kept Name", "Old description."],
    ]) {
      await client`
        INSERT INTO capabilities
          (slug, name, description, category, input_schema, output_schema, price_cents, lifecycle_state, visible, x402_enabled, updated_at)
        VALUES (${s}, ${name}, ${description}, 'validation', '{}'::jsonb, '{}'::jsonb, 7, 'active', true, false, '2020-01-01T00:00:00Z')`;
    }
    for (const [s, description, agent] of [
      [slug("bundle-fresh"), "Quick company verification for United Kingdom. Rest.", "fetch page, page blocked need content"],
      [slug("bundle-edited"), "Hand-edited since the snapshot.", "fetch page, page blocked need content"],
    ]) {
      await client`
        INSERT INTO solutions
          (slug, name, description, long_description, agent_description, category, price_cents, component_sum_cents, value_tier, maintenance_level, geography, input_schema, is_active, updated_at)
        VALUES (${s}, ${s}, ${description}, 'Performs 4 automated checks for United Kingdom companies: rest.', ${agent},
                'compliance-verification', 150, 100, 'standard', 'low', 'eu', '{}'::jsonb, false, '2020-01-01T00:00:00Z')`;
    }
  });

  afterAll(async () => {
    await client`DELETE FROM capabilities WHERE slug LIKE ${`${run}-%`}`;
    await client`DELETE FROM solutions WHERE slug LIKE ${`${run}-%`}`;
    await client`DELETE FROM startup_migration_ledger WHERE block = ${BLOCK}`;
    if (hadLedgerRow) {
      await client`INSERT INTO startup_migration_ledger (block, rows_affected) VALUES (${BLOCK}, 0) ON CONFLICT (block) DO NOTHING`;
    }
    await client.end();
  });

  const data = () => ({
    capabilities: ["fresh", "renamed", "redescribed", "same-name"].map((n) => ({
      slug: slug(n),
      old_name: n === "same-name" ? "Kept Name" : "Old Name",
      old_description: "Old description.",
      name: n === "same-name" ? "Kept Name" : "New Name",
      description: "New description.",
    })),
    solutions: [
      ...["bundle-fresh", "bundle-edited"].map((n) => ({
        slug: slug(n),
        column: "description" as const,
        old_value: "Quick company verification for United Kingdom. Rest.",
        value: "Quick verification of a UK company. Rest.",
        source: "snapshot" as const,
      })),
      // long_description is its own guarded UPDATE: it lands on the edited bundle too.
      ...["bundle-fresh", "bundle-edited"].map((n) => ({
        slug: slug(n),
        column: "long_description" as const,
        old_value: "Performs 4 automated checks for United Kingdom companies: rest.",
        value: "Performs 4 automated checks for UK companies: rest.",
        source: "snapshot" as const,
      })),
      {
        slug: slug("bundle-fresh"),
        column: "agent_description" as const,
        old_value: "fetch page, page blocked need content",
        value: "fetch page",
        source: "snapshot" as const,
      },
    ],
  });

  async function capability(name: string) {
    const [row] = await client<{ name: string; description: string; price_cents: number; x402_enabled: boolean; updated: string }[]>`
      SELECT name, description, price_cents, x402_enabled, to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS updated FROM capabilities WHERE slug = ${slug(name)}`;
    return row;
  }

  it("rewrites only values still holding the snapshot, name and description independently, and runs once", async () => {
    const result = await runMigration0123_catalogueCopy({ execute: (q) => db.execute(q) }, data());

    // fresh: both columns; renamed: description only; redescribed: name only; same-name: description only.
    expect(await capability("fresh")).toMatchObject({ name: "New Name", description: "New description." });
    expect(await capability("renamed")).toMatchObject({ name: "Someone renamed it", description: "New description." });
    expect(await capability("redescribed")).toMatchObject({ name: "New Name", description: "Someone rewrote this." });
    expect(await capability("same-name")).toMatchObject({ name: "Kept Name", description: "New description." });
    // Copy only: price, flags and updated_at untouched (invariant-checker reads updated_at as "the tool changed").
    for (const n of ["fresh", "renamed", "redescribed", "same-name"]) expect((await capability(n)).updated, n).toBe("2020-01-01");
    const [solTouched] = await client<{ n: number }[]>`
      SELECT count(*)::int AS n FROM solutions WHERE slug LIKE ${`${run}-%`} AND updated_at <> '2020-01-01T00:00:00Z'`;
    expect(solTouched.n).toBe(0);
    expect(await capability("fresh")).toMatchObject({ price_cents: 7, x402_enabled: false });

    const solutions = await client<{
      slug: string; description: string; long_description: string; agent_description: string; is_active: boolean; price_cents: number;
    }[]>`
      SELECT slug, description, long_description, agent_description, is_active, price_cents
        FROM solutions WHERE slug LIKE ${`${run}-%`} ORDER BY slug`;
    expect(solutions).toEqual([
      {
        slug: slug("bundle-edited"), description: "Hand-edited since the snapshot.",
        long_description: "Performs 4 automated checks for UK companies: rest.",
        agent_description: "fetch page, page blocked need content", // not in this run's data for this slug
        is_active: false, price_cents: 150,
      },
      {
        slug: slug("bundle-fresh"), description: "Quick verification of a UK company. Rest.",
        long_description: "Performs 4 automated checks for UK companies: rest.",
        agent_description: "fetch page",
        is_active: false, price_cents: 150,
      },
    ]);

    // names: fresh + redescribed (renamed is guarded out; same-name is not a name change);
    // descriptions: fresh + renamed + same-name; solution description: bundle-fresh only;
    // long_description: both (independent of the edited description); agent_description: bundle-fresh.
    expect(result.rows_affected).toBe(2 + 3 + 1 + 2 + 1);
    expect(result.outcome).toBe(
      "capabilities: 2/3 name(s) (1 left alone: changed since the snapshot or absent), " +
        "3/4 description(s) (1 left alone: changed since the snapshot or absent); " +
        "solutions: 1/2 description(s) (1 left alone: changed since the snapshot or absent), " +
        "2/2 long_description(s), 1/1 agent_description(s)",
    );
    const [ledger] = await client<{ rows_affected: number }[]>`
      SELECT rows_affected FROM startup_migration_ledger WHERE block = ${BLOCK}`;
    expect(ledger.rows_affected).toBe(9);

    // Second boot: the ledger row stops it, even with a row put back to its snapshot value.
    await client`UPDATE capabilities SET name = 'Old Name' WHERE slug = ${slug("fresh")}`;
    const again = await runMigration0123_catalogueCopy({ execute: (q) => db.execute(q) }, data());
    expect(again.rows_affected).toBe(0);
    expect(again.outcome).toContain("already applied once");
    expect((await capability("fresh")).name).toBe("Old Name");
  });
});
