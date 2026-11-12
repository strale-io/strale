import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  CZ_VAT_PAYER_0155,
  DOMAIN_REPUTATION_0155,
  PUBLICATIONS_0155,
  runMigration0155_publishCzVatAndDomainReputationText,
} from "../startup-migrations/blocks/0155-publish-cz-vat-and-domain-reputation-text.js";
import type { MigrationExecutor } from "../startup-migrations/types.js";
import { BLOCKS } from "./startup-migrations.js";
import { BLOCK_RUN_POLICY } from "../startup-migrations/run-policy.js";
import { readTextManifests, textPayload } from "./manifest-text-sync.js";

const dialect = new PgDialect();
const flat = (s: string) => s.replace(/\s+/g, " ");

type Counts = { schema_updated: number; deleted: number; inserted: number; reordered: number };
function recordingTx(results: Counts[]) {
  const queries: { sql: string; params: unknown[] }[] = [];
  let i = 0;
  const tx = {
    execute: async (q: SQL) => {
      queries.push(dialect.sqlToQuery(q));
      return [results[i++] ?? { schema_updated: 0, deleted: 0, inserted: 0, reordered: 0 }];
    },
  } as unknown as MigrationExecutor;
  return { tx, queries };
}
const none: Counts = { schema_updated: 0, deleted: 0, inserted: 0, reordered: 0 };

/** What the boot sync's own textPayload derives from the manifest file. */
async function syncPayload(slug: string) {
  const source = (await readTextManifests()).find((s) => s.slug === slug);
  if (!source) throw new Error(`no manifest for ${slug}`);
  return textPayload(await source.load());
}

