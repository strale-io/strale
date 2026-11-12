import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  DOMAIN_TRUST_NEW_EXAMPLE_REGISTRAR,
  DOMAIN_TRUST_OLD_EXAMPLE_REGISTRAR,
  WHOIS_COPY_TEXT_UPDATES,
  runMigration0154_narrowWhoisSolutionCopy,
} from "../startup-migrations/blocks/0154-narrow-whois-solution-copy.js";
import { DOMAIN_TRUST_NEW_LONG_DESCRIPTION } from "../startup-migrations/blocks/0143-publish-domain-reputation-text.js";
import { BLOCKS } from "./startup-migrations.js";
import { BLOCK_RUN_POLICY } from "../startup-migrations/run-policy.js";
import { SOLUTIONS } from "../db/solution-catalogue.js";
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
const SLUGS = ["company-intelligence-sdr", "domain-intel", "domain-trust", "lead-enrich", "vendor-risk-assess"];
const catalogue = (slug: string) => SOLUTIONS.find((s) => s.slug === slug)!;
const CATALOGUE_FIELD = {
  long_description: "longDescription",
  target_audience: "targetAudience",
  agent_description: "agentDescription",
} as const;

// Statement order: 0 long_description, 1 target_audience, 2 agent_description, 3 example_output.
describe("block 0154: narrow the WHOIS and phishing claims in solution copy (PR #1018 review round 4, T1 and T5)", () => {
  it("runs four statements, each a guarded UPDATE of solutions that never writes updated_at", async () => {
    const { tx, queries } = recordingTx([5, 1, 1, 1]);
    const result = await runMigration0154_narrowWhoisSolutionCopy(tx);
    expect(queries).toHaveLength(4);
    for (const q of queries) {
      expect(flat(q.sql)).toMatch(/^UPDATE solutions /);
      expect(q.sql).not.toContain("updated_at");
      for (const p of q.params) expect(typeof p).toBe("string");
    }
    expect(result.rows_affected).toBe(8);
  });

  it.each([
    [0, "long_description"],
    [1, "target_audience"],
    [2, "agent_description"],
  ] as const)("statement %i sets %s only where the slug and the exact old text both match", async (i, column) => {
    const { tx, queries } = recordingTx([0, 0, 0, 0]);
    await runMigration0154_narrowWhoisSolutionCopy(tx);
    const text = flat(queries[i].sql);
    expect(text).toContain(`UPDATE solutions s SET ${column} = v.to_text FROM (VALUES`);
    expect(text).toMatch(new RegExp(`WHERE s\\.slug = v\\.slug AND s\\.${column} = v\\.from_text$`));
    const rows = WHOIS_COPY_TEXT_UPDATES.filter((u) => u.column === column);
    expect(queries[i].params).toEqual(rows.flatMap((u) => [u.slug, u.from, u.to]));
  });

  it("rewrites domain-trust's example registrar only while it is still IANA", async () => {
    const { tx, queries } = recordingTx([0, 0, 0, 1]);
    await runMigration0154_narrowWhoisSolutionCopy(tx);
    const q = queries[3];
    expect(flat(q.sql)).toBe(
      "UPDATE solutions SET example_output = jsonb_set(example_output, '{registrar}', to_jsonb($1::text)) WHERE slug = $2 AND example_output ->> 'registrar' = $3",
    );
    expect(q.params).toEqual([DOMAIN_TRUST_NEW_EXAMPLE_REGISTRAR, "domain-trust", DOMAIN_TRUST_OLD_EXAMPLE_REGISTRAR]);
  });

  it("touches only the five named solutions", async () => {
    const { tx, queries } = recordingTx([0, 0, 0, 0]);
    await runMigration0154_narrowWhoisSolutionCopy(tx);
    const slugs = new Set(queries.flatMap((q) => q.params).filter((p) => typeof p === "string" && SLUGS.includes(p)));
    expect([...slugs].sort()).toEqual(SLUGS);
    expect([...new Set(WHOIS_COPY_TEXT_UPDATES.map((u) => u.slug))].sort()).toEqual(SLUGS);
    for (const q of queries) expect(flat(q.sql)).not.toMatch(/slug (in|like|<>|!=)/i);
  });

  it("reports no change when every guard misses (a second run, or text edited since)", async () => {
    const { tx } = recordingTx([0, 0, 0, 0]);
    const result = await runMigration0154_narrowWhoisSolutionCopy(tx);
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/^no change/);
  });

  it("writes exactly what db/solution-catalogue.ts now says, so the catalogue and the live rows agree", () => {
    for (const u of WHOIS_COPY_TEXT_UPDATES) {
      expect(catalogue(u.slug)[CATALOGUE_FIELD[u.column]]).toBe(u.to);
    }
    expect((catalogue("domain-trust").exampleOutput as Record<string, unknown>).registrar).toBe(DOMAIN_TRUST_NEW_EXAMPLE_REGISTRAR);
  });

  it("narrows only: every new text keeps the old WHOIS claim's scope or drops a phishing claim, and none is a no-op", () => {
    for (const u of WHOIS_COPY_TEXT_UPDATES) {
      expect(u.to).not.toBe(u.from);
      expect(u.to.toLowerCase()).not.toContain("phishing detection");
      expect(u.to.toLowerCase()).not.toContain("phishing check");
      if (/WHOIS/.test(u.from)) expect(u.to).toContain("for domains under common TLDs");
    }
  });

  it("chains on block 0143: domain-trust's long_description guard is 0143's own target text", () => {
    const longRow = WHOIS_COPY_TEXT_UPDATES.find((u) => u.slug === "domain-trust" && u.column === "long_description")!;
    expect(longRow.from).toBe(DOMAIN_TRUST_NEW_LONG_DESCRIPTION);
    expect(longRow.to).not.toBe(DOMAIN_TRUST_NEW_LONG_DESCRIPTION);
  });

  it("is registered last in BLOCKS with run policy once", () => {
    expect(BLOCKS[BLOCKS.length - 1]).toBe(runMigration0154_narrowWhoisSolutionCopy);
    expect(BLOCK_RUN_POLICY.runMigration0154_narrowWhoisSolutionCopy?.policy).toBe("once");
  });
});
