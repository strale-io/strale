import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  GDPR_FINE_LOOKUP_SLUG,
  GDPR_FINE_LOOKUP_SOLUTION_REASON,
  GDPR_FINE_LOOKUP_WITHHELD_REASON,
  runMigration0153_withholdGdprFineLookup,
} from "../startup-migrations/blocks/0153-withhold-gdpr-fine-lookup.js";
import { BLOCKS } from "./startup-migrations.js";
import { BLOCK_RUN_POLICY } from "../startup-migrations/run-policy.js";
import type { MigrationExecutor } from "../startup-migrations/types.js";
import { getDeactivatedCapabilities } from "../capabilities/auto-register.js";
import { PROHIBITED_UPSTREAM_HOSTS, VENDOR_TERMS_RECORDS, prohibitedHostsIn } from "./vendor-terms.js";
import { getDataSourceUrl } from "./audit-helpers.js";
import { SOLUTIONS } from "../db/solution-catalogue.js";
import { wasDeactivatedDeliberately } from "./solution-activation.js";

/**
 * Petter withheld gdpr-fine-lookup on 2026-11-11: enforcementtracker.com is
 * CC BY-NC-SA 4.0 (non-commercial) with text and data mining reserved under
 * §§ 44b and 87c UrhG, and Strale sold the lookup per call, which fails
 * DEC-20261023-A's checks-lane condition for per-call reads of public sources
 * Strale chooses. Every wiring assertion below fails on main.
 *
 * The SQL assertions compare the generated text and parameters: there is no
 * Postgres-backed harness for startup-migration blocks (CLAUDE.md
 * test-harness exemption, DEC-20260504-A).
 */

const dialect = new PgDialect();
function recordingTx(counts: number[]) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const tx = {
    execute: async (q: SQL) => {
      queries.push(dialect.sqlToQuery(q));
      return { count: counts[queries.length - 1] ?? 0 };
    },
  } as unknown as MigrationExecutor;
  return { tx, queries };
}
const flat = (s: string) => s.replace(/\s+/g, " ").trim();
const repoRoot = resolve(import.meta.dirname, "../../../..");

