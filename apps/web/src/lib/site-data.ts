// The one place pages get catalogue data from. Loaded once per build.
//
//   STRALE_SITE_DATA=live (default)  read the production API (STRALE_API_BASE, default https://api.strale.io)
//   STRALE_SITE_DATA=manifests       preview from this repository's manifests; every page shows a preview banner
//
// Counts, prices, countries and eligibility are always computed from this
// data, never typed into a page (CLAUDE.md drift-prevention rules).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { loadLive } from "./load-live.ts";
import { loadPreview } from "./load-preview.ts";
import type { Capability, DataMode, ManifestExtras, SiteData, Solution, X402Item } from "./types.ts";
import { COUNTRY_BY_PREFIX, companyDataPrefix, type Country } from "../content/countries.ts";
import { jobFor, type JobId } from "../content/jobs.ts";

export const REPO_ROOT = resolve(process.cwd(), "../..");
export const API_BASE = (process.env.STRALE_API_BASE ?? "https://api.strale.io").replace(/\/$/, "");

function dataMode(): DataMode {
  const v = process.env.STRALE_SITE_DATA ?? "live";
  if (v !== "live" && v !== "manifests") throw new Error(`STRALE_SITE_DATA must be "live" or "manifests", not "${v}"`);
  return v;
}

function readManifest(slug: string, cache?: Map<string, Record<string, unknown>>): Record<string, any> | null {
  if (cache?.has(slug)) return cache.get(slug) as Record<string, any>;
  const p = resolve(REPO_ROOT, "manifests", `${slug}.yaml`);
  return existsSync(p) ? (parse(readFileSync(p, "utf8")) as Record<string, any>) : null;
}

function extras(m: Record<string, any> | null): ManifestExtras {
  return {
    output_field_reliability: m?.output_field_reliability ?? {},
    example_input: m?.test_fixtures?.known_answer?.input ?? m?.test_fixtures?.health_check_input ?? null,
    gdpr_art_22_classification: m?.gdpr_art_22_classification,
  };
}

let cached: Promise<SiteData> | null = null;

export function getSiteData(): Promise<SiteData> {
  cached ??= (async () => {
    const mode = dataMode();
    if (!existsSync(resolve(REPO_ROOT, "manifests"))) throw new Error(`Build must run from apps/web inside the strale repository (no manifests/ at ${REPO_ROOT})`);
    const base = mode === "live" ? await loadLive(API_BASE) : loadPreview(REPO_ROOT);
    const raw = "raw" in base ? (base.raw as Map<string, Record<string, unknown>>) : undefined;
    const manifests = new Map<string, ManifestExtras>();
    for (const c of base.capabilities) manifests.set(c.slug, extras(readManifest(c.slug, raw)));
    return {
      mode,
      source: mode === "live" ? API_BASE : "repository manifests",
      loaded_at: new Date().toISOString(),
      facts: base.facts,
      capabilities: [...base.capabilities].sort((a, b) => a.name.localeCompare(b.name)),
      solutions: base.solutions,
      x402: base.x402,
      trust: base.trust,
      manifests,
      limitations: base.limitations,
      solutionLimitations: base.solutionLimitations,
    };
  })();
  return cached;
}

// ---------- derived views ----------

export interface Tool extends Capability {
  job: JobId;
  x402: X402Item | null;
  free: boolean;
  country: Country | null;
}

export function tools(d: SiteData): Tool[] {
  const x402 = new Map(d.x402.capabilities.map((x) => [x.slug, x]));
  const free = new Set(d.facts.capability_counts.free_tier_slugs);
  return d.capabilities.map((c) => {
    const job = jobFor(c.slug, c.category);
    if (!job) throw new Error(`Tool ${c.slug} has category "${c.category}", which apps/web/src/content/jobs.ts does not place in a job group`);
    const prefix = companyDataPrefix(c.slug);
    return { ...c, job, x402: x402.get(c.slug) ?? null, free: free.has(c.slug), country: prefix ? COUNTRY_BY_PREFIX[prefix] ?? null : null };
  });
}

export function toolBySlug(d: SiteData): Map<string, Tool> {
  return new Map(tools(d).map((t) => [t.slug, t]));
}

export interface CountryCoverage extends Country {
  tools: Tool[];
}

/** Countries with at least one live registry tool, from the catalogue. */
export function coverage(d: SiteData): CountryCoverage[] {
  const by = new Map<string, CountryCoverage>();
  for (const t of tools(d)) {
    if (!t.country) continue;
    const entry = by.get(t.country.iso) ?? { ...t.country, tools: [] };
    entry.tools.push(t);
    by.set(t.country.iso, entry);
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function solutionsFor(d: SiteData, slug: string): Solution[] {
  return d.solutions.filter((s) => s.capabilities.includes(slug));
}
