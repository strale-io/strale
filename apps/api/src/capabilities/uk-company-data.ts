import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";

// UK VAT validation is handled by vat-validate.ts (which routes GB → HMRC v2),
// not by this Identity capability. Companies House (the source for this
// capability) does not return VAT data. See DEC-20260513-F + the Active Vendor
// Stack page row split (2026-05-13) for the post-Brexit routing rationale.

// UK Companies House API — free but requires API key
// Register at https://developer.company-information.service.gov.uk/
const API = "https://api.company-information.service.gov.uk";

// UK company number: typically 8 digits, may have SC/NI/OC prefix
const COMPANY_NUMBER_RE = /^(SC|NI|OC|SO|NC|R|IP|SP|RS|NO|NP)?\d{6,8}$/i;

function findCompanyNumber(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "").toUpperCase();
  if (COMPANY_NUMBER_RE.test(cleaned)) return cleaned.padStart(8, "0");
  const match = input.match(/\d{6,8}/);
  return match ? match[0].padStart(8, "0") : null;
}

function getApiKey(): string {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) {
    throw new Error("COMPANIES_HOUSE_API_KEY is required. Register for free at https://developer.company-information.service.gov.uk/");
  }
  return key;
}

async function extractCompanyName(text: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");
  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [{ role: "user", content: `Extract the UK/British company name from this request. Return ONLY the company name, nothing else.\n\nRequest: "${text}"` }],
  });
  const name = r.content[0].type === "text" ? r.content[0].text.trim().replace(/^["']|["']$/g, "") : "";
  if (!name) throw new Error(`Could not identify a company name from: "${text}".`);
  return name;
}

async function searchCompany(name: string): Promise<string> {
  const key = getApiKey();
  const url = `${API}/search/companies?q=${encodeURIComponent(name)}&items_per_page=1`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(key + ":").toString("base64")}`,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Companies House search returned HTTP ${response.status}`);
  const data = (await response.json()) as any;
  const items = data?.items;
  if (!items || items.length === 0) {
    throw new Error(`No UK company found matching "${name}".`);
  }
  return items[0].company_number;
}

async function fetchOfficers(companyNumber: string): Promise<Array<{ name: string; role: string; start_date: string | null }>> {
  const key = getApiKey();
  const url = `${API}/company/${companyNumber}/officers?items_per_page=100`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(key + ":").toString("base64")}`,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Companies House officers returned HTTP ${response.status}`);
  const data = (await response.json()) as any;
  const items: any[] = Array.isArray(data?.items) ? data.items : [];
  return items
    .filter((o) => !o.resigned_on)
    .map((o) => ({
      name: o.name ?? "",
      role: o.officer_role ?? "",
      start_date: o.appointed_on ?? null,
    }));
}

async function fetchCompany(companyNumber: string): Promise<Record<string, unknown>> {
  const key = getApiKey();
  const url = `${API}/company/${companyNumber}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(key + ":").toString("base64")}`,
    },
    signal: AbortSignal.timeout(10000),
  });

  if (response.status === 404) {
    throw new Error(`UK company with number ${companyNumber} not found.`);
  }
  if (!response.ok) throw new Error(`Companies House returned HTTP ${response.status}`);
  const c = (await response.json()) as any;

  const addr = c.registered_office_address || {};
  const address = [
    addr.address_line_1,
    addr.address_line_2,
    addr.locality,
    addr.postal_code,
    addr.country,
  ].filter(Boolean).join(", ");

  const statusMap: Record<string, string> = {
    active: "active",
    dissolved: "dissolved",
    liquidation: "in_liquidation",
    receivership: "receivership",
    "converted-closed": "closed",
    "voluntary-arrangement": "voluntary_arrangement",
    "insolvency-proceedings": "insolvency",
    administration: "administration",
    open: "active",
    closed: "closed",
  };

  return {
    company_name: c.company_name || "",
    company_number: c.company_number || companyNumber,
    business_type: c.type || null,
    jurisdiction: c.jurisdiction || null,
    address,
    incorporation_date: c.date_of_creation || null,
    dissolution_date: c.date_of_cessation || null,
    status: statusMap[c.company_status] || c.company_status || "unknown",
    sic_codes: c.sic_codes || [],
    has_charges: c.has_charges || false,
  };
}

registerCapability("uk-company-data", async (input: CapabilityInput) => {
  const raw = (input.company_number as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'company_number' or 'company_name' is required. Provide a UK Companies House number (8 digits) or company name.");
  }

  const trimmed = raw.trim();
  let companyNumber = findCompanyNumber(trimmed);

  if (!companyNumber) {
    const name = await extractCompanyName(trimmed);
    companyNumber = await searchCompany(name);
  }

  const [output, officers] = await Promise.all([
    fetchCompany(companyNumber),
    fetchOfficers(companyNumber),
  ]);

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
    o.legal_representatives = officers;
    o.tier_2_available = true;
    o.tier_2_available_reason = "Legal representatives extracted from UK Companies House Officers register.";
    o.ubo_availability = "available";
    o.ubo_availability_reason = "Beneficial ownership data available via UK PSC register.";
  }

  return {
    output,
    provenance: {
      source: "api.company-information.service.gov.uk",
      fetched_at: new Date().toISOString(),
    },
  };
});
