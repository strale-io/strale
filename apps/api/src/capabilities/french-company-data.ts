import { registerCapability, type CapabilityInput } from "./index.js";
import { deriveVatFR } from "../lib/vat-derivation.js";
import { classifyNameMatch } from "../lib/company-name-match.js";
import { extractCompanyName } from "./lib/browserless-extract.js";

// French company data via recherche-entreprises.api.gouv.fr — FREE, no auth
const API = "https://recherche-entreprises.api.gouv.fr";

// SIREN: 9 digits; SIRET: 14 digits
const SIREN_RE = /^\d{9}$/;
const SIRET_RE = /^\d{14}$/;

// Cap directors at 50. Typical major French entities have 15-20 directors;
// the prior cap of 3 was empirically too aggressive (audit:
// apps/api/docs/fr-directors-truncation-2026-05-15.md). 50 covers the long
// tail without pathological payload growth, preserving directors_truncated /
// total_directors honesty for state entities, mutuelles, etc.
const DIRECTORS_CAP = 50;

function findSiren(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  if (SIREN_RE.test(cleaned)) return cleaned;
  if (SIRET_RE.test(cleaned)) return cleaned.slice(0, 9);
  const match = input.match(/\d{9}/);
  return match && SIREN_RE.test(match[0]) ? match[0] : null;
}


async function fetchResults(query: string, perPage: number): Promise<any[]> {
  const url = `${API}/search?q=${encodeURIComponent(query)}&page=1&per_page=${perPage}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`French API returned HTTP ${response.status}`);
  const data = (await response.json()) as any;
  return Array.isArray(data?.results) ? data.results : [];
}

function shapeCompany(c: any): Record<string, unknown> {
  const siege = c.siege || {};

  // company_name and siren: null instead of "" when missing — empty string
  // implies "we got a value, it was empty" rather than "the source omitted
  // the field" (DEC-20260428-B).
  // Directors: cap at DIRECTORS_CAP (50). directors_truncated / total_directors
  // preserve honest disclosure for the rare 50+ case.
  const allDirectors = Array.isArray(c.dirigeants) ? c.dirigeants : [];
  const directors = allDirectors.slice(0, DIRECTORS_CAP).map((d: any) =>
    `${d.prenoms || ""} ${d.nom || ""}`.trim() + (d.qualite ? ` (${d.qualite})` : ""),
  );

  return {
    company_name: c.nom_complet || c.nom_raison_sociale || null,
    siren: c.siren || null,
    siret: siege.siret || null,
    business_type: c.nature_juridique || null,
    address: siege.adresse || siege.geo_adresse || null,
    city: siege.libelle_commune || null,
    postal_code: siege.code_postal || null,
    activity_code: c.activite_principale || siege.activite_principale || null,
    creation_date: c.date_creation || null,
    employee_range: c.tranche_effectif_salarie || null,
    status: c.etat_administratif === "A" ? "active" : c.etat_administratif === "C" ? "closed" : c.etat_administratif || "unknown",
    vat_number: c.siren ? deriveVatFR(c.siren) : null,
    directors,
    directors_truncated: allDirectors.length > DIRECTORS_CAP,
    total_directors: allDirectors.length,
  };
}

/** Identifier path — SIREN/SIRET is an exact key, so the single hit is authoritative. Unchanged behaviour. */
async function lookupBySiren(siren: string): Promise<Record<string, unknown>> {
  const results = await fetchResults(siren, 1);
  if (results.length === 0) {
    throw new Error(`No French company found matching "${siren}".`);
  }
  return shapeCompany(results[0]);
}

export interface FrNameResolution {
  company: any;
  matchConfidence: "exact" | "high";
}

/**
 * Name path: recherche-entreprises.api.gouv.fr's `/search` does its own
 * relevance scoring, but that relevance is not identity — searching "Total"
 * returns the small SAS literally named TOTAL ahead of any oil-major
 * subsidiary, and a generic query can surface an unrelated entity with a
 * partially-matching name. Taking results[0] unconditionally hands the
 * caller a different legal entity with no signal that it did (the #161
 * wrong-company class already fixed for NO/FI/EE/DE/CH). Score every
 * candidate in the page (max per_page = 25, API-enforced) and refuse when
 * nothing genuinely matches, same discipline as the sibling registries.
 */
export function pickByName(query: string, results: any[]): FrNameResolution {
  const exact = new Map<string, any>();
  const high = new Map<string, any>();
  for (const c of results) {
    const name = c?.nom_complet || c?.nom_raison_sociale;
    const siren = c?.siren;
    if (typeof name !== "string" || !name || !siren) continue;
    const { match_confidence } = classifyNameMatch(query, name);
    if (match_confidence === "exact" && !exact.has(siren)) exact.set(siren, c);
    else if (match_confidence === "high" && !high.has(siren)) high.set(siren, c);
  }

  const pickUnambiguous = (bucket: Map<string, any>, label: "exact" | "high"): FrNameResolution | null => {
    if (bucket.size === 0) return null;
    if (bucket.size === 1) {
      return { company: bucket.values().next().value!, matchConfidence: label };
    }
    const listing = [...bucket.values()]
      .slice(0, 5)
      .map((c) => `${c.nom_complet || c.nom_raison_sociale} (${c.siren})`)
      .join("; ");
    throw new Error(
      `Ambiguous French company name "${query}": ${bucket.size} distinct registered ` +
        `entities are ${label === "exact" ? "exact" : "close"} matches — ${listing}. ` +
        `Provide the SIREN (9 digits) or SIRET (14 digits) to disambiguate.`,
    );
  };

  const winner = pickUnambiguous(exact, "exact") ?? pickUnambiguous(high, "high");
  if (winner) return winner;

  const closest = results
    .slice(0, 3)
    .map((c) => c?.nom_complet || c?.nom_raison_sociale)
    .filter(Boolean)
    .join(", ");
  throw new Error(
    `No confident French registry match for "${query}". recherche-entreprises.api.gouv.fr's search is ` +
      `fuzzy and returned only unrelated entities${closest ? ` (closest: ${closest})` : ""}. ` +
      `Provide the SIREN (9 digits) or SIRET (14 digits) for an exact lookup.`,
  );
}

