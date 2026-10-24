// Derived views for the company and compliance data pages (SITE-STRUCTURE pages 5-6).
// Everything here is computed from the catalogue; the only editorial inputs are
// the slug-to-country map (content/countries.ts) and the screening/ownership slugs below.
import type { SiteData, Solution } from "./types.ts";
import { coverage, tools as allTools, type CountryCoverage, type Tool } from "./site-data.ts";

/** What a registry tool's answer can contain, read from its output schema field names. */
export function returns(t: Tool): string[] {
  const fields = [...Object.keys(t.output_schema?.properties ?? {}), ...Object.keys(t.output_schema?.example ?? {})].join(" ").toLowerCase();
  const out = ["Name and number"];
  if (/\bstatus\b|status_|_status/.test(fields)) out.push("Status");
  if (/address|postcode|postal/.test(fields)) out.push("Address");
  if (/director|officer|board|legal_representative|management|signator/.test(fields)) out.push("Officers");
  if (/owner|ubo|psc|shareholder|beneficial/.test(fields)) out.push("Ownership");
  return out;
}

/** Generic free-text fields many tools accept alongside their real identifiers. */
const GENERIC_INPUTS = new Set(["task", "query", "name", "input", "text"]);
/** Register identifiers written in capitals ("VAT number", "CVR number"). */
const ACRONYMS = new Set(["vat", "oib", "ico", "cik", "ein", "abn", "acn", "kvk", "krs", "siren", "siret", "cvr", "lei", "gemi", "nipc", "uid", "cro", "nif", "cif", "cnpj", "uen", "kbo", "id"]);

/**
 * What a registry tool accepts, in words: "registration number or company name".
 * Required fields are all needed ("and"); with none required, any one will do ("or").
 * Generic free-text aliases are left out when a specific identifier exists.
 */
export function accepts(t: Tool): string {
  const keys = Object.keys(t.input_schema?.properties ?? {});
  const req = (t.input_schema?.required ?? []).filter((k) => keys.includes(k));
  const specific = keys.filter((k) => !GENERIC_INPUTS.has(k));
  const shown = req.length ? req : specific.length ? specific : keys;
  const words = shown.map((k) => k.split("_").map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w)).join(" "));
  if (words.length <= 1) return words[0] ?? "—";
  return `${words.slice(0, -1).join(", ")} ${req.length ? "and" : "or"} ${words[words.length - 1]}`;
}

export const SCREENING = ["sanctions-check", "pep-check", "adverse-media-check"];
export const OWNERSHIP = ["beneficial-ownership-lookup", "gleif-l2-ubo-lookup", "gleif-l2-children-lookup"];

export type BundleKind = "company-check" | "full-check" | "invoice-check";
const BUNDLE_PATTERN: [RegExp, BundleKind][] = [
  [/^kyb-essentials-([a-z]{2})$/, "company-check"],
  [/^kyb-complete-([a-z]{2})$/, "full-check"],
  [/^invoice-verify-([a-z]{2})$/, "invoice-check"],
];
export const BUNDLE_LABEL: Record<BundleKind, string> = { "company-check": "Company check", "full-check": "Full check", "invoice-check": "Invoice-issuer check" };

export interface BundleEntry { kind: BundleKind; solution: Solution; hasRegistryStep: boolean }
export interface CountryRow extends CountryCoverage { bundles: BundleEntry[] }

/** Bundled checks per country ISO code. Bundle slugs use lower-case country codes, with "uk" for GB. */
export function bundlesByCountry(d: SiteData): Map<string, BundleEntry[]> {
  const out = new Map<string, BundleEntry[]>();
  for (const s of d.solutions) {
    for (const [re, kind] of BUNDLE_PATTERN) {
      const m = s.slug.match(re);
      if (!m) continue;
      const iso = m[1] === "uk" ? "GB" : m[1].toUpperCase();
      const steps = s.detail?.steps.map((x) => x.capability_slug) ?? s.capabilities;
      const entry: BundleEntry = { kind, solution: s, hasRegistryStep: steps.some((x) => /-company-data(-|$)/.test(x)) };
      out.set(iso, [...(out.get(iso) ?? []), entry]);
    }
  }
  return out;
}

export function countryRows(d: SiteData): CountryRow[] {
  const b = bundlesByCountry(d);
  return coverage(d).map((c) => ({ ...c, bundles: b.get(c.iso) ?? [] }));
}

export function screeningTools(d: SiteData): Tool[] {
  const all = allTools(d);
  return SCREENING.concat(OWNERSHIP).map((s) => all.find((t) => t.slug === s)).filter((t): t is Tool => !!t);
}
