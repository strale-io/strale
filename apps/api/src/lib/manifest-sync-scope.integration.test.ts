/**
 * The scope property, proven against a real Postgres.
 *
 * The unit tests next door assert the SQL that gets BUILT. This asserts what
 * the database actually contains afterwards, which is the claim a founder
 * grant is issued against: `--fields input_schema` changed `input_schema`, and
 * a deliberately drifted `output_schema` came out byte-identical.
 *
 * It drives `buildAssignments` + `applyAssignments` — the same functions the
 * script calls — rather than a reimplementation, so a divergence between test
 * and production is not possible without one of them failing to compile.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { useTestDatabase } from "../test-support/integration-db.js";
import {
  applyAssignments,
  buildAssignments,
  CANONICAL_SYNC_FIELD_NAMES,
  type SqlLike,
} from "./manifest-sync-fields.js";

const DATABASE_URL_TEST = useTestDatabase();

describe.skipIf(!DATABASE_URL_TEST)("scoped manifest sync, against a real database", () => {
  let sql: ReturnType<typeof postgres>;
  let slug: string;

  /** The DB's output_schema. Deliberately different from the manifest's. */
  const DB_OUTPUT_SCHEMA = {
    type: "object",
    example: { width: 100, height: 100, size_bytes: 6947 },
    properties: { width: { type: "integer" } },
  };

  /** What a full sync would have pushed over it. */
  const MANIFEST = {
    slug: "",
    description: "manifest description",
    category: "developer-tools",
    input_schema: {
      type: "object",
      properties: {
        format: { type: "string", enum: ["png", "jpeg", "webp"] },
        quality: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
    // DRIFTED, and never selected below.
    output_schema: {
      type: "object",
      example: { width: 100, height: 67, size_bytes: 18675 },
      properties: { width: { type: "integer" } },
    },
    data_source: "manifest data source",
  };

  beforeAll(async () => {
    sql = postgres(DATABASE_URL_TEST!, { max: 4 });
    slug = `sync-scope-${randomUUID().slice(0, 8)}`;
    MANIFEST.slug = slug;

    await sql`
      INSERT INTO capabilities (id, slug, name, description, category,
                                input_schema, output_schema, data_source, price_cents)
      VALUES (${randomUUID()}, ${slug}, 'Sync scope probe', 'db description',
              'developer-tools',
              ${sql.json({ type: "object", properties: { format: { type: "string" } } })},
              ${sql.json(DB_OUTPUT_SCHEMA)}, 'db data source', 10)
    `;
  }, 120_000);

  afterAll(async () => {
    if (!sql) return;
    await sql`DELETE FROM capabilities WHERE slug = ${slug}`;
    await sql.end();
  });

  async function row() {
    const [r] = await sql`
      SELECT description, category, input_schema, output_schema, data_source
      FROM capabilities WHERE slug = ${slug}`;
    return r!;
  }

  it("--fields input_schema writes input_schema and leaves drifted output_schema BYTE-IDENTICAL", async () => {
    const before = await row();
    // Precondition: output_schema really does differ, or this proves nothing.
    expect(
      JSON.stringify(before.output_schema),
      "the fixture is not actually drifted",
    ).not.toBe(JSON.stringify(MANIFEST.output_schema));

    const written = await applyAssignments(
      sql as unknown as SqlLike,
      slug,
      buildAssignments(["input_schema"], MANIFEST),
    );
    expect(written).toBe(1);

    const after = await row();
    expect(after.input_schema).toEqual(MANIFEST.input_schema);
    expect(
      JSON.stringify(after.output_schema),
      "an unselected drifted field was overwritten",
    ).toBe(JSON.stringify(before.output_schema));
    // And nothing else moved either.
    expect(after.description).toBe(before.description);
    expect(after.category).toBe(before.category);
    expect(after.data_source).toBe(before.data_source);
  });

  it("several explicitly requested fields are all written, and only those", async () => {
    const before = await row();
    await applyAssignments(
      sql as unknown as SqlLike,
      slug,
      buildAssignments(["description", "data_source"], MANIFEST),
    );

    const after = await row();
    expect(after.description).toBe(MANIFEST.description);
    expect(after.data_source).toBe(MANIFEST.data_source);
    expect(JSON.stringify(after.output_schema)).toBe(JSON.stringify(before.output_schema));
  });

  it("the drifted output_schema survives every single-field sync except its own", async () => {
    // Exhaustive over the canonical set: only selecting output_schema may
    // change it. Anything else leaving it altered would mean the SET clause
    // is wider than the selection.
    const baseline = JSON.stringify((await row()).output_schema);

    for (const field of CANONICAL_SYNC_FIELD_NAMES) {
      if (field === "output_schema") continue;
      const assignments = buildAssignments([field], MANIFEST);
      if (assignments.length === 0) continue; // absent from this manifest
      await applyAssignments(sql as unknown as SqlLike, slug, assignments);
      expect(
        JSON.stringify((await row()).output_schema),
        `syncing ${field} altered output_schema`,
      ).toBe(baseline);
    }
  });

  it("and selecting it explicitly DOES change it — the control", async () => {
    // Without this the test above would pass on a sync that writes nothing.
    await applyAssignments(
      sql as unknown as SqlLike,
      slug,
      buildAssignments(["output_schema"], MANIFEST),
    );
    expect((await row()).output_schema).toEqual(MANIFEST.output_schema);
  });
});
