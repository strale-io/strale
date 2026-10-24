// Derived views for the company and compliance data pages (SITE-STRUCTURE pages 5-6).
// Everything here is computed from the catalogue; the only editorial inputs are
// the slug-to-country map (content/countries.ts) and the screening/ownership slugs below.
import type { SiteData, Solution } from "./types.ts";
import { coverage, tools as allTools, type CountryCoverage, type Tool } from "./site-data.ts";

/**
 * Fields a tool actually returns: those its manifest marks as always or usually
 * present (recorded from live output by the onboarding pipeline). Schema
 * properties and examples are not used, because some carry stale template keys.
 * Fields that only describe availability ("ubo_availability", "*_reason",
 * "*_limits") are not data and are dropped.
 */
export function returnedFields(t: Tool, reliability: Record<string, string>): string[] {
  const keys = Object.entries(reliability).filter(([, r]) => r === "guaranteed" || r === "common").map(([k]) => k);
  const fields = keys.length ? keys : Object.keys(t.output_schema?.properties ?? {});
  return fields.filter((f) => !/(_availability|_available|_reason|_limits?|_note|_notes)$/.test(f));
}

/** What a register tool's answer contains, in words, from returnedFields(). */
export function returns(t: Tool, reliability: Record<string, string>): string[] {
  const f = returnedFields(t, reliability);
  const has = (re: RegExp) => f.some((x) => re.test(x));
  const out = ["Name and number"];
  if (has(/^(status|company_status|legal_status|registration_status)$/)) out.push("Status");
  if (has(/address/)) out.push("Address");
  else if (has(/^(state|postcode|postal_code)$/)) out.push("State and postcode");
  if (has(/^(directors|officers|board_members|board|legal_representatives|management|signatories|representatives)$/)) out.push("Officers");
  if (has(/^(beneficial_owners|persons_with_significant_control|psc|shareholders|owners|ubos?)$/)) out.push("Ownership");
  return out;
}

/** Generic free-text fields many tools accept alongside their real identifiers. */
const GENERIC_INPUTS = new Set(["task", "query", "name", "input", "text", "company"]);
/** Register identifiers written in capitals ("VAT number", "CVR number"). */
const ACRONYMS = new Set(["vat", "oib", "ico", "cik", "ein", "abn", "acn", "kvk", "krs", "siren", "siret", "cvr", "lei", "gemi", "nipc", "uid", "cro", "nif", "cif", "cnpj", "uen", "kbo", "id", "hrb", "afm"]);

/**
 * What a registry tool accepts, in words: "registration number or company name".
 * Required fields are all needed ("and"); with none required, any one will do ("or").
 * Generic free-text aliases are left out when a specific identifier exists.
 */
export function accepts(t: Tool): string {
  const props = t.input_schema?.properties ?? {};
  const keys = Object.keys(props).filter((k) => props[k]?.type !== "boolean");
  const req = (t.input_schema?.required ?? []).filter((k) => keys.includes(k));
  const alts = keys.filter((k) => !req.includes(k) && !GENERIC_INPUTS.has(k));
  const word = (k: string) => k.split("_").map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w)).join(" ");
  const join = (xs: string[], conj: string) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${conj} ${xs[xs.length - 1]}`);
  if (req.length && alts.length) return `${join(req.map(word), "and")}, plus ${join(alts.map(word), "or")}`;
  if (req.length) return join(req.map(word), "and");
  if (alts.length) return join(alts.map(word), "or");
  return join(keys.map(word), "or") || "—";
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

export interface BundleEntry { kind: BundleKind; solution: Solution; hasRegistryStep: boolean; hasAiSummary: boolean; steps: number }
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
      const entry: BundleEntry = { kind, solution: s, hasRegistryStep: steps.some((x) => /-company-data(-|$)/.test(x)), hasAiSummary: steps.includes("risk-narrative-generate"), steps: steps.length };
      out.set(iso, [...(out.get(iso) ?? []), entry]);
    }
  }
  return out;
}

export function countryRows(d: SiteData): CountryRow[] {
  const b = bundlesByCountry(d);
  return coverage(d).map((c) => ({ ...c, bundles: b.get(c.iso) ?? [] }));
}

/** Bundled checks for countries that have no company-records tool in the catalogue (the Denmark case). */
export function bundlesWithoutRegister(d: SiteData): { iso: string; bundles: BundleEntry[] }[] {
  const covered = new Set(coverage(d).map((c) => c.iso));
  return [...bundlesByCountry(d)].filter(([iso]) => !covered.has(iso)).map(([iso, bundles]) => ({ iso, bundles })).sort((a, b) => a.iso.localeCompare(b.iso));
}

export function screeningTools(d: SiteData): Tool[] {
  const all = allTools(d);
  return SCREENING.concat(OWNERSHIP).map((s) => all.find((t) => t.slug === s)).filter((t): t is Tool => !!t);
}
