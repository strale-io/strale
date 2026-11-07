import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  EU_TRADEMARK_SEARCH_DEACTIVATION_REASON,
  EU_TRADEMARK_SEARCH_SLUG,
  runMigration0148_deactivateEuTrademarkSearch,
} from "../startup-migrations/blocks/0148-deactivate-eu-trademark-search.js";
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

describe("block 0148: eu-trademark-search is delisted with its reason (DQ-42)", () => {
  it("is registered to run at startup, once", () => {
    expect(BLOCKS).toContain(runMigration0148_deactivateEuTrademarkSearch);
    expect(BLOCK_RUN_POLICY.runMigration0148_deactivateEuTrademarkSearch?.policy).toBe("once");
  });

  it("writes the reason on the one slug, only once the boot sync has cleared all three flags", async () => {
    const { tx, queries } = recordingTx(1);
    const result = await runMigration0148_deactivateEuTrademarkSearch(tx);
    expect(queries).toHaveLength(1);
    expect(queries[0].sql.replace(/\s+/g, " ").trim()).toBe(
      "UPDATE capabilities SET deactivation_reason = $1, updated_at = now() WHERE slug = $2 AND is_active = false AND visible = false AND x402_enabled = false AND deactivation_reason IS DISTINCT FROM $3",
    );
    expect(queries[0].params).toEqual([
      EU_TRADEMARK_SEARCH_DEACTIVATION_REASON,
      "eu-trademark-search",
      EU_TRADEMARK_SEARCH_DEACTIVATION_REASON,
    ]);
    expect(EU_TRADEMARK_SEARCH_SLUG).toBe("eu-trademark-search");
    expect(EU_TRADEMARK_SEARCH_DEACTIVATION_REASON).toContain("DEC-20261023-A");
    expect(EU_TRADEMARK_SEARCH_DEACTIVATION_REASON).toContain("DQ-42");
    expect(result.block).toBe("0148_deactivateEuTrademarkSearch");
    expect(result.rows_affected).toBe(1);
    expect(result.outcome).toMatch(/reason recorded/);
  });

  it("cannot undo a relisting: it never sets a flag and matches no row with a flag back on", async () => {
    const { tx, queries } = recordingTx(0);
    await runMigration0148_deactivateEuTrademarkSearch(tx);
    const sqlText = queries[0].sql.toLowerCase();
    const setClause = sqlText.slice(sqlText.indexOf(" set "), sqlText.indexOf(" where "));
    expect(setClause).not.toMatch(/is_active|visible|x402_enabled/);
    expect(sqlText).not.toMatch(/\bor\b/);
  });

  it("is a no-op on a second run and binds no Date or Buffer", async () => {
    const { tx, queries } = recordingTx(0);
    const result = await runMigration0148_deactivateEuTrademarkSearch(tx);
    for (const q of queries) {
      for (const p of q.params) {
        expect(p instanceof Date).toBe(false);
        expect(Buffer.isBuffer(p)).toBe(false);
      }
    }
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/no change/);
  });

  it("the code keeps the executor off, and the manifest says it is unavailable", () => {
    const autoRegister = readFileSync(resolve(repoRoot, "apps/api/src/capabilities/auto-register.ts"), "utf8");
    expect(autoRegister).toMatch(/\[\s*"eu-trademark-search",\s*"deactivated 2026-11-06 \(DQ-42/);
    const manifest = readFileSync(resolve(repoRoot, "manifests/eu-trademark-search.yaml"), "utf8");
    expect(manifest).toMatch(/^description: "Currently unavailable\. /m);
  });
});