describe("gdpr-fine-lookup is withheld (Petter, 2026-11-11)", () => {
  it("is in DEACTIVATED with the licence, the TDM reservation and the decision, so auto-register skips it", () => {
    const reason = getDeactivatedCapabilities().get("gdpr-fine-lookup");
    expect(reason, "gdpr-fine-lookup must be in DEACTIVATED").toBeDefined();
    expect(reason).toMatch(/CC BY-NC-SA|NonCommercial-ShareAlike 4\.0/);
    expect(reason).toMatch(/44b, 87c/);
    expect(reason).toContain("Petter, 2026-11-11");
    expect(reason).toContain("DEC-20261023-A");
  });

  it("cites the rule it fails precisely: the checks-lane condition, never item 6 only by analogy", () => {
    const record = VENDOR_TERMS_RECORDS.find((r) => r.hosts.includes("enforcementtracker.com"));
    for (const [where, text] of [
      ["DEACTIVATED reason", getDeactivatedCapabilities().get("gdpr-fine-lookup") ?? ""],
      ["block 0153 capability reason", GDPR_FINE_LOOKUP_WITHHELD_REASON],
      ["block 0153 solution reason", GDPR_FINE_LOOKUP_SOLUTION_REASON],
      ["vendor-terms findings", (record?.findings ?? []).join(" ")],
    ] as const) {
      expect(text, where).toMatch(/checks[- ]lane/);
      expect(text, where).not.toMatch(/is never lane|\(DEC-20261023-A, never lane\)|never lane under/);
    }
    expect(record?.vendor).toBe("CMS (GDPR Enforcement Tracker)");
  });

  it("the source host is a prohibited upstream, in both spellings the executor could use", () => {
    expect(PROHIBITED_UPSTREAM_HOSTS.get("www.enforcementtracker.com")).toBe("CC BY-NC-SA 4.0; TDM reserved under §§44b/87c UrhG");
    expect(PROHIBITED_UPSTREAM_HOSTS.get("enforcementtracker.com")).toBe("CC BY-NC-SA 4.0; TDM reserved under §§44b/87c UrhG");
    expect(prohibitedHostsIn("https://www.enforcementtracker.com/?query=Meta")).toEqual(["www.enforcementtracker.com"]);
    expect(prohibitedHostsIn("https://enforcementtracker.com/license")).toEqual(["enforcementtracker.com"]);
  });

  it("the vendor-terms record says resale is prohibited, with the licence page as evidence", () => {
    const record = VENDOR_TERMS_RECORDS.find((r) => r.hosts.includes("www.enforcementtracker.com"));
    expect(record, "no vendor-terms record for enforcementtracker.com").toBeDefined();
    expect(record!.resale).toBe("prohibited");
    expect(record!.capabilities).toEqual(["gdpr-fine-lookup"]);
    expect(record!.terms_url).toBe("https://www.enforcementtracker.com/license");
    expect(record!.findings.join(" ")).toContain("Attribution-NonCommercial-ShareAlike 4.0");
    expect(record!.findings.join(" ")).toContain("§§ 44b, 87c");
  });

  it("a new audit record no longer points at enforcementtracker.com", () => {
    expect(getDataSourceUrl("gdpr-fine-lookup")).toBeNull();
  });

  it("the manifest says it is unavailable and names the licence", () => {
    const manifest = readFileSync(resolve(repoRoot, "manifests/gdpr-fine-lookup.yaml"), "utf8");
    expect(manifest).toMatch(/^description: "Currently unavailable\. /m);
    expect(manifest).toMatch(/title: Tool is currently unavailable/);
    expect(manifest).toMatch(/licenses\s+the database for non-commercial use only/);
    // Customer-facing copy: no internal decision ids or statute citations.
    const limitation = manifest.slice(manifest.indexOf("title: Tool is currently unavailable"), manifest.indexOf("title: New fines"));
    expect(limitation).not.toMatch(/DEC-|Petter|UrhG|§/);
  });
});

describe("block 0153: records the reason and withholds every solution with the step", () => {
  it("is registered to run at startup, on every boot", () => {
    expect(BLOCKS).toContain(runMigration0153_withholdGdprFineLookup);
    // Not "once": if the DEACTIVATED boot sync fails on the shipping boot,
    // both steps match nothing and return normally, and "once" would record
    // the block as done with ai-act-assess still on sale.
    expect(BLOCK_RUN_POLICY.runMigration0153_withholdGdprFineLookup?.policy).toBe("every_boot");
  });

  it("writes the capability reason only once the boot sync has cleared all three flags, and only over no reason or a vendor: marker", async () => {
    const { tx, queries } = recordingTx([1, 1]);
    const result = await runMigration0153_withholdGdprFineLookup(tx);
    expect(queries).toHaveLength(2);
    expect(flat(queries[0].sql)).toBe(
      "UPDATE capabilities SET deactivation_reason = $1, updated_at = now() WHERE slug = $2 AND is_active = false AND visible = false AND x402_enabled = false AND (deactivation_reason IS NULL OR deactivation_reason LIKE 'vendor:%')",
    );
    expect(queries[0].params).toEqual([GDPR_FINE_LOOKUP_WITHHELD_REASON, "gdpr-fine-lookup"]);
    expect(GDPR_FINE_LOOKUP_SLUG).toBe("gdpr-fine-lookup");
    expect(result.block).toBe("0153_withholdGdprFineLookup");
    expect(result.rows_affected).toBe(2);
  });

  it("leaves a different deliberate capability reason alone, so it never rewrites one on every boot", async () => {
    // Review round 3 on #1019: "IS DISTINCT FROM <this reason>" would replace
    // any later deliberate reason (a rebuild kept dark, another decision) on
    // each boot. The guard admits only NULL or a vendor-control-tower marker.
    const { tx, queries } = recordingTx([0, 0]);
    await runMigration0153_withholdGdprFineLookup(tx);
    const capSql = flat(queries[0].sql);
    const where = capSql.slice(capSql.indexOf(" WHERE "));
    expect(where).toContain("(deactivation_reason IS NULL OR deactivation_reason LIKE 'vendor:%')");
    expect(where).not.toMatch(/IS DISTINCT FROM|deactivation_reason <>|deactivation_reason !=/);
    // The only reason bound is the one it writes, in SET; none is compared in WHERE.
    expect(queries[0].params.filter((p) => p === GDPR_FINE_LOOKUP_WITHHELD_REASON)).toHaveLength(1);
    expect(where).not.toMatch(/deactivation_reason = \$/);
    expect(GDPR_FINE_LOOKUP_WITHHELD_REASON.startsWith("vendor:")).toBe(false);
  });

  it("switches off, on both rails and with a deliberate reason, the solutions that still have the step while the capability stays withheld", async () => {
    const { tx, queries } = recordingTx([0, 1]);
    await runMigration0153_withholdGdprFineLookup(tx);
    expect(flat(queries[1].sql)).toBe(
      "UPDATE solutions SET is_active = false, x402_enabled = false, deactivation_reason = $1, updated_at = now() " +
        "WHERE id IN (SELECT solution_id FROM solution_steps WHERE capability_slug = $2) AND (is_active = true OR x402_enabled = true OR deactivation_reason LIKE 'vendor:%') " +
        "AND EXISTS ( SELECT 1 FROM capabilities WHERE slug = $3 AND is_active = false AND visible = false AND x402_enabled = false)",
    );
    expect(queries[1].params).toEqual([GDPR_FINE_LOOKUP_SOLUTION_REASON, "gdpr-fine-lookup", "gdpr-fine-lookup"]);
    // No automated sweep may switch it back on (lib/solution-activation.ts).
    expect(wasDeactivatedDeliberately(GDPR_FINE_LOOKUP_SOLUTION_REASON)).toBe(true);
  });

  it("still withholds the bundles when the capability carries an unrelated non-vendor reason step 1 leaves alone", async () => {
    // Step 2 keys on the capability being off on every surface, whatever its
    // reason: a bundle whose step cannot run must not stay on sale.
    const { tx, queries } = recordingTx([0, 1]);
    await runMigration0153_withholdGdprFineLookup(tx);
    const solSql = flat(queries[1].sql);
    const exists = solSql.slice(solSql.indexOf("EXISTS"));
    expect(exists).toContain("is_active = false AND visible = false AND x402_enabled = false");
    expect(exists).not.toMatch(/deactivation_reason/);
    expect(queries[1].params).not.toContain(GDPR_FINE_LOOKUP_WITHHELD_REASON);
  });

  it("also takes a vendor-suspended bundle, so the vendor control tower cannot restore it to sale", async () => {
    // vendor-control-tower suspends a solution with a `vendor:` reason (both
    // rails off) and later restores its previous rails only while that exact
    // marker is still there. Matching on the marker and overwriting it with
    // this block's reason turns that restore into a no-op.
    const { tx, queries } = recordingTx([0, 1]);
    await runMigration0153_withholdGdprFineLookup(tx);
    const where = flat(queries[1].sql).slice(flat(queries[1].sql).indexOf(" WHERE "));
    expect(where).toContain("(is_active = true OR x402_enabled = true OR deactivation_reason LIKE 'vendor:%')");
    expect(GDPR_FINE_LOOKUP_SOLUTION_REASON.startsWith("vendor:")).toBe(false);
  });

  it("cannot undo a relisting: it never sets a capability flag, and both steps need all three flags false", async () => {
    const { tx, queries } = recordingTx([0, 0]);
    await runMigration0153_withholdGdprFineLookup(tx);
    const capSql = flat(queries[0].sql).toLowerCase();
    expect(capSql.slice(capSql.indexOf(" set "), capSql.indexOf(" where "))).not.toMatch(/is_active|visible|x402_enabled/);
    // Every flag condition is ANDed at the top level; the only OR is inside the reason guard.
    expect(capSql).toContain("and is_active = false and visible = false and x402_enabled = false and (deactivation_reason is null or deactivation_reason like 'vendor:%')");
    expect(capSql.match(/\bor\b/g)).toHaveLength(1);
    const solSql = flat(queries[1].sql).toLowerCase();
    expect(solSql.slice(solSql.indexOf("exists"))).toContain("is_active = false and visible = false and x402_enabled = false");
  });

  it("is a no-op on a second run and binds no Date or Buffer", async () => {
    const { tx, queries } = recordingTx([0, 0]);
    const result = await runMigration0153_withholdGdprFineLookup(tx);
    for (const q of queries) {
      for (const p of q.params) {
        expect(p instanceof Date).toBe(false);
        expect(Buffer.isBuffer(p)).toBe(false);
      }
    }
    expect(result.rows_affected).toBe(0);
    expect(result.outcome).toMatch(/no change/);
  });

  it("covers every catalogue solution that has the step (ai-act-assess today)", () => {
    const withStep = SOLUTIONS.filter((s) => s.steps.some((st) => st.capabilitySlug === "gdpr-fine-lookup")).map((s) => s.slug);
    // The block matches on the step, not on a slug list, so a new bundle is
    // covered too; this pins what the catalogue holds today.
    expect(withStep).toEqual(["ai-act-assess"]);
  });
});
