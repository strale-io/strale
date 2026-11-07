import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  DQ47_OLD_PEP_LIMITATION_TEXTS,
  DQ47_PEP_LIMITATIONS,
  runMigration0150_publishPepCheckLimitations,
} from "../startup-migrations/blocks/0150-publish-pep-check-limitations.js";
import {
  DQ46_NEW_PEP_LIMITATION_TEXT,
  DQ46_OLD_PEP_LIMITATION_TEXT,
} from "../startup-migrations/blocks/0149-publish-dilisense-source-text.js";
import { manifestLimitationsToRows } from "./manifest-limitations.js";
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

describe("block 0150: pep-check's limitations are replaced with the manifest's (DQ-47)", () => {
  it("is registered to run once, after block 0149", () => {
    expect(BLOCKS).toContain(runMigration0150_publishPepCheckLimitations);
    expect(BLOCK_RUN_POLICY.runMigration0150_publishPepCheckLimitations?.policy).toBe("once");
    const names = BLOCKS.map((b) => b.name);
    expect(names.indexOf("runMigration0150_publishPepCheckLimitations")).toBeGreaterThan(
      names.indexOf("runMigration0149_publishDilisenseSourceText"),
    );
  });

  it("inserts exactly the manifest's limitations, in order", () => {
    const manifest = yaml.load(readFileSync(resolve(repoRoot, "manifests/pep-check.yaml"), "utf8")) as Parameters<typeof manifestLimitationsToRows>[0];
    expect(DQ47_PEP_LIMITATIONS).toEqual(manifestLimitationsToRows(manifest));
  });

  it("deletes only the named production rows, including the freshness row in both its 0149 forms", () => {
    expect(DQ47_OLD_PEP_LIMITATION_TEXTS).toContain(DQ46_OLD_PEP_LIMITATION_TEXT);
    expect(DQ47_OLD_PEP_LIMITATION_TEXTS).toContain(DQ46_NEW_PEP_LIMITATION_TEXT);
    expect(DQ47_OLD_PEP_LIMITATION_TEXTS.some((t) => t.includes("OpenSanctions"))).toBe(true);
    // None of the rows to delete is one of the rows to keep.
    for (const keep of DQ47_PEP_LIMITATIONS) expect(DQ47_OLD_PEP_LIMITATION_TEXTS).not.toContain(keep.limitationText);
  });

  it("scopes both statements to pep-check and binds only strings and integers", async () => {
    const { tx, queries } = recordingTx(1);
    const result = await runMigration0150_publishPepCheckLimitations(tx);
    expect(queries).toHaveLength(2);
    const [del, ins] = queries;
    expect(del.sql.replace(/\s+/g, " ")).toMatch(/^ ?DELETE FROM capability_limitations WHERE capability_slug = \$1 AND active = true AND limitation_text IN \(/);
    expect(del.params).toEqual(["pep-check", ...DQ47_OLD_PEP_LIMITATION_TEXTS]);
    expect(ins.sql).toMatch(/NOT EXISTS/);
    expect(ins.sql).toMatch(/EXISTS \(SELECT 1 FROM capabilities c WHERE c.slug = /);
    for (const q of queries) {
      expect(q.sql).not.toMatch(/updated_at/);
      for (const p of q.params) expect(p === null || typeof p === "string" || typeof p === "number").toBe(true);
    }
    expect(result.block).toBe("0150_publishPepCheckLimitations");
    expect(result.rows_affected).toBe(2);
  });

  it("reports no change when there is nothing left to do", async () => {
    const { tx } = recordingTx(0);
    const result = await runMigration0150_publishPepCheckLimitations(tx);
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/^no change/);
  });

  it("the published set names no source we do not use", () => {
    const text = JSON.stringify(DQ47_PEP_LIMITATIONS);
    for (const gone of ["OpenSanctions", "LLM fallback", "multiple times"]) expect(text, gone).not.toContain(gone);
  });
});
