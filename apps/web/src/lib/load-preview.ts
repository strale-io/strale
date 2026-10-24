// Preview data, for building and reviewing the site where the production API
// cannot be reached (a sandbox, a laptop offline, CI). It is assembled from
// this repository: capability manifests, the executor deactivation list and
// the platform-facts constants. It is NOT the live catalogue: visibility,
// x402 eligibility and USD prices are approximated, bundled checks and test
// results are absent. Every page built from it carries a preview banner and
// a noindex tag.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import type { Capability, Limitation, PlatformFacts, X402Catalog } from "./types.ts";
import { companyDataPrefix } from "../content/countries.ts";

/** The API's default EUR→USD rate for x402 prices (apps/api/src/lib/x402-gateway.ts). */
const DEFAULT_EUR_USD_RATE = 1.08;

function read(root: string, rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

/** Slugs the API refuses to register (apps/api/src/capabilities/auto-register.ts DEACTIVATED). */
export function deactivatedSlugs(source: string): Set<string> {
  const start = source.indexOf("const DEACTIVATED");
  const end = source.indexOf("]);", start);
  const block = source.slice(start, end);
  const slugs = new Set<string>();
  for (const m of block.matchAll(/\[\s*"([a-z0-9-]+)",/g)) slugs.add(m[1]);
  for (const m of block.matchAll(/\.\.\.\[([\s\S]*?)\]\.map/g)) for (const s of m[1].matchAll(/"([a-z0-9-]+)"/g)) slugs.add(s[1]);
  return slugs;
}

function staticFacts(root: string): PlatformFacts["static"] {
  const facts = read(root, "apps/api/src/lib/platform-facts.ts");
  const retention = read(root, "apps/api/src/lib/data-retention.ts");
  const vendorsBlock = facts.slice(facts.indexOf("vendors: {"), facts.indexOf("} as const,", facts.indexOf("vendors: {")));
  const vendors: Record<string, string> = {};
  for (const m of vendorsBlock.matchAll(/^\s*([a-z_0-9]+):\s*"([^"]+)"/gm)) vendors[m[1]] = m[2];
  const num = (re: RegExp) => Number(retention.match(re)?.[1] ?? NaN);
  return {
    vendors,
    retention_days_default: num(/TRANSACTION_RETENTION_DAYS = (\d+)/),
    pii_retention_days: num(/PII_RETENTION_DAYS = (\d+)/),
    controller: {
      legal_name: facts.match(/legal_name: "([^"]+)"/)?.[1],
      contact_email: facts.match(/contact_email: "([^"]+)"/)?.[1],
      incorporation_jurisdiction: facts.match(/incorporation_jurisdiction: "([^"]+)"/)?.[1],
    },
    tos_version_current: facts.match(/tos_version_current: "([^"]+)"/)?.[1],
  };
}

export function loadPreview(root: string) {
  const dir = resolve(root, "manifests");
  if (!existsSync(dir)) throw new Error(`Preview build needs the repository's manifests/ directory at ${dir}`);
  const off = deactivatedSlugs(read(root, "apps/api/src/capabilities/auto-register.ts"));
  const capabilities: Capability[] = [];
  const raw = new Map<string, Record<string, unknown>>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort()) {
    const m = parse(readFileSync(resolve(dir, file), "utf8")) as Record<string, any>;
    if (!m?.slug || off.has(m.slug) || m.visible === false || m.marketplace_eligible === false) continue;
    raw.set(m.slug, m);
    capabilities.push({
      slug: m.slug,
      name: m.name,
      description: String(m.description ?? "").trim(),
      category: m.category,
      price_cents: m.price_cents,
      input_schema: m.input_schema ?? null,
      output_schema: m.output_schema ?? null,
      transparency_tag: m.transparency_tag ?? null,
      geography: m.geography ?? null,
      data_source: m.data_source ?? null,
      is_free_tier: m.is_free_tier === true,
      search_tags: m.search_tags ?? [],
    });
  }
  const free = capabilities.filter((c) => c.is_free_tier).map((c) => c.slug).sort();
  const countries = [...new Set(capabilities.map((c) => companyDataPrefix(c.slug)).filter((p): p is string => !!p))].sort();
  const facts: PlatformFacts = {
    capability_counts: { active_visible: capabilities.length, active_total: capabilities.length, catalogued: raw.size, free_tier_slugs: free },
    solution_count_active: 0,
    countries: { company_data_active: countries, company_data_ever: countries },
    processing_jurisdiction: "US",
    static: staticFacts(root),
    as_of: new Date().toISOString(),
  };
  const x402: X402Catalog = {
    network: "base",
    capabilities: capabilities
      .filter((c) => c.price_cents > 0 && !c.is_free_tier)
      .map((c) => ({ slug: c.slug, name: c.name, price_usd: Math.round(c.price_cents * DEFAULT_EUR_USD_RATE * 1e4) / 1e6, method: "POST", endpoint: `https://api.strale.io/x402/${c.slug}` })),
    solutions: [],
  };
  const limitations = new Map(capabilities.map((c) => [c.slug, (raw.get(c.slug)?.limitations as Limitation[] | undefined) ?? []]));
  return { facts, capabilities, solutions: [], x402, trust: new Map(), raw, limitations, solutionLimitations: new Map() };
}
