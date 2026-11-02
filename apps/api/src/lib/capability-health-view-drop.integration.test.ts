/**
 * Block 0141 on a real Postgres (H7, platform-hardening T7).
 *
 * The contract half of block 0134's expand/contract rename: it drops the
 * `capability_health` compatibility view and must never touch a table of that
 * name. Each case runs in its own scratch schema holding the post-0134 shape
 * (a `source_health` table plus the view), because the test database's real
 * `source_health` is shared with every other suite.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";

import { useTestDatabase } from "../test-support/integration-db.js";
import {
  runMigration0141_dropCapabilityHealthCompatView as run0141,
  runMigration0134_renameCapabilityHealthToSourceHealth as run0134,
} from "./startup-migrations.js";

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;
const SCHEMA = "h7_capability_health_view_drop";

describeMaybe("block 0141 drops the capability_health compatibility view", () => {
  let admin: ReturnType<typeof postgres>;
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;

  beforeEach(async () => {
    admin = postgres(DATABASE_URL_TEST!, { max: 1 });
    await admin.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.unsafe(`CREATE SCHEMA ${SCHEMA}`);
    client = postgres(DATABASE_URL_TEST!, { max: 1, connection: { search_path: SCHEMA } });
    db = drizzle(client);
    await db.execute(sql`
      CREATE TABLE source_health (
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
        CONSTRAINT source_health_capability_slug_unique UNIQUE (capability_slug)
      )
    `);
    await db.execute(sql`INSERT INTO source_health (capability_slug, state) VALUES ('a-slug', 'open'), ('b-slug', 'closed')`);
  });

  afterEach(async () => {
    await client?.end();
    await admin?.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin?.end();
  });

  const createView = () => db.execute(sql`CREATE VIEW capability_health AS SELECT * FROM source_health`);

  it("drops the view and leaves the table and every row untouched", async () => {
    await createView();

    const result = await run0141(db);
    expect(result.outcome).toBe(
      "dropped the capability_health compatibility view; source_health is the only name",
    );
    expect(result.rows_affected).toBe(0);

    const kinds = (await db.execute(sql`
      SELECT relname, relkind::text AS relkind FROM pg_class
      WHERE relnamespace = ${SCHEMA}::regnamespace AND relname IN ('capability_health', 'source_health')
      ORDER BY relname
    `)) as unknown as Array<{ relname: string; relkind: string }>;
    expect(kinds).toEqual([{ relname: "source_health", relkind: "r" }]);

    const rows = (await db.execute(
      sql`SELECT capability_slug, state FROM source_health ORDER BY capability_slug`,
    )) as unknown as Array<{ capability_slug: string; state: string }>;
    expect(rows).toEqual([
      { capability_slug: "a-slug", state: "open" },
      { capability_slug: "b-slug", state: "closed" },
    ]);
  });

  it("a second run changes nothing", async () => {
    await createView();
    await run0141(db);

    const again = await run0141(db);
    expect(again.outcome).toBe("no change (capability_health is absent)");

    const kinds = (await db.execute(sql`
      SELECT relname FROM pg_class
      WHERE relnamespace = ${SCHEMA}::regnamespace AND relname = 'source_health'
    `)) as unknown as unknown[];
    expect(kinds).toHaveLength(1);
  });

  it("refuses to drop a table of the old name, and leaves its rows", async () => {
    await db.execute(sql`CREATE TABLE capability_health (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), capability_slug varchar(255))`);
    await db.execute(sql`INSERT INTO capability_health (capability_slug) VALUES ('kept')`);

    await expect(run0141(db)).rejects.toThrow(/relkind r, not a view; refusing to drop it/);

    // Not just the message: the relation is still a table and still holds its row.
    const kinds = (await db.execute(sql`
      SELECT relkind::text AS relkind FROM pg_class
      WHERE relnamespace = ${SCHEMA}::regnamespace AND relname = 'capability_health'
    `)) as unknown as Array<{ relkind: string }>;
    expect(kinds).toEqual([{ relkind: "r" }]);
    const rows = (await db.execute(sql`SELECT capability_slug FROM capability_health`)) as unknown as Array<{ capability_slug: string }>;
    expect(rows).toEqual([{ capability_slug: "kept" }]);
  });

  it("refuses a materialized view under the old name", async () => {
    await db.execute(sql`CREATE MATERIALIZED VIEW capability_health AS SELECT * FROM source_health`);

    await expect(run0141(db)).rejects.toThrow(/relkind m, not a view; refusing to drop it/);

    const kinds = (await db.execute(sql`
      SELECT relkind::text AS relkind FROM pg_class
      WHERE relnamespace = ${SCHEMA}::regnamespace AND relname = 'capability_health'
    `)) as unknown as Array<{ relkind: string }>;
    expect(kinds).toEqual([{ relkind: "m" }]);
  });

  it("refuses when source_health is absent, so the view is the only breaker surface", async () => {
    await db.execute(sql`CREATE TABLE legacy_breaker (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), capability_slug varchar(255))`);
    await db.execute(sql`CREATE VIEW capability_health AS SELECT * FROM legacy_breaker`);
    await db.execute(sql`DROP TABLE source_health`);

    await expect(run0141(db)).rejects.toThrow(/source_health is absent, not a table/);

    const kinds = (await db.execute(sql`
      SELECT relkind::text AS relkind FROM pg_class
      WHERE relnamespace = ${SCHEMA}::regnamespace AND relname = 'capability_health'
    `)) as unknown as Array<{ relkind: string }>;
    expect(kinds).toEqual([{ relkind: "v" }]);
  });

  it("refuses when source_health is itself a view, so the real table cannot be orphaned", async () => {
    // Someone reversing the rename by hand: the table is back under the old
    // name and source_health is a view over it. Dropping the old name would
    // take the table with it.
    await db.execute(sql`ALTER TABLE source_health RENAME TO capability_health`);
    await db.execute(sql`CREATE VIEW source_health AS SELECT * FROM capability_health`);

    await expect(run0141(db)).rejects.toThrow(/relkind r, not a view; refusing to drop it/);

    const rows = (await db.execute(sql`SELECT capability_slug FROM capability_health ORDER BY capability_slug`)) as unknown as Array<{ capability_slug: string }>;
    expect(rows.map((r) => r.capability_slug)).toEqual(["a-slug", "b-slug"]);
  });

  it("refuses a view under both names, where source_health is not the table", async () => {
    await db.execute(sql`ALTER TABLE source_health RENAME TO breaker_real`);
    await db.execute(sql`CREATE VIEW capability_health AS SELECT * FROM breaker_real`);
    await db.execute(sql`CREATE VIEW source_health AS SELECT * FROM breaker_real`);

    await expect(run0141(db)).rejects.toThrow(/source_health is relkind v, not a table/);

    const kinds = (await db.execute(sql`
      SELECT relname FROM pg_class
      WHERE relnamespace = ${SCHEMA}::regnamespace AND relname = 'capability_health'
    `)) as unknown as unknown[];
    expect(kinds).toHaveLength(1);
  });

  it("fails loudly rather than dropping a dependent object with the view", async () => {
    await createView();
    await db.execute(sql`CREATE VIEW breaker_dependent AS SELECT capability_slug FROM capability_health`);

    // drizzle >=0.44 wraps the driver error, so the dependency is in the cause.
    const error = await run0141(db).then(
      () => null,
      (e: unknown) => e as Error & { cause?: Error },
    );
    expect(error).toBeInstanceOf(Error);
    expect(error!.message).toMatch(/DROP VIEW capability_health/);
    expect(String(error!.cause?.message ?? "")).toMatch(/breaker_dependent|depend/i);

    const kinds = (await db.execute(sql`
      SELECT relname FROM pg_class
      WHERE relnamespace = ${SCHEMA}::regnamespace AND relname IN ('capability_health', 'breaker_dependent')
      ORDER BY relname
    `)) as unknown as Array<{ relname: string }>;
    expect(kinds.map((k) => k.relname)).toEqual(["breaker_dependent", "capability_health"]);
  });

  it("0134 then 0141 in order leave only source_health, as a fresh database ends up", async () => {
    // The pre-rename shape, so the two blocks run back to back as they do on a boot.
    await db.execute(sql`DROP TABLE source_health`);
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
    await db.execute(sql`INSERT INTO capability_health (capability_slug) VALUES ('carried')`);

    await run0134(db);
    await run0141(db);

    const kinds = (await db.execute(sql`
      SELECT relname, relkind::text AS relkind FROM pg_class
      WHERE relnamespace = ${SCHEMA}::regnamespace AND relname IN ('capability_health', 'source_health')
    `)) as unknown as Array<{ relname: string; relkind: string }>;
    expect(kinds).toEqual([{ relname: "source_health", relkind: "r" }]);

    const rows = (await db.execute(sql`SELECT capability_slug FROM source_health`)) as unknown as Array<{ capability_slug: string }>;
    expect(rows).toEqual([{ capability_slug: "carried" }]);
  });
});
