import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";
import { deriveVatFI } from "../lib/vat-derivation.js";
import { firstString } from "./lib/input-aliases.js";
import { classifyNameMatch } from "../lib/company-name-match.js";

// PRH (Finnish Patent and Registration Office) open data API — new v3 endpoint
const PRH_API = "https://avoindata.prh.fi/opendata-ytj-api/v3/companies";

// Finnish Business ID: 7 digits + hyphen + check digit (e.g. 0112038-9)
const BIS_RE = /^(\d{7})-?(\d)$/;

function isBusinessId(input: string): string | null {
  const cleaned = input.replace(/\s/g, "");
  const match = cleaned.match(BIS_RE);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

function findBusinessId(input: string): string | null {
  const match = input.match(/\d{7}-?\d/);
  if (!match) return null;
  return isBusinessId(match[0]);
}

async function extractCompanyName(naturalLanguage: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: `Extract the Finnish company name from this request. Return ONLY the company name, nothing else.\n\nRequest: "${naturalLanguage}"`,
      },
    ],
  });

  const name =
    response.content[0].type === "text"
      ? response.content[0].text.trim().replace(/^["']|["']$/g, "")
      : "";
  if (!name) throw new Error(`Could not identify a company name from: "${naturalLanguage}".`);
  return name;
}

async function prhNameQuery(name: string): Promise<any[]> {
  // PRH v3 ignores maxResults — a broad query returns a full page (~60
  // records, 200+KB). The generous timeout is deliberate: this exact call
  // timed out twice from Railway US East at 10s (once cut mid-body as
  // "Unterminated string in JSON"), which is what broke the name path in
  // production on 2026-08-12.
  const url = `${PRH_API}?name=${encodeURIComponent(name)}&totalResults=false`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`PRH API search returned HTTP ${response.status}`);
  const data = (await response.json()) as any;
  return (data?.companies ?? []) as any[];
}

export interface PrhNameResolution {
  businessId: string;
  matchedName: string;
  matchConfidence: "exact" | "high";
}

export function scorePool(
  searched: string,
  pool: Map<string, any>,
): { exact: Map<string, string>; high: Map<string, string> } {
  // Each company carries every name it has ever held. Names with an endDate
  // are dead — matching on them resolves defunct entities: "Rovio" used to
  // return Combiholding Oy via "E E Rovio Oy" (ended 2020) and "Nordea"
  // returned a branch deregistered in 2018. Only current names identify a
  // company; a query that matches nothing current is refused, not guessed.
  const exact = new Map<string, string>();
  const high = new Map<string, string>();
  for (const [id, c] of pool) {
    for (const n of (c.names ?? []) as Array<{ name?: string; endDate?: string | null }>) {
      if (!n?.name || n.endDate) continue;
      const { match_confidence } = classifyNameMatch(searched, n.name);
      if (match_confidence === "exact") {
        exact.set(id, n.name);
        high.delete(id);
      } else if (match_confidence === "high" && !exact.has(id)) {
        high.set(id, n.name);
      }
    }
  }
  return { exact, high };
}

export function pickUnambiguous(
  searched: string,
  bucket: Map<string, string>,
  label: "exact" | "high",
): PrhNameResolution {
  if (bucket.size === 1) {
    const [businessId, matchedName] = bucket.entries().next().value!;
    return { businessId, matchedName, matchConfidence: label };
  }
  const listing = [...bucket.entries()]
    .slice(0, 5)
    .map(([id, n]) => `${n} (${id})`)
    .join("; ");
  throw new Error(
    `Ambiguous Finnish company name "${searched}": ${bucket.size} distinct registered ` +
      `entities are ${label === "exact" ? "exact" : "close"} matches — ${listing}. ` +
      `Provide the Business ID directly (e.g. 0112038-9) to disambiguate.`,
  );
}

async function searchPrh(name: string): Promise<PrhNameResolution> {
  // PRH's `name=` parameter is a FUZZY substring search across every name a
  // company has ever held, ordered by business ID and paginated at ~60
  // records. Page one is stable and does contain the major brands ("Nokia" →
  // Nokia Oyj at index ~36 of 63), so a single scored pass over it resolves
  // well-known names — but result order carries no relevance signal, and a
  // company outside page one is simply not found (refused with guidance).
  //
  // Returning a confidently-wrong company from a KYB lookup is worse than
  // returning nothing (the caller cannot detect it), so acceptance is
  // scored — exact wins, unique high is the floor, ties are refused — using
  // the same classifier us-company-data uses for SEC EDGAR.
  const pool = new Map<string, any>();
  for (const c of await prhNameQuery(name)) {
    const id = c.businessId?.value ?? c.businessId;
    if (id && !pool.has(id)) pool.set(id, c);
  }
  if (pool.size === 0) {
    throw new Error(`No Finnish company found matching "${name}".`);
  }

  const { exact, high } = scorePool(name, pool);
  if (exact.size > 0) return pickUnambiguous(name, exact, "exact");
  if (high.size > 0) return pickUnambiguous(name, high, "high");

  const sample = [...pool.values()]
    .slice(0, 3)
    .map((c: any) => (c.names ?? [])[0]?.name)
    .filter(Boolean)
    .join(", ");
  throw new Error(
    `No confident Finnish registry match for "${name}". PRH's name search is fuzzy and ` +
      `returned only unrelated entities${sample ? ` (closest: ${sample})` : ""}. ` +
      `Provide the Business ID directly (e.g. 0112038-9) for an exact lookup.`,
  );
}

