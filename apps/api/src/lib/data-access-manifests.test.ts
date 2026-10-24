/**
 * Every active capability declares its data-access lane and acquisition
 * method (DEC-20261023-A). The block lives in its manifest; auto-register
 * reads it and getExecutor stamps it onto provenance (lib/data-access.ts).
 *
 * Deactivated capabilities are exempt: a capability in the rule's "never"
 * lane is switched off, not labelled.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { parseDataAccess } from "./data-access.js";
import { VENDOR_TERMS_RECORDS } from "./vendor-terms.js";
import { getDeactivatedCapabilities } from "../capabilities/auto-register.js";

const manifestsDir = resolve(import.meta.dirname, "..", "..", "..", "..", "manifests");
const manifests = readdirSync(manifestsDir)
  .filter((f) => f.endsWith(".yaml"))
  .map((f) => yaml.load(readFileSync(resolve(manifestsDir, f), "utf8")) as Record<string, unknown> & { slug: string })
  .filter((m) => m && typeof m.slug === "string");
const deactivated = getDeactivatedCapabilities();
const capabilitiesDir = resolve(import.meta.dirname, "..", "capabilities");

/** The shared fetch path that checks robots.txt and stops at a block (PR #723). */
const CHECKED_FETCH = /fetchRenderedHtml(Fresh)?\(|fetchPage\(|fetchCompanyPage\(|assertRobotsAllowed\(/;

describe("manifest data_access blocks (DEC-20261023-A)", () => {
  it("reads the catalogue", () => {
    expect(manifests.length).toBeGreaterThan(275);
  });

  it("every active manifest declares a valid data_access block", () => {
    const problems: string[] = [];
    for (const m of manifests) {
      if (deactivated.has(m.slug)) continue;
      if (m.data_access === undefined) {
        problems.push(`${m.slug}: missing data_access (add lane and acquisition_method; see lib/data-access.ts)`);
        continue;
      }
      const r = parseDataAccess(m.data_access);
      if (!r.ok) problems.push(`${m.slug}: ${r.errors.join("; ")}`);
    }
    expect(problems).toEqual([]);
  });

  it("every block present on a deactivated manifest is still valid", () => {
    const problems = manifests
      .filter((m) => deactivated.has(m.slug) && m.data_access !== undefined)
      .map((m) => ({ slug: m.slug, r: parseDataAccess(m.data_access) }))
      .filter(({ r }) => !r.ok)
      .map(({ slug }) => slug);
    expect(problems).toEqual([]);
  });

  it("names the vendor on every capability whose terms are recorded in vendor-terms.ts", () => {
    // The proposal named this gap: the SERP tools returned only {source, fetched_at}.
    const bySlug = new Map(manifests.map((m) => [m.slug, m]));
    const problems: string[] = [];
    for (const record of VENDOR_TERMS_RECORDS) {
      for (const slug of record.capabilities) {
        const m = bySlug.get(slug);
        if (!m || deactivated.has(slug)) continue;
        const r = parseDataAccess(m.data_access);
        if (!r.ok) continue; // reported above
        if (r.value.lane === "not_applicable") {
          problems.push(`${slug}: calls ${record.vendor} but declares no data access`);
        } else if (!r.value.upstream_vendor) {
          problems.push(`${slug}: calls ${record.vendor} but names no upstream_vendor`);
        }
        // Terms not recorded as permitting resale cannot back a "recorded" claim.
        if (record.resale !== "permitted" && r.value.checks === "recorded") {
          problems.push(`${slug}: checks recorded, but ${record.vendor}'s resale is ${record.resale} in vendor-terms.ts`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("claims recorded checks for a customer-directed fetch only on the checked fetch path", () => {
    const problems: string[] = [];
    for (const m of manifests) {
      if (deactivated.has(m.slug)) continue;
      const r = parseDataAccess(m.data_access);
      if (!r.ok || r.value.acquisition_method !== "customer_directed_fetch" || r.value.checks !== "recorded") continue;
      const src = readFileSync(resolve(capabilitiesDir, `${m.slug}.ts`), "utf8");
      if (!CHECKED_FETCH.test(src)) problems.push(`${m.slug}: checks recorded but never fetches through web-provider or assertRobotsAllowed`);
    }
    expect(problems).toEqual([]);
  });
});
