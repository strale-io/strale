import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  DQ46_NEW_PEP_EXAMPLE_LISTS,
  DQ46_NEW_PEP_LIMITATION_PHRASE,
  DQ46_NEW_SANCTIONS_DATA_SOURCE,
  DQ46_NEW_SANCTIONS_EXAMPLE_LISTS,
  DQ46_OLD_PEP_EXAMPLE_LISTS,
  DQ46_OLD_PEP_LIMITATION_PHRASE,
  DQ46_OLD_SANCTIONS_DATA_SOURCE,
  DQ46_OLD_SANCTIONS_EXAMPLE_LISTS,
  runMigration0149_publishDilisenseSourceText,
} from "../startup-migrations/blocks/0149-publish-dilisense-source-text.js";
import { DQ36_NEW_SANCTIONS_DATA_SOURCE } from "../startup-migrations/blocks/0122-correct-sanctions-source-copy.js";
import { BLOCKS } from "./startup-migrations.js";
import { BLOCK_RUN_POLICY } from "../startup-migrations/run-policy.js";
import type { MigrationExecutor } from "../startup-migrations/types.js";

const dialect = new PgDialect();
function recordingTx(count: number) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const tx = {
    execute: async (q: SQL) => {
      queries.push(dialect.sqlToQuery(q));
      return { count };
    },
  } as unknown as MigrationExecutor;
  return { tx, queries };
}

const repoRoot = resolve(import.meta.dirname, "../../../..");
type Manifest = {
  data_source: string;
  output_schema: { example: { lists_queried: unknown } };
  limitations: Array<{ text: string; category: string }>;
};
const manifest = (slug: string) => yaml.load(readFileSync(resolve(repoRoot, `manifests/${slug}.yaml`), "utf8")) as Manifest;

describe("block 0149: the narrowed sanctions and PEP text is published (DQ-46)", () => {
  it("is registered to run at startup, once, after block 0122", () => {
    expect(BLOCKS).toContain(runMigration0149_publishDilisenseSourceText);
    expect(BLOCK_RUN_POLICY.runMigration0149_publishDilisenseSourceText?.policy).toBe("once");
    const names = BLOCKS.map((b) => b.name);
    expect(names.indexOf("runMigration0149_publishDilisenseSourceText")).toBeGreaterThan(
      names.indexOf("runMigration0122_correctSanctionsSourceCopy"),
    );
  });

  it("guards the data_source update on exactly the text block 0122 published", () => {
    expect(DQ46_OLD_SANCTIONS_DATA_SOURCE).toBe(DQ36_NEW_SANCTIONS_DATA_SOURCE);
  });

  it("writes four guarded updates, scoped to the two slugs, and never moves updated_at", async () => {
    const { tx, queries } = recordingTx(1);
    const result = await runMigration0149_publishDilisenseSourceText(tx);
    expect(queries).toHaveLength(4);
    for (const q of queries) {
      const text = q.sql.replace(/\s+/g, " ");
      expect(text).toMatch(/ WHERE /);
      expect(text).not.toMatch(/updated_at/);
      for (const p of q.params) expect(p instanceof Date || Buffer.isBuffer(p)).toBe(false);
    }
    expect(queries[0].params).toEqual([DQ46_NEW_SANCTIONS_DATA_SOURCE, DQ46_OLD_SANCTIONS_DATA_SOURCE]);
    expect(queries[0].sql).toMatch(/slug = 'sanctions-check'/);
    expect(queries[1].sql).toMatch(/slug = 'sanctions-check'/);
    expect(queries[1].sql).toMatch(/#> '\{example,lists_queried\}' = \$2::jsonb/);
    expect(JSON.parse(queries[1].params[1] as string)).toEqual(DQ46_OLD_SANCTIONS_EXAMPLE_LISTS);
    expect(queries[2].sql).toMatch(/slug = 'pep-check'/);
    expect(JSON.parse(queries[2].params[1] as string)).toEqual(DQ46_OLD_PEP_EXAMPLE_LISTS);
    expect(queries[3].sql).toMatch(/capability_slug = 'pep-check'/);
    expect(queries[3].params).toEqual([DQ46_OLD_PEP_LIMITATION_PHRASE, DQ46_NEW_PEP_LIMITATION_PHRASE, DQ46_OLD_PEP_LIMITATION_PHRASE]);
    expect(result.block).toBe("0149_publishDilisenseSourceText");
    expect(result.rows_affected).toBe(4);
  });

  it("reports no change when the text has already moved on", async () => {
    const { tx } = recordingTx(0);
    const result = await runMigration0149_publishDilisenseSourceText(tx);
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/^no change/);
  });

  it("the manifests carry exactly the published text", () => {
    const sanctions = manifest("sanctions-check");
    expect(sanctions.data_source).toBe(DQ46_NEW_SANCTIONS_DATA_SOURCE);
    expect(sanctions.output_schema.example.lists_queried).toEqual(DQ46_NEW_SANCTIONS_EXAMPLE_LISTS);
    const pep = manifest("pep-check");
    expect(pep.output_schema.example.lists_queried).toEqual(DQ46_NEW_PEP_EXAMPLE_LISTS);
    const freshness = pep.limitations.find((l) => l.category === "freshness")!;
    expect(freshness.text.startsWith(DQ46_NEW_PEP_LIMITATION_PHRASE)).toBe(true);
  });

  it("the new text only narrows: no unscreened lists, no overstated cadence", () => {
    const published = JSON.stringify([DQ46_NEW_SANCTIONS_DATA_SOURCE, DQ46_NEW_SANCTIONS_EXAMPLE_LISTS, DQ46_NEW_PEP_EXAMPLE_LISTS, DQ46_NEW_PEP_LIMITATION_PHRASE]);
    for (const gone of ["World Bank", "EBRD", "ADB", "OFSI", "134", "130+", "multiple times daily", "Wikidata"]) {
      expect(published, gone).not.toContain(gone);
    }
  });
});
