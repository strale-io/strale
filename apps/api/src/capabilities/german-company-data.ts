import { registerCapability, type CapabilityInput } from "./index.js";

// German company data via OpenRegister (https://api.openregister.de).
// Replaces the deactivated northdata.com scraper (DEC-20260427-I) with a
// licensed Tier-2 partner-API path per DEC-20260505-H. Free tier: 50 req/mo.
//
// Inputs accepted (in priority order):
//   - company_id       OpenRegister canonical id, e.g. "DE-HRB-F1103-267645"
//   - hrb_number       Handelsregister number ("HRB 2001"), with court (Registergericht)
//   - company_name     fuzzy text — resolved via /v1/autocomplete/company
//
// Real-time fetches (?realtime=true, +10 credits per call) are intentionally
// NOT exposed — out of scope per DEC-20260506-G. OpenRegister's stored data is
// refreshed every ≤4 weeks with daily updates for financials and new
// incorporations, which is the correct cadence for the Free tier price point.

const API = "https://api.openregister.de";
const TIMEOUT_MS = 10_000;

// OpenRegister canonical id: "DE-{REGISTER_TYPE}-{COURT_CODE}-{NUMBER}".
const COMPANY_ID_RE = /^DE-(HRB|HRA|GnR|PR|VR|GsR)-[A-Z0-9]+-\d+$/i;
const HRB_RE = /^(HRB|HRA|GnR|PR|VR|GsR)\s*\d+$/i;

interface AutocompleteResult {
  company_id: string;
  name: string;
  country: string;
  register_number: string;
  register_type: string;
  register_court: string;
  active: boolean;
  legal_form: string | null;
}

interface AutocompleteResponse {
  results?: AutocompleteResult[];
}

// OpenRegister CompanyV1 actual response shape (verified against live API
// 2026-05-06 against SAP SE / DE-HRB-B1601-719915). The published OpenAPI
// summary lists field names but not their structure — three were objects
// not strings (name, purpose) and the register sub-object uses register_*
// prefixed keys, not the flat type/number/court shape suggested by the
// autocomplete result.
interface CompanyV1Name {
  name?: string | null;
  legal_form?: string | null;
  start_date?: string | null;
}
interface CompanyV1Purpose {
  purpose?: string | null;
  start_date?: string | null;
}
interface CompanyV1Register {
  company_id?: string | null;
  register_court?: string | null;
  register_number?: string | null;
  register_type?: string | null;
  start_date?: string | null;
}
interface CompanyV1Address {
  street?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  formatted_value?: string | null;
  co?: string | null;
}
interface CompanyV1Representative {
  name?: string | null;
  role?: string | null;
  type?: string | null;
  natural_person?: { first_name?: string | null; last_name?: string | null } | null;
  legal_person?: { name?: string | null } | null;
}
interface CompanyV1 {
  id: string;
  register?: CompanyV1Register | null;
  status?: string | null;
  name?: CompanyV1Name | null;
  names?: CompanyV1Name[] | null;
  address?: CompanyV1Address | null;
  purpose?: CompanyV1Purpose | null;
  capital?: { amount?: number | null; currency?: string | null } | null;
  representation?: CompanyV1Representative[] | null;
  legal_form?: string | null;
  lei?: string | null;
  incorporated_at?: string | null;
  terminated_at?: string | null;
  industry_codes?: Array<{ code?: string | null; description?: string | null }> | null;
  sources?: Array<Record<string, unknown>> | null;
}

function getApiKey(): string {
  const key = process.env.OPENREGISTER_API_KEY;
  if (!key) {
    throw new Error(
      "OPENREGISTER_API_KEY is required. Register at https://openregister.de/keys (50 free req/mo).",
    );
  }
  return key;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    Accept: "application/json",
  };
}