async function fetchCompany(businessId: string): Promise<Record<string, unknown>> {
  const url = `${PRH_API}?businessId=${encodeURIComponent(businessId)}&totalResults=false&maxResults=1`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`PRH API returned HTTP ${response.status}`);
  const data = (await response.json()) as any;
  const companies = data?.companies;
  if (!companies || companies.length === 0) {
    throw new Error(`Finnish company with business ID ${businessId} not found.`);
  }
  const company = companies[0];

  // Get the latest name (type "1" = trade name, no endDate = current)
  const names = company.names || [];
  const currentName =
    names.find((n: any) => n.type === "1" && !n.endDate) ||
    names.find((n: any) => !n.endDate) ||
    names[0];

  // Get address (type 1 = visiting address)
  const addresses = company.addresses || [];
  const currentAddr =
    addresses.find((a: any) => a.type === 1 && !a.endDate) || addresses[0];
  let address: string | null = null;
  if (currentAddr) {
    const parts = [
      currentAddr.street,
      currentAddr.buildingNumber,
    ].filter(Boolean);
    const postPart = currentAddr.postOffices?.[0];
    if (currentAddr.postCode || postPart?.city) {
      parts.push([currentAddr.postCode, postPart?.city].filter(Boolean).join(" "));
    }
    address = parts.join(", ") || null;
  }

  // Company form
  const forms = company.companyForms || [];
  const currentForm = forms.find((f: any) => !f.endDate) || forms[0];
  const formDesc =
    currentForm?.descriptions?.find((d: any) => d.languageCode === "3")?.description ||
    currentForm?.descriptions?.[0]?.description ||
    "";

  // Main business line
  const mainLine = company.mainBusinessLine;
  const industryCode = mainLine?.type || null;
  const industryDesc =
    mainLine?.descriptions?.find((d: any) => d.languageCode === "3")?.description ||
    mainLine?.descriptions?.[0]?.description ||
    null;

  // Status from companySituations and tradeRegisterStatus
  const situations = company.companySituations || [];
  const hasLiquidation = situations.some((s: any) => !s.endDate);
  const trStatus = company.tradeRegisterStatus;

  return {
    company_name: currentName?.name || "",
    business_id: company.businessId?.value || businessId,
    business_type: formDesc,
    industry_code: industryCode,
    industry_description: industryDesc,
    address,
    registration_date: company.registrationDate || company.businessId?.registrationDate || null,
    website: company.website?.url || null,
    status: hasLiquidation ? "liquidation" : trStatus === "1" ? "active" : "inactive",
    vat_number: deriveVatFI(company.businessId?.value || businessId),
  };
}

registerCapability("finnish-company-data", async (input: CapabilityInput) => {
  // See the note in danish-company-data.ts: the error promised company-name
  // support and the name path existed, but the field was never read. Two calls
  // for "Nokia" were lost in the 90 days to 2026-08-09.
  const rawInput = firstString(
    input,
    "business_id", "org_number",
    "company_name", "name", "query", "task",
  );
  if (!rawInput) {
    throw new Error(
      "A Finnish company identifier or name is required. Provide 'business_id' (e.g. 0112038-9) " +
        "or 'company_name'. Aliases accepted: org_number, name, query, task.",
    );
  }

  const trimmed = rawInput.trim();
  let businessId = isBusinessId(trimmed) ?? findBusinessId(trimmed);
  let nameResolution: PrhNameResolution | null = null;

  if (!businessId) {
    // company_name/name are DECLARED to be the company name — search them
    // literally. The LLM extraction step is only for free-text query/task
    // inputs ("look up Nokia in Finland"), which keeps the declared-name path
    // deterministic and free of per-call Anthropic cost.
    const declaredName = firstString(input, "company_name", "name").trim();
    const companyName = declaredName || (await extractCompanyName(trimmed));
    nameResolution = await searchPrh(companyName);
    businessId = nameResolution.businessId;
  }

  const output = await fetchCompany(businessId);
  if (nameResolution) {
    // Surface how the name resolved so callers can gate on fuzzy resolution
    // (same pattern as us-company-data's match_confidence).
    output.match_confidence = nameResolution.matchConfidence;
    output.matched_registry_name = nameResolution.matchedName;
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
    o.tier_2_available = false;
    o.tier_2_available_reason = "handler does not currently extract legal representatives from upstream registry; follow-up extraction task tracked";
    o.ubo_availability = "restricted";
    o.ubo_availability_reason = "PRH UBO data access restricted to AML-obliged entities";
  }

  return {
    output,
    provenance: {
      source: "avoindata.prh.fi",
      source_url: `${PRH_API}?businessId=${encodeURIComponent(businessId)}`,
      fetched_at: new Date().toISOString(),
      acquisition_method: "direct_api" as const,
      primary_source_reference: `${PRH_API}?businessId=${encodeURIComponent(businessId)}`,
      license: "CC BY 4.0",
      license_url: "https://creativecommons.org/licenses/by/4.0/",
      attribution: "Lähde: Patentti- ja rekisterihallitus (PRH)",
      source_note:
        "PRH/YTJ open data is published under Creative Commons Attribution 4.0 (CC BY 4.0) per avoindata.suomi.fi. Designated as an EU High-Value Dataset under Reg. (EU) 2023/138.",
    },
  };
});
