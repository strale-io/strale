import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  POLISH_COMPANY_DATA_SLUG,
  runMigration0146_polishCompanyDataAlgorithmic,
} from "../startup-migrations/blocks/0146-polish-company-data-algorithmic.js";
import { BLOCKS } from "./startup-migrations.js";
import { PROVIDERS } from "./dependency-manifest.js";
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

describe("block 0146: polish-company-data is labelled algorithmic", () => {
  it("is registered to run at startup", () => {
    expect(BLOCKS).toContain(runMigration0146_polishCompanyDataAlgorithmic);
  });

  it("rewrites the tag only from the old value, on the one slug", async () => {
    const { tx, queries } = recordingTx(1);
    const result = await runMigration0146_polishCompanyDataAlgorithmic(tx);
    expect(queries).toHaveLength(1);
    expect(queries[0].sql.replace(/\s+/g, " ").trim()).toBe(
      "UPDATE capabilities SET transparency_tag = $1 WHERE slug = $2 AND transparency_tag = $3",
    );
    expect(queries[0].params).toEqual(["algorithmic", POLISH_COMPANY_DATA_SLUG, "ai_generated"]);
    expect(queries[0].sql).not.toContain("updated_at");
    expect(result.rows_affected).toBe(1);
  });

  it("is a no-op on a second run and binds no Date", async () => {
    const { tx, queries } = recordingTx(0);
    const result = await runMigration0146_polishCompanyDataAlgorithmic(tx);
    for (const p of queries[0].params) expect(p instanceof Date).toBe(false);
    expect(result.outcome).toMatch(/no change/);
  });

  it("the manifest carries the same label", () => {
    const manifest = readFileSync(resolve(repoRoot, "manifests/polish-company-data.yaml"), "utf8");
    expect(manifest).toMatch(/^transparency_tag: algorithmic$/m);
  });

  it("the executor has no path to a model", () => {
    const src = readFileSync(resolve(repoRoot, "apps/api/src/capabilities/polish-company-data.ts"), "utf8");
    const imports = [...src.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
    expect(imports.sort()).toEqual(["../lib/vat-derivation.js", "./index.js"]);
    expect(src).not.toMatch(/anthropic|openai|MODELS\.|callClaude|llm/i);
    const vat = readFileSync(resolve(repoRoot, "apps/api/src/lib/vat-derivation.ts"), "utf8");
    expect(vat).not.toMatch(/^import /m);
    const anthropic = PROVIDERS.find((p) => p.name === "anthropic");
    expect(anthropic).toBeDefined();
    expect([...(anthropic?.capabilities ?? []), ...(anthropic?.fallbackCapabilities ?? [])]).not.toContain(POLISH_COMPANY_DATA_SLUG);
  });
});