function classifyHttp(status: number, body: unknown): never {
  // Free-tier exhaustion or burst-rate limit. Surface as graceful unavailability —
  // the framework's circuit breaker (recordFailure in do.ts) will trip after
  // 3 consecutive failures and protect downstream callers.
  if (status === 429) {
    throw new Error(
      "capability-unavailable: OpenRegister rate limit hit (HTTP 429). " +
      "Free tier is capped at 50 requests/month and resets on the 1st. " +
      "Try again next billing cycle or upgrade per DEC-20260505-H.",
    );
  }
  if (status === 401 || status === 403) {
    throw new Error(`OpenRegister rejected the API key (HTTP ${status}).`);
  }
  if (status === 404) {
    throw new Error("OpenRegister returned 404 — company not found.");
  }
  if (status >= 500) {
    throw new Error(`OpenRegister upstream error (HTTP ${status}). Retry advised.`);
  }
  const detail = typeof body === "object" && body !== null && "message" in body
    ? String((body as { message?: unknown }).message)
    : "";
  throw new Error(
    `OpenRegister returned HTTP ${status}${detail ? `: ${detail.slice(0, 160)}` : ""}.`,
  );
}

async function autocomplete(query: string): Promise<AutocompleteResult> {
  const url = `${API}/v1/autocomplete/company?query=${encodeURIComponent(query)}`;
  const r = await fetch(url, { headers: authHeaders(), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as unknown;
    classifyHttp(r.status, body);
  }
  const data = (await r.json()) as AutocompleteResponse;
  const top = data.results?.[0];
  if (!top || !top.company_id) {
    throw new Error(`No German company found matching "${query}".`);
  }
  return top;
}

async function fetchCompany(companyId: string): Promise<CompanyV1> {
  const url = `${API}/v1/company/${encodeURIComponent(companyId)}`;
  const r = await fetch(url, { headers: authHeaders(), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as unknown;
    classifyHttp(r.status, body);
  }
  const data = (await r.json()) as CompanyV1;
  if (!data || !data.id) {
    throw new Error(`OpenRegister returned no record for ${companyId}.`);
  }
  return data;
}

function normaliseStatus(raw: string | null | undefined, terminatedAt: string | null | undefined): {
  status: "active" | "terminated" | "unknown";
  is_active: boolean | null;
} {
  if (terminatedAt) return { status: "terminated", is_active: false };
  const v = (raw ?? "").toLowerCase();
  if (v.includes("active") || v === "ok") return { status: "active", is_active: true };
  if (v.includes("liquidat") || v.includes("terminated") || v.includes("dissolved")) {
    return { status: "terminated", is_active: false };
  }
  if (!v) return { status: "unknown", is_active: null };
  return { status: "unknown", is_active: null };
}

function buildAddress(a: CompanyV1["address"]): Record<string, string | null> | null {
  if (!a) return null;
  const street = a.street?.trim() || null;
  const postal_code = a.postal_code?.trim() || null;
  const city = a.city?.trim() || null;
  const country = a.country?.trim() || "DE";
  const co_address = a.co?.trim() || null;
  if (!street && !postal_code && !city) return null;
  return { street, postal_code, city, country, co_address };
}

function repName(r: CompanyV1Representative): string | null {
  const direct = r.name?.trim();
  if (direct) return direct;
  const np = r.natural_person;
  if (np) {
    const composed = [np.first_name, np.last_name]
      .filter((s): s is string => !!s && s.trim().length > 0)
      .join(" ")
      .trim();
    if (composed) return composed;
  }
  return r.legal_person?.name?.trim() || null;
}

function buildDirectors(reps: CompanyV1["representation"]): Array<{ name: string; role: string | null }> {
  if (!reps) return [];
  return reps
    .map((r) => {
      const name = repName(r);
      if (!name) return null;
      return { name, role: r.role?.trim() || null };
    })
    .filter((x): x is { name: string; role: string | null } => x !== null);
}

function formatRegistrationNumber(reg: CompanyV1["register"]): string | null {
  if (!reg) return null;
  const type = reg.register_type?.trim();
  const num = reg.register_number?.trim();
  if (type && num) return `${type} ${num}`;
  return num ?? type ?? null;
}

function buildSources(sources: CompanyV1["sources"], fetchedAt: string): Array<Record<string, unknown>> {
  if (!Array.isArray(sources) || sources.length === 0) {
    return [{ source: "openregister", fetched_at: fetchedAt }];
  }
  return sources.map((s) => ({ ...(s ?? {}), fetched_at: fetchedAt }));
}

registerCapability("german-company-data", async (input: CapabilityInput) => {
  const companyId = (input.company_id as string)?.trim() ?? "";
  const hrbNumber = (input.hrb_number as string)?.trim() ?? "";
  const companyName = (input.company_name as string)?.trim() ?? "";
  const court = (input.court as string)?.trim() ?? "";
  const task = (input.task as string)?.trim() ?? "";

  let resolvedId = "";

  if (COMPANY_ID_RE.test(companyId)) {
    resolvedId = companyId;
  } else if (HRB_RE.test(hrbNumber)) {
    if (!court) {
      throw new Error(
        "German HRB/HRA numbers are not unique across courts. 'court' (Registergericht) is required when providing a registration number. Example: { \"hrb_number\": \"HRB 2001\", \"court\": \"Amtsgericht Landsberg a. Lech\" }",
      );
    }
    const courtName = court.replace(/^Amtsgericht\s+/i, "").trim();
    const top = await autocomplete(`${hrbNumber} ${courtName}`);
    resolvedId = top.company_id;
  } else {
    const query = companyName || hrbNumber || task;
    if (!query) {
      throw new Error(
        "'company_id', 'hrb_number' (with 'court'), or 'company_name' is required.",
      );
    }
    const top = await autocomplete(query);
    resolvedId = top.company_id;
  }

  const company = await fetchCompany(resolvedId);
  const fetchedAt = new Date().toISOString();
  const status = normaliseStatus(company.status, company.terminated_at);
  const registrationNumber = formatRegistrationNumber(company.register);

  const resolvedName = company.name?.name?.trim() || company.names?.[0]?.name?.trim() || null;
  const businessDescription = company.purpose?.purpose?.trim() || null;

  return {
    output: {
      company_name: resolvedName,
      company_id: company.id,
      registration_number: registrationNumber,
      register_type: company.register?.register_type?.trim() || null,
      court: company.register?.register_court?.trim() || null,
      country_code: "DE",
      legal_form: company.legal_form?.trim() || null,
      status: status.status,
      is_active: status.is_active,
      registered_address: buildAddress(company.address),
      business_description: businessDescription,
      industry_codes: Array.isArray(company.industry_codes)
        ? company.industry_codes
            .map((c) => ({
              code: (c?.code ?? "").trim(),
              description: (c?.description ?? "").trim() || null,
            }))
            .filter((c) => c.code)
        : [],
      directors: Array.isArray(company.representation) ? buildDirectors(company.representation) : [],
      // Capital currency passthrough; do not default to "EUR". A German
      // subsidiary in CHF or USD silently rewriting to EUR is a fabrication
      // (DEC-20260428-B).
      capital: company.capital?.amount != null
        ? { amount: company.capital.amount, currency: company.capital.currency ?? null }
        : null,
      lei: company.lei?.trim() || null,
      incorporated_at: company.incorporated_at ? company.incorporated_at.split("T")[0] : null,
      terminated_at: company.terminated_at ? company.terminated_at.split("T")[0] : null,
    },
    provenance: {
      source: "OpenRegister",
      source_url: `${API}/v1/company/${company.id}`,
      fetched_at: fetchedAt,
      sources: buildSources(company.sources, fetchedAt),
      attribution: "Source: Handelsregister / Bundesanzeiger via OpenRegister",
      acquisition_method: "direct_api",
    },
  };
});
