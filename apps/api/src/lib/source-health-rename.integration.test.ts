/**
 * Block 0134 on a real Postgres (H7, platform-hardening T7).
 *
 * The test database already has source_health (schema.ts), so the block's
 * rename path is exercised in a scratch schema that holds the production shape
 * before the rename: a capability_health table with drizzle's constraint
 * names. Asserts what a build deployed before the rename still needs from the
 * old name (reads, inserts with defaults, ON CONFLICT, FOR UPDATE) and that a
 * second run changes nothing.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";

import { useTestDatabase } from "../test-support/integration-db.js";
import { runMigration0134_renameCapabilityHealthToSourceHealth as run0134 } from "./startup-migrations.js";

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;
const SCHEMA = "h7_source_health_rename";

describeMaybe("block 0134 renames capability_health to source_health behind a view", () => {
  let admin: ReturnType<typeof postgres>;
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    admin = postgres(DATABASE_URL_TEST!, { max: 1 });
    await admin.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.unsafe(`CREATE SCHEMA ${SCHEMA}`);
    client = postgres(DATABASE_URL_TEST!, { max: 1, connection: { search_path: SCHEMA } });
    db = drizzle(client);
    // The production shape before the rename (schema.ts as of block 0133).
    await db.execute(sql`
      CREATE TABLE capability_health (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        capability_slug varchar(255) NOT NULL,
        state varchar(20) NOT NULL DEFAULT 'closed',
        consecutive_failures integer NOT NULL DEFAULT 0,
        total_failures integer NOT NULL DEFAULT 0,
        total_successes integer NOT NULL DEFAULT 0,
        last_failure_at timestamptz,
        last_success_at timestamptz,
        opened_at timestamptz,
        next_retry_at timestamptz,
        backoff_minutes integer NOT NULL DEFAULT 5,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT capability_health_capability_slug_unique UNIQUE (capability_slug)
      )
    `);
    await db.execute(sql`INSERT INTO capability_health (capability_slug, state) VALUES ('a-slug', 'open'), ('b-slug', 'closed')`);
  });

  afterAll(async () => {
    await client?.end();
    await admin?.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin?.end();
  });

  it("renames the table and its constraints, keeps every row, and leaves a view", async () => {
    const result = await run0134(db);
    expect(result.outcome).toMatch(/^renamed capability_health to source_health \(2 rows, \d+ bytes\)/);

    const kinds = (await db.execute(sql`
      SELECT relname, relkind::text AS relkind FROM pg_class
      WHERE relnamespace = ${SCHEMA}::regnamespace AND relname IN ('capability_health', 'source_health')
      ORDER BY relname
    `)) as unknown as Array<{ relname: string; relkind: string }>;
    expect(kinds).toEqual([{ relname: "capability_health", relkind: "v" }, { relname: "source_health", relkind: "r" }]);

    const constraints = (await db.execute(sql`
      SELECT conname FROM pg_constraint WHERE conrelid = 'source_health'::regclass ORDER BY conname
    `)) as unknown as Array<{ conname: string }>;
    expect(constraints.map((c) => c.conname)).toEqual(["source_health_capability_slug_unique", "source_health_pkey"]);

    const rows = (await db.execute(sql`SELECT capability_slug, state FROM source_health ORDER BY capability_slug`)) as unknown as Array<{ capability_slug: string; state: string }>;
    expect(rows).toEqual([{ capability_slug: "a-slug", state: "open" }, { capability_slug: "b-slug", state: "closed" }]);
  });

  it("serves a build that still names capability_health", async () => {
    // Insert with defaults, as drizzle does for omitted columns.
    await db.execute(sql`INSERT INTO capability_health (id, capability_slug, state, backoff_minutes, updated_at) VALUES (default, 'c-slug', default, default, default)`);
    await db.execute(sql`INSERT INTO capability_health (capability_slug) VALUES ('a-slug') ON CONFLICT (capability_slug) DO NOTHING`);
    await db.execute(sql`UPDATE capability_health SET consecutive_failures = 3 WHERE capability_slug = 'b-slug'`);
    const locked = (await db.execute(sql`SELECT capability_slug FROM capability_health WHERE capability_slug = 'b-slug' FOR UPDATE`)) as unknown as unknown[];
    expect(locked).toHaveLength(1);

    const rows = (await db.execute(sql`
      SELECT capability_slug, state, consecutive_failures, backoff_minutes FROM source_health ORDER BY capability_slug
    `)) as unknown as Array<Record<string, unknown>>;
    expect(rows).toEqual([
      { capability_slug: "a-slug", state: "open", consecutive_failures: 0, backoff_minutes: 5 },
      { capability_slug: "b-slug", state: "closed", consecutive_failures: 3, backoff_minutes: 5 },
      { capability_slug: "c-slug", state: "closed", consecutive_failures: 0, backoff_minutes: 5 },
    ]);
  });

  it("a second run changes nothing", async () => {
    const result = await run0134(db);
    expect(result.outcome).toBe("skipped (capability_health is relkind v; source_health present)");
  });

  it("refuses when both names are tables", async () => {
    await db.execute(sql`DROP VIEW capability_health`);
    await db.execute(sql`CREATE TABLE capability_health (id uuid PRIMARY KEY)`);
    await expect(run0134(db)).rejects.toThrow(/both exist/);
  });
});
