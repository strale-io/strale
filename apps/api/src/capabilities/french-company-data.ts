import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";
import { deriveVatFR } from "../lib/vat-derivation.js";

// French company data via recherche-entreprises.api.gouv.fr — FREE, no auth
const API = "https://recherche-entreprises.api.gouv.fr";

// SIREN: 9 digits; SIRET: 14 digits
const SIREN_RE = /^\d{9}$/;
const SIRET_RE = /^\d{14}$/;

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

  return {
    company_name: c.nom_complet || c.nom_raison_sociale || "",
    siren: c.siren || "",
    siret: siege.siret || null,
    business_type: c.nature_juridique || null,
    address: siege.adresse || siege.geo_adresse || null,
    city: siege.libelle_commune || null,
    postal_code: siege.code_postal || null,
    activity_code: c.activite_principale || siege.activite_principale || null,
    creation_date: c.date_creation || null,
    employee_range: c.tranche_effectif_salarie || null,
    status: c.etat_administratif === "A" ? "active" : c.etat_administratif === "C" ? "closed" : c.etat_administratif || "unknown",
    vat_number: deriveVatFR(c.siren || ""),
    directors: (c.dirigeants || []).slice(0, 3).map((d: any) =>
      `${d.prenoms || ""} ${d.nom || ""}`.trim() + (d.qualite ? ` (${d.qualite})` : ""),
    ),
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

  return {
    output,
    provenance: {
      source: "recherche-entreprises.api.gouv.fr",
      fetched_at: new Date().toISOString(),
    },
  };
});