describe("block 0155: publish the cz-unreliable-vat-payer and domain-reputation text", () => {
  for (const p of PUBLICATIONS_0155) {
    it(`${p.slug}: publishes exactly what the manifest text sync would write`, async () => {
      const payload = await syncPayload(p.slug);
      expect(p.outputSchema).toEqual(payload.patch.outputSchema);
      expect(p.limitations).toEqual(payload.limitations);
    });
  }

  it("leaves the other text columns alone: the block writes output_schema only on capabilities", async () => {
    const { tx, queries } = recordingTx([none, none]);
    await runMigration0155_publishCzVatAndDomainReputationText(tx);
    for (const q of queries) {
      const sets = [...flat(q.sql).matchAll(/UPDATE capabilities SET (\w+) =/g)].map((m) => m[1]);
      expect(sets).toEqual(["output_schema"]);
    }
  });

  it("runs one statement per capability, cz-unreliable-vat-payer first, each scoped to its own slug", async () => {
    const { tx, queries } = recordingTx([none, none]);
    await runMigration0155_publishCzVatAndDomainReputationText(tx);
    expect(queries).toHaveLength(2);
    expect(PUBLICATIONS_0155.map((p) => p.slug)).toEqual(["cz-unreliable-vat-payer", "domain-reputation"]);
    queries.forEach((q, i) => {
      const slug = PUBLICATIONS_0155[i].slug;
      const other = PUBLICATIONS_0155[1 - i].slug;
      expect(q.params).toContain(slug);
      expect(q.params).not.toContain(other);
      const text = flat(q.sql);
      expect(text).toMatch(/UPDATE capabilities SET output_schema = .* WHERE slug = \$\d+ AND output_schema IS DISTINCT FROM /);
      expect(text).toMatch(/DELETE FROM capability_limitations cl WHERE cl\.capability_slug = \$\d+ AND cl\.active = true/);
      expect(text).toMatch(/INSERT INTO capability_limitations/);
      expect(text).toMatch(/UPDATE capability_limitations cl SET sort_order = w\.sort_order .* AND cl\.active = true .* AND cl\.sort_order IS DISTINCT FROM w\.sort_order/);
      // Delete and insert only where the capability exists (no orphan rows on a fresh database).
      expect(text.match(/EXISTS \(SELECT 1 FROM capabilities c WHERE c\.slug = \$\d+\)/g)).toHaveLength(2);
    });
  });

  it("writes no updated_at and binds only strings and integers (DEC-20260504-A)", async () => {
    const { tx, queries } = recordingTx([none, none]);
    await runMigration0155_publishCzVatAndDomainReputationText(tx);
    for (const q of queries) {
      expect(q.sql).not.toContain("updated_at");
      expect(q.sql).not.toContain("manifest_text_hash");
      for (const v of q.params) {
        expect(v === null || typeof v === "string" || Number.isInteger(v), `bound ${typeof v}`).toBe(true);
      }
    }
  });

  it("binds every limitation in manifest order, with its index as sort_order", async () => {
    const { tx, queries } = recordingTx([none, none]);
    await runMigration0155_publishCzVatAndDomainReputationText(tx);
    queries.forEach((q, i) => {
      const p = PUBLICATIONS_0155[i];
      const params = q.params;
      p.limitations.forEach((l, n) => {
        const at = params.findIndex(
          (v, k) => v === n && params[k + 1] === l.title && params[k + 2] === l.limitationText && params[k + 3] === l.category,
        );
        expect(at, `${p.slug} limitation ${n} bound with sort_order ${n}`).toBeGreaterThanOrEqual(0);
        expect(params[at + 4]).toBe(l.severity);
        expect(params[at + 5]).toBe(l.workaround);
      });
      expect(params).toContain(JSON.stringify(p.outputSchema));
    });
  });

  it("keeps a stored example where the manifest has none, as withRuntimeExample does", async () => {
    const { tx, queries } = recordingTx([none, none]);
    await runMigration0155_publishCzVatAndDomainReputationText(tx);
    expect("example" in CZ_VAT_PAYER_0155.outputSchema).toBe(false);
    expect(flat(queries[0].sql)).toContain("CASE WHEN output_schema -> 'example' IS NOT NULL THEN");
    expect(flat(queries[0].sql)).toContain("jsonb_build_object('example', output_schema -> 'example')");
    expect("example" in DOMAIN_REPUTATION_0155.outputSchema).toBe(true);
    expect(queries[1].sql).not.toContain("output_schema -> 'example'");
  });

  it("reports the rows it changed, and no change on a second run", async () => {
    const first = await runMigration0155_publishCzVatAndDomainReputationText(
      recordingTx([
        { schema_updated: 1, deleted: 1, inserted: 2, reordered: 1 },
        { schema_updated: 1, deleted: 2, inserted: 4, reordered: 0 },
      ]).tx,
    );
    expect(first.rows_affected).toBe(12);
    expect(first.outcome).toContain("cz-unreliable-vat-payer (output_schema 1, limitations -1/+2/~1)");
    const second = await runMigration0155_publishCzVatAndDomainReputationText(recordingTx([none, none]).tx);
    expect(second.rows_affected).toBe(0);
    expect(second.outcome).toMatch(/^no change/);
  });

  it("is disjoint from M050: neither slug has an entry in CAPABILITY_OUTPUT_CONTRACTS", async () => {
    const { CAPABILITY_OUTPUT_CONTRACTS } = await import("./capability-output-contracts.js");
    for (const p of PUBLICATIONS_0155) expect(CAPABILITY_OUTPUT_CONTRACTS[p.slug]).toBeUndefined();
  });

  it("is registered after block 0154 with run policy once", () => {
    expect(BLOCKS.indexOf(runMigration0155_publishCzVatAndDomainReputationText)).toBeGreaterThan(
      BLOCKS.findIndex((b) => b.name.startsWith("runMigration0154_")),
    );
    expect(BLOCK_RUN_POLICY.runMigration0155_publishCzVatAndDomainReputationText?.policy).toBe("once");
  });

  // Independent copy of what wave 3 and wave 4 changed, so the approved
  // wording is pinned even if the manifest and the constants move together.
  it("carries the cz not-registered limitation and the nullable output types (wave 3)", () => {
    const props = CZ_VAT_PAYER_0155.outputSchema.properties as Record<string, { type: unknown }>;
    expect(props.dic.type).toEqual(["string", "null"]);
    expect(props.is_unreliable_payer.type).toEqual(["boolean", "null"]);
    expect(props.financial_office_code.type).toEqual(["string", "null"]);
    expect(props.response_generated_at.type).toEqual(["string", "null"]);
    expect(props.published_accounts.items.properties.bank_code.type).toEqual(["string", "null"]);
    const notFound = CZ_VAT_PAYER_0155.limitations.find((l) => l.title === "A DIČ not in the VAT-payer register is not explained further");
    expect(notFound?.limitationText).toContain(
      "is returned as is_registered_vat_payer false, with dic, is_unreliable_payer and financial_office_code null",
    );
    expect(CZ_VAT_PAYER_0155.limitations.map((l) => l.title)).toEqual([
      "DIČ is required; it is not inferred from IČO",
      "Not a liveness check on the bank account",
      "A DIČ not in the VAT-payer register is not explained further",
      "Status snapshot only — history not returned",
    ]);
  });

  it("carries the domain-reputation limitations narrowed to wave 4", () => {
    const texts = DOMAIN_REPUTATION_0155.limitations.map((l) => l.limitationText).join("\n");
    expect(texts).not.toMatch(/temporary DNS failure lowers/);
    expect(texts).toContain("the call fails unbilled instead of lowering the score");
    expect(texts).toContain("marked by the cf-mitigated: challenge response header");
    expect(texts).toContain("a challenge that is not marked by that header is not recognised");
    expect(texts).toContain("does not answer within 8 seconds");
    expect(texts).toContain("redirects to an address Strale does not follow");
    expect(DOMAIN_REPUTATION_0155.limitations.map((l) => [l.title, l.category, l.severity])).toEqual([
      ["No blocklist or threat-intelligence lookup", "accuracy", "warning"],
      ["Computed live on every call", "freshness", "info"],
      ["An anti-bot challenge fails the call, with no score", "accuracy", "info"],
      ["Some domains are not checked", "coverage", "info"],
    ]);
  });

  it("keeps the fresh-database seed equal to the published domain-reputation rows", () => {
    const seed = readFileSync(resolve(import.meta.dirname, "../db/seed-limitations.ts"), "utf8")
      .split("// ── domain-reputation ──")[1]
      .split("// ── sanctions-check ──")[0];
    for (const l of DOMAIN_REPUTATION_0155.limitations) {
      for (const text of [l.title, l.limitationText, l.workaround]) if (text) expect(seed).toContain(JSON.stringify(text));
    }
  });
});
