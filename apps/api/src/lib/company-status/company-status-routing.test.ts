import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { getDeactivatedCapabilities } from "../../capabilities/auto-register.js";
import { countriesToIso } from "../platform-facts.js";
import { mappedSlugs } from "./normalise.js";
import { COUNTRY_ROUTES, EXCLUDED_COUNTRIES, SUPPORTED_COUNTRIES, canonicalCountry } from "./routing.js";

// Production's `countries.company_data_active_iso` from GET /v1/platform/facts,
// read 2026-10-26 11:45 Europe/Stockholm. A snapshot on purpose: this test must
// not use the network. When the live list changes, a country is either routed
// or excluded with a reason; the test below fails until it is.
const PRODUCTION_COMPANY_DATA_ISO = [
  "AT", "AU", "BE", "BR", "CA", "CH", "CZ", "DE", "EE", "ES", "FI", "FR", "GB", "GR", "HR", "IE", "JP", "LV",
  "NO", "PL", "SE", "SG", "SI", "SK", "US",
];

const MANIFESTS = resolve(import.meta.dirname, "..", "..", "..", "..", "..", "manifests");

function manifest(slug: string): Record<string, any> | null {
  const f = resolve(MANIFESTS, `${slug}.yaml`);
  return existsSync(f) ? (yaml.load(readFileSync(f, "utf8")) as Record<string, any>) : null;
}

const LANE_RANK: Record<string, number> = { preferred: 0, allowed_with_checks: 1 };
const rank = (m: Record<string, any>): number => {
  const da = m.data_access;
  if (!da) return 99;
  if (da.lane === "allowed_with_checks") return da.checks === "recorded" ? 1 : 2;
  return LANE_RANK[da.lane] ?? 99;
};

const routedSlugs = (): string[] =>
  COUNTRY_ROUTES.flatMap((r) => [r.registry.slug, ...(r.insolvency?.kind === "separate" && r.insolvency.slug ? [r.insolvency.slug] : [])]);

describe("routing table vs production coverage", () => {
  it("every country in production's company_data_active_iso is routed or excluded with a reason, and nothing else is", () => {
    const covered = new Set([...SUPPORTED_COUNTRIES, ...Object.keys(EXCLUDED_COUNTRIES)]);
    expect([...covered].sort()).toEqual([...PRODUCTION_COMPANY_DATA_ISO].sort());
  });

  it("no country is both routed and excluded", () => {
    for (const iso of Object.keys(EXCLUDED_COUNTRIES)) expect(SUPPORTED_COUNTRIES).not.toContain(iso);
  });

  it("every exclusion states a reason", () => {
    for (const [iso, reason] of Object.entries(EXCLUDED_COUNTRIES)) expect(reason.length, iso).toBeGreaterThan(30);
  });

  it("has one route per country", () => {
    expect(new Set(SUPPORTED_COUNTRIES).size).toBe(SUPPORTED_COUNTRIES.length);
  });

  it("each registry slug is the company-data executor for the country it is routed under", () => {
    for (const r of COUNTRY_ROUTES) {
      const prefix = r.registry.slug.replace(/-company-data$/, "");
      expect(countriesToIso([prefix]), r.registry.slug).toEqual([r.iso]);
    }
  });
});

describe("every routed slug is live and on a lane the composite may claim", () => {
  const deactivated = getDeactivatedCapabilities();
  const own = manifest("company-status-check");

  it("the composite manifest exists and is not on x402", () => {
    expect(own).not.toBeNull();
    expect(own!.x402_enabled).not.toBe(true);
  });

  it.each(routedSlugs())("%s has a manifest, is not DEACTIVATED, and is on the preferred lane", (slug) => {
    const m = manifest(slug);
    expect(m, `manifests/${slug}.yaml`).not.toBeNull();
    expect(deactivated.has(slug), `${slug} is in DEACTIVATED`).toBe(false);
    expect(m!.is_active, `${slug} is switched off in its manifest`).not.toBe(false);
    expect(m!.data_access?.lane).toBe("preferred");
  });

  it("the composite's own lane is no stronger than the weakest routed source", () => {
    const weakest = Math.max(...routedSlugs().map((s) => rank(manifest(s)!)));
    expect(rank(own!)).toBeGreaterThanOrEqual(weakest);
  });

  it.each(COUNTRY_ROUTES.map((r) => [r.iso, r] as const))("%s: the registry input field exists in its manifest", (_iso, r) => {
    const props = Object.keys(manifest(r.registry.slug)!.input_schema?.properties ?? {});
    expect(props).toContain(r.registry.input_field);
  });

  it("no routed registry's cost class is a paid per-call vendor", () => {
    for (const slug of routedSlugs()) {
      const cc = manifest(slug)!.cost_class;
      expect(["free_unlimited", "free_quota", "paid_prepaid"], slug).toContain(cc);
      // paid_prepaid on a registry executor marks its LLM name-resolution step, which the
      // composite never reaches: it validates a registry identifier before any call.
      if (cc === "paid_prepaid") {
        expect(manifest(slug)!.input_schema?.required ?? [], slug).not.toContain("company_name");
      }
    }
  });

  it("the composite's quota cap does not exceed the smallest quota among routed registries", () => {
    const caps = COUNTRY_ROUTES.map((r) => manifest(r.registry.slug)!)
      .filter((m) => m.cost_class === "free_quota" && typeof m.quota_cap === "number")
      .map((m) => m.quota_cap as number);
    expect(own!.quota_cap).toBeLessThanOrEqual(Math.min(...caps));
  });

  it("every routed registry has status mapping rows", () => {
    const mapped = new Set(mappedSlugs());
    for (const r of COUNTRY_ROUTES) expect(mapped.has(r.registry.slug), r.registry.slug).toBe(true);
  });
});

describe("manifest wording", () => {
  const own = manifest("company-status-check")!;
  const names = new Intl.DisplayNames(["en"], { type: "region" });

  it("description is 50-160 characters and has no marketing or verdict words", () => {
    expect(own.description.length).toBeGreaterThanOrEqual(50);
    expect(own.description.length).toBeLessThanOrEqual(160);
    expect(JSON.stringify([own.description, own.limitations, own.name])).not.toMatch(/\b(trust\w*|verified|verdict|safe|safety|pass|passed|risk\w*|recommend\w*|approve\w*)\b/i);
  });

  it("the limitation that lists countries names every routed and every excluded country", () => {
    const text = (own.limitations as Array<{ title: string; text: string }>).find((l) => l.title === "Countries covered")!.text;
    for (const iso of [...SUPPORTED_COUNTRIES, ...Object.keys(EXCLUDED_COUNTRIES)]) {
      expect(text, iso).toContain(names.of(iso)!);
    }
  });
});

describe("canonicalCountry", () => {
  it.each([["se", "SE"], [" GB ", "GB"], ["UK", "GB"]])("%j -> %s", (raw, out) => {
    expect(canonicalCountry(raw)).toBe(out);
  });
  it.each([undefined, null, "", "  ", 3])("%j -> null", (raw) => {
    expect(canonicalCountry(raw)).toBeNull();
  });
});
