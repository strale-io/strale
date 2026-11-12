import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import * as yaml from "js-yaml";
import {
  DOMAIN_REPUTATION_LIMITATIONS,
  DOMAIN_REPUTATION_NEW_DATA_SOURCE,
  DOMAIN_TRUST_NEW_LONG_DESCRIPTION,
  DOMAIN_TRUST_OLD_LONG_DESCRIPTION,
  runMigration0143_publishDomainReputationText,
} from "../startup-migrations/blocks/0143-publish-domain-reputation-text.js";
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

const flat = (s: string) => s.replace(/\s+/g, " ");

// Statement order: 0 data_source, 1 limitations DELETE, 2 limitations INSERT,
// 3 limitations reorder UPDATE, 4 solutions UPDATE.
describe("block 0143: publish the narrowed domain-reputation text", () => {
  it("runs exactly five statements", async () => {
    const { tx, queries } = recordingTx([1, 2, 2, 0, 1]);
    await runMigration0143_publishDomainReputationText(tx);
    expect(queries).toHaveLength(5);
  });

  it("sets data_source for domain-reputation only, guarded by IS DISTINCT FROM", async () => {
    const { tx, queries } = recordingTx([1, 0, 0, 0, 0]);
    await runMigration0143_publishDomainReputationText(tx);
    const q = queries[0];
    const text = flat(q.sql);
    expect(text).toMatch(/^\s*UPDATE capabilities SET data_source = \$1 WHERE slug = \$2 AND data_source IS DISTINCT FROM \$3\s*$/);
    expect(q.params).toEqual([
      DOMAIN_REPUTATION_NEW_DATA_SOURCE,
      "domain-reputation",
      DOMAIN_REPUTATION_NEW_DATA_SOURCE,
    ]);
  });

  it("never writes capabilities.updated_at or solutions.updated_at (copy-only change)", async () => {
    const { tx, queries } = recordingTx([1, 0, 0, 0, 1]);
    await runMigration0143_publishDomainReputationText(tx);
    for (const i of [0, 4]) expect(queries[i].sql).not.toContain("updated_at");
  });

  it("scopes every limitations statement to the domain-reputation slug, on active rows only", async () => {
    const { tx, queries } = recordingTx([0, 2, 2, 0, 0]);
    await runMigration0143_publishDomainReputationText(tx);
    const del = flat(queries[1].sql);
    expect(del).toContain("DELETE FROM capability_limitations cl WHERE cl.capability_slug = $");
    expect(del).toContain("AND cl.active = true");
    expect(del).toContain("EXISTS (SELECT 1 FROM capabilities c WHERE c.slug = $");
    expect(del).toContain("AND NOT EXISTS ( SELECT 1 FROM (VALUES");
    expect(queries[1].params.filter((p) => p === "domain-reputation")).toHaveLength(2);

    const ins = flat(queries[2].sql);
    expect(ins).toContain("INSERT INTO capability_limitations (capability_slug, title, limitation_text, category, severity, workaround, sort_order)");
    expect(ins).toContain("WHERE EXISTS (SELECT 1 FROM capabilities c WHERE c.slug = $");
    expect(ins).toContain("AND NOT EXISTS ( SELECT 1 FROM capability_limitations cl WHERE cl.capability_slug = $");
    expect(ins).toContain("AND cl.active = true");
    expect(queries[2].params.filter((p) => p === "domain-reputation")).toHaveLength(3);

    const upd = flat(queries[3].sql);
    expect(upd).toContain("UPDATE capability_limitations cl SET sort_order = w.sort_order");
    expect(upd).toContain("WHERE cl.capability_slug = $");
    expect(upd).toContain("AND cl.active = true");
    expect(upd).toContain("AND cl.sort_order IS DISTINCT FROM w.sort_order");
    expect(queries[3].params.filter((p) => p === "domain-reputation")).toHaveLength(1);
  });

  it("binds the two manifest limitations, in manifest order, as sort_order 0 and 1", async () => {
    const { tx, queries } = recordingTx([0, 0, 0, 0, 0]);
    await runMigration0143_publishDomainReputationText(tx);
    expect(DOMAIN_REPUTATION_LIMITATIONS).toHaveLength(2);
    const l = DOMAIN_REPUTATION_LIMITATIONS;
    // INSERT binds slug, then (sort_order, title, text, category, severity, workaround) per row, then the slug twice more.
    expect(queries[2].params.slice(0, 13)).toEqual([
      "domain-reputation",
      0, l[0].title, l[0].limitationText, l[0].category, l[0].severity, l[0].workaround,
      1, l[1].title, l[1].limitationText, l[1].category, l[1].severity, l[1].workaround,
    ]);
    // DELETE keeps exactly the same two rows (no sort_order bound there).
    expect(queries[1].params).toEqual([
      "domain-reputation",
      "domain-reputation",
      l[0].title, l[0].limitationText, l[0].category, l[0].severity, l[0].workaround,
      l[1].title, l[1].limitationText, l[1].category, l[1].severity, l[1].workaround,
    ]);
  });

  it("rewrites domain-trust only while its long_description is still the exact old text", async () => {
    const { tx, queries } = recordingTx([0, 0, 0, 0, 1]);
    await runMigration0143_publishDomainReputationText(tx);
    const q = queries[4];
    expect(flat(q.sql)).toMatch(/^\s*UPDATE solutions SET long_description = \$1 WHERE slug = \$2 AND long_description = \$3\s*$/);
    expect(q.params).toEqual([DOMAIN_TRUST_NEW_LONG_DESCRIPTION, "domain-trust", DOMAIN_TRUST_OLD_LONG_DESCRIPTION]);
  });

  it("touches no slug other than domain-reputation and domain-trust", async () => {
    const { tx, queries } = recordingTx([1, 2, 2, 0, 1]);
    await runMigration0143_publishDomainReputationText(tx);
    const slugParams = new Set(
      queries.flatMap((q) => q.params).filter((p): p is string => typeof p === "string" && /^[a-z0-9]+(-[a-z0-9]+)+$/.test(p) && p.length < 30),
    );
    expect([...slugParams].sort()).toEqual(["domain-reputation", "domain-trust"]);
    for (const q of queries) expect(flat(q.sql)).not.toMatch(/slug (in|like|<>|!=)/i);
  });

  it("is idempotent: a re-run matches nothing and reports no change", async () => {
    const first = await runMigration0143_publishDomainReputationText(recordingTx([1, 2, 2, 0, 1]).tx);
    expect(first.rows_affected).toBe(6);
    expect(first.block).toBe("0143_publishDomainReputationText");
    const again = await runMigration0143_publishDomainReputationText(recordingTx([0, 0, 0, 0, 0]).tx);
    expect(again.rows_affected).toBe(0);
    expect(again.outcome).toContain("no change");
  });

  it("binds no Date or Buffer parameter (DEC-20260504-A bind-encoder shape)", async () => {
    const { tx, queries } = recordingTx([1, 2, 2, 1, 1]);
    await runMigration0143_publishDomainReputationText(tx);
    for (const q of queries) {
      for (const p of q.params) {
        expect(p instanceof Date).toBe(false);
        expect(Buffer.isBuffer(p)).toBe(false);
      }
    }
  });

  // Independent copy of the approved text (PR #927), so a typo in the block's
  // constants is caught even before the manifest carries it.
  it("carries the approved wording, narrowed to what the executor does", () => {
    expect(DOMAIN_REPUTATION_NEW_DATA_SOURCE).toBe(
      "DNS records (A, MX, SPF, DMARC) and the domain's HTTPS security headers, plus domain-name pattern checks; no threat-intelligence feeds or blocklists",
    );
    expect(DOMAIN_REPUTATION_LIMITATIONS.map((l) => [l.title, l.category, l.severity])).toEqual([
      ["No blocklist or threat-intelligence lookup", "accuracy", "warning"],
      ["Computed live on every call", "freshness", "info"],
    ]);
    expect(DOMAIN_TRUST_NEW_LONG_DESCRIPTION).toContain("a DNS-and-HTTPS hygiene score (no blocklist or threat-intelligence lookup)");
    expect(DOMAIN_TRUST_NEW_LONG_DESCRIPTION).not.toContain("threat intelligence feeds");
  });

  // PR #927 changed the manifest to this text. Its data_source still equals the
  // manifest. Its two limitations were superseded on 2026-11-12 by the four of
  // block 0155 (wave 4, #1025), whose test asserts manifest equality; this
  // block's rows stay as history, since a ledgered block is never edited.
  const manifestPath = resolve(import.meta.dirname, "../../../../manifests/domain-reputation.yaml");
  const manifest = yaml.load(readFileSync(manifestPath, "utf8")) as { data_source: string };
  it("sets the data_source manifests/domain-reputation.yaml carries", () => {
    expect(DOMAIN_REPUTATION_NEW_DATA_SOURCE).toBe(manifest.data_source);
  });
});
