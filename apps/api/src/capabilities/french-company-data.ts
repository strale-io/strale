import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";
import { deriveVatFR } from "../lib/vat-derivation.js";

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

async function extractCompanyName(text: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");
  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [{ role: "user", content: `Extract the French company name from this request. Return ONLY the company name, nothing else.\n\nRequest: "${text}"` }],
  });
  const name = r.content[0].type === "text" ? r.content[0].text.trim().replace(/^["']|["']$/g, "") : "";
  if (!name) throw new Error(`Could not identify a company name from: "${text}".`);
  return name;
}

async function searchCompany(query: string): Promise<Record<string, unknown>> {
  const url = `${API}/search?q=${encodeURIComponent(query)}&page=1&per_page=1`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`French API returned HTTP ${response.status}`);
  const data = (await response.json()) as any;
  const results = data?.results;
  if (!results || results.length === 0) {
    throw new Error(`No French company found matching "${query}".`);
  }

  const c = results[0];
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

registerCapability("french-company-data", async (input: CapabilityInput) => {
  const raw = (input.siren as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'siren' or 'company_name' is required. Provide a SIREN (9 digits), SIRET (14 digits), or company name.");
  }

  const trimmed = raw.trim();
  const siren = findSiren(trimmed);
  const query = siren || await extractCompanyName(trimmed);
  const output = await searchCompany(query);

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
