import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import * as yaml from "js-yaml";
import {
  DEPENDENCY_AUDIT_NEW_LIMITATION,
  DEPENDENCY_AUDIT_OLD_LIMITATION,
  runMigration0144_correctAiLabelAndDependencyAuditText,
} from "../startup-migrations/blocks/0144-correct-ai-label-and-dependency-audit-text.js";
import { BLOCKS } from "./startup-migrations.js";
import type { MigrationExecutor } from "../startup-migrations/types.js";

const dialect = new PgDialect();

function recordingTx(counts: number[]) {
  const queries: { sql: string; params: unknown[] }[] = [];
  let i = 0;
  const tx = {
    execute: async (q: SQL) => {
      queries.push(dialect.sqlToQuery(q));
      return { count: counts[i++] ?? 0 };
    },
  } as unknown as MigrationExecutor;
  return { tx, queries };
}

const flat = (s: string) => s.replace(/\s+/g, " ").trim();
const manifest = (slug: string) =>
  yaml.load(readFileSync(resolve(__dirname, `../../../../manifests/${slug}.yaml`), "utf8")) as Record<string, unknown>;

describe("block 0144: correct the env-template-generate AI label and the dependency-audit limitation", () => {
  it("is registered to run at startup", () => {
    expect(BLOCKS).toContain(runMigration0144_correctAiLabelAndDependencyAuditText);
  });

  it("retags env-template-generate only when it still says algorithmic", async () => {
    const { tx, queries } = recordingTx([1, 1]);
    await runMigration0144_correctAiLabelAndDependencyAuditText(tx);
    expect(queries).toHaveLength(2);
    expect(flat(queries[0].sql)).toBe(
      "UPDATE capabilities SET transparency_tag = $1 WHERE slug = $2 AND transparency_tag = $3",
    );
    expect(queries[0].params).toEqual(["ai_generated", "env-template-generate", "algorithmic"]);
    expect(queries[0].sql).not.toContain("updated_at");
  });

  it("rewrites the one active dependency-audit limitation guarded on the exact old text", async () => {
    const { tx, queries } = recordingTx([0, 1]);
    await runMigration0144_correctAiLabelAndDependencyAuditText(tx);
    expect(flat(queries[1].sql)).toBe(
      "UPDATE capability_limitations SET limitation_text = $1, updated_at = now() WHERE capability_slug = $2 AND active = true AND limitation_text = $3",
    );
    expect(queries[1].params).toEqual([DEPENDENCY_AUDIT_NEW_LIMITATION, "dependency-audit", DEPENDENCY_AUDIT_OLD_LIMITATION]);
  });

  it("binds only strings (no Date reaches a sql template)", async () => {
    const { tx, queries } = recordingTx([0, 0]);
    await runMigration0144_correctAiLabelAndDependencyAuditText(tx);
    for (const q of queries) for (const p of q.params) expect(typeof p).toBe("string");
  });

  it("reports no change on a second run", async () => {
    const { tx } = recordingTx([0, 0]);
    const result = await runMigration0144_correctAiLabelAndDependencyAuditText(tx);
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/no change/);
  });

  it("matches the manifests, so the boot sync and this block agree", () => {
    expect(manifest("env-template-generate").transparency_tag).toBe("ai_generated");
    const limitations = manifest("dependency-audit").limitations as Array<{ text: string }>;
    expect(limitations.map((l) => l.text)).toContain(DEPENDENCY_AUDIT_NEW_LIMITATION);
    expect(String(manifest("dependency-audit").data_source)).not.toMatch(/no external data/);
    expect(DEPENDENCY_AUDIT_NEW_LIMITATION).not.toMatch(/\bAI\b/);
  });
});