async function lookupByName(query: string): Promise<{ output: Record<string, unknown>; matchConfidence: "exact" | "high" }> {
  const results = await fetchResults(query, 25);
  if (results.length === 0) {
    throw new Error(`No French company found matching "${query}".`);
  }
  const resolved = pickByName(query, results);
  return { output: shapeCompany(resolved.company), matchConfidence: resolved.matchConfidence };
}

registerCapability("french-company-data", async (input: CapabilityInput) => {
  const raw = (input.siren as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'siren' or 'company_name' is required. Provide a SIREN (9 digits), SIRET (14 digits), or company name.");
  }

  const trimmed = raw.trim();
  const siren = findSiren(trimmed);
  let output: Record<string, unknown>;
  if (siren) {
    output = await lookupBySiren(siren);
  } else {
    const query = await extractCompanyName(trimmed, "French");
    const resolved = await lookupByName(query);
    output = resolved.output;
    output.match_confidence = resolved.matchConfidence;
  }

  // Evidence Tier framework labels + Tier 1 canonical aliases (DEC-20260518-A).
  // Resolves alias keys at runtime; only sets a canonical if not already present.
  {
    const o = output as Record<string, unknown>;
    if (o.legal_name === undefined) o.legal_name = (o.company_name ?? o.name);
    if (o.primary_registration_id === undefined) o.primary_registration_id = (o.company_number ?? o.registration_number ?? o.uen ?? o.fn_number ?? o.ico ?? o.krs_number ?? o.org_number ?? o.cnpj ?? o.reg_number);
    if (o.status === undefined) {
    if (typeof o.company_status === "string") o.status = o.company_status;
    else if (o.is_active === true || o.active === true) o.status = "active";
    else if (o.is_active === false || o.active === false) o.status = "inactive";
  }
    if (o.legal_form === undefined) o.legal_form = (o.business_type ?? o.company_type ?? o.entity_type ?? o.legal_form_code ?? o.legal_form_id);
    if (o.registered_address === undefined) o.registered_address = (o.address ?? o.office_address);
    if (o.date_incorporated === undefined) o.date_incorporated = (o.incorporation_date ?? o.registered_date ?? o.registration_date ?? o.founded ?? o.uen_issue_date ?? o.registered_at);
    if (o.legal_representatives === undefined) o.legal_representatives = o.directors;
    o.tier_2_available = true;
    o.tier_2_available_reason = "Legal representatives extracted from INPI Registre national des entreprises (RNE) via recherche-entreprises.api.gouv.fr.";
    o.ubo_availability = "restricted";
    o.ubo_availability_reason = "RBE (Registre des bénéficiaires effectifs) access restricted post-CJEU 2022";
  }

  return {
    output,
    provenance: {
      source: "recherche-entreprises.api.gouv.fr",
      fetched_at: new Date().toISOString(),
    },
  };
});
