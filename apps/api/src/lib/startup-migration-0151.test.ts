import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { SANCTIONS_LIMITATIONS_0151, runMigration0151_correctSanctionsLimitations } from "../startup-migrations/blocks/0151-correct-sanctions-limitations.js";
import { BLOCKS } from "./startup-migrations.js";
import { BLOCK_RUN_POLICY } from "../startup-migrations/run-policy.js";

describe("sanctions limitation publication", () => {
  it("runs once at startup after earlier source-copy corrections", () => {
    expect(BLOCKS.indexOf(runMigration0151_correctSanctionsLimitations)).toBeGreaterThan(BLOCKS.findIndex((b) => b.name.startsWith("runMigration0150_")));
    expect(BLOCK_RUN_POLICY.runMigration0151_correctSanctionsLimitations?.policy).toBe("once");
  });
  it("writes bound strings only, scoped to active sanctions rows with the exact old text", async () => {
    const queries: { sql: string; params: unknown[] }[] = [];
    const result = await runMigration0151_correctSanctionsLimitations({ execute: async (q: SQL) => { queries.push(new PgDialect().sqlToQuery(q)); return { count: 1 }; } });
    expect(result.rows_affected).toBe(2);
    expect(queries).toHaveLength(2);
    queries.forEach((q, i) => {
      const row = SANCTIONS_LIMITATIONS_0151[i];
      expect(q.sql.replace(/\s+/g, " ")).toMatch(/WHERE capability_slug = 'sanctions-check' AND active = true AND category = \$4 AND limitation_text IN \(/);
      expect(q.sql).not.toMatch(/DELETE|INSERT|updated_at/);
      expect(q.params).toEqual([row.title, row.text, row.workaround, row.category, ...row.oldTexts]);
      for (const p of q.params) expect(typeof p).toBe("string");
    });
    expect(SANCTIONS_LIMITATIONS_0151[0].oldTexts).toContain("Sanctions lists updated daily from OFAC, EU, and UN sources — newly sanctioned entities may take up to 24 hours to appear");
  });
  it("reports no change if the old rows are absent or already corrected", async () => {
    expect((await runMigration0151_correctSanctionsLimitations({ execute: async () => ({ count: 0 }) })).rows_affected).toBe(0);
  });
  it("keeps the manifest and fresh-database seed consistent with the published correction", () => {
    const root = resolve(import.meta.dirname, "../../../..");
    const manifest = yaml.load(readFileSync(resolve(root, "manifests/sanctions-check.yaml"), "utf8")) as { limitations: Record<string, string>[] };
    const seed = readFileSync(resolve(root, "apps/api/src/db/seed-limitations.ts"), "utf8").split("// ── sanctions-check ──")[1].split("// ── pep-check ──")[0];
    for (const row of SANCTIONS_LIMITATIONS_0151) {
      expect(manifest.limitations.find((l) => l.category === row.category)).toMatchObject({ title: row.title, text: row.text, workaround: row.workaround });
      for (const text of [row.title, row.text, row.workaround]) expect(seed).toContain(JSON.stringify(text));
    }
  });
});
