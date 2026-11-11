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
 * §§ 44b and 87c UrhG, and Strale sold the lookup per call (DEC-20261023-A,
 * never lane). Each assertion below fails on main before this change.
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
    expect(manifest).toMatch(/title: Withheld 2026-11-11/);
  });
});

describe("block 0153: records the reason and withholds every solution with the step", () => {
  it("is registered to run at startup, once", () => {
    expect(BLOCKS).toContain(runMigration0153_withholdGdprFineLookup);
    expect(BLOCK_RUN_POLICY.runMigration0153_withholdGdprFineLookup?.policy).toBe("once");
  });

  it("writes the capability reason only once the boot sync has cleared all three flags", async () => {
    const { tx, queries } = recordingTx([1, 1]);
    const result = await runMigration0153_withholdGdprFineLookup(tx);
    expect(queries).toHaveLength(2);
    expect(flat(queries[0].sql)).toBe(
      "UPDATE capabilities SET deactivation_reason = $1, updated_at = now() WHERE slug = $2 AND is_active = false AND visible = false AND x402_enabled = false AND deactivation_reason IS DISTINCT FROM $3",
    );
    expect(queries[0].params).toEqual([GDPR_FINE_LOOKUP_WITHHELD_REASON, "gdpr-fine-lookup", GDPR_FINE_LOOKUP_WITHHELD_REASON]);
    expect(GDPR_FINE_LOOKUP_SLUG).toBe("gdpr-fine-lookup");
    expect(result.block).toBe("0153_withholdGdprFineLookup");
    expect(result.rows_affected).toBe(2);
  });

  it("switches off, on both rails and with a deliberate reason, the solutions that still have the step while the capability stays withheld", async () => {
    const { tx, queries } = recordingTx([0, 1]);
    await runMigration0153_withholdGdprFineLookup(tx);
    expect(flat(queries[1].sql)).toBe(
      "UPDATE solutions SET is_active = false, x402_enabled = false, deactivation_reason = $1, updated_at = now() " +
        "WHERE id IN (SELECT solution_id FROM solution_steps WHERE capability_slug = $2) AND (is_active = true OR x402_enabled = true) " +
        "AND EXISTS ( SELECT 1 FROM capabilities WHERE slug = $3 AND is_active = false AND deactivation_reason = $4)",
    );
    expect(queries[1].params).toEqual([
      GDPR_FINE_LOOKUP_SOLUTION_REASON,
      "gdpr-fine-lookup",
      "gdpr-fine-lookup",
      GDPR_FINE_LOOKUP_WITHHELD_REASON,
    ]);
    // No automated sweep may switch it back on (lib/solution-activation.ts).
    expect(wasDeactivatedDeliberately(GDPR_FINE_LOOKUP_SOLUTION_REASON)).toBe(true);
  });

  it("cannot undo a relisting: it never sets a capability flag", async () => {
    const { tx, queries } = recordingTx([0, 0]);
    await runMigration0153_withholdGdprFineLookup(tx);
    const capSql = queries[0].sql.toLowerCase();
    expect(capSql.slice(capSql.indexOf(" set "), capSql.indexOf(" where "))).not.toMatch(/is_active|visible|x402_enabled/);
    expect(capSql).not.toMatch(/\bor\b/);
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
