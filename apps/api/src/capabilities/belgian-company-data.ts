import { registerCapability, type CapabilityInput } from "./index.js";
import { deriveVatBE } from "../lib/vat-derivation.js";
import {
  fetchRenderedHtml,
  htmlToText,
  extractCompanyFromText,
  extractCompanyName,
} from "./lib/browserless-extract.js";

// Belgium — KBO/BCE (Crossroads Bank for Enterprises)
// Enterprise number: 10 digits, format 0xxx.xxx.xxx
const KBO_RE = /^0?\d{3}\.?\d{3}\.?\d{3}$/;

function findKbo(input: string): string | null {
  const cleaned = input.replace(/[\s]/g, "");
  if (KBO_RE.test(cleaned)) {
    const digits = cleaned.replace(/\./g, "");
    return digits.padStart(10, "0");
  }
  const match = input.match(/0?\d{3}\.?\d{3}\.?\d{3}/);
  if (match && KBO_RE.test(match[0])) {
    return match[0].replace(/\./g, "").padStart(10, "0");
  }
  return null;
}

function formatKbo(number: string): string {
  const padded = number.padStart(10, "0");
  return `${padded.slice(0, 4)}.${padded.slice(4, 7)}.${padded.slice(7)}`;
}

// ─── CBEAPI path (free structured API, no Browserless needed) ───────────────

interface CbeAddress {
  street: string | null;
  street_number: string | null;
  box: string | null;
  post_code: string | null;
  city: string | null;
  country_code: string | null;
  full_address: string;
}

interface CbeCompany {
  cbe_number: string;
  cbe_number_formatted: string;
  denomination: string;
  abbreviation: string | null;
  commercial_name: string | null;
  denomination_with_legal_form: string;
  address: CbeAddress;
  establishments: Array<Record<string, unknown>>;
  activities: Array<Record<string, unknown>>;
  juridical_form: string | null;
  status: string | null;
  start_date: string | null;
  [key: string]: unknown;
}

async function lookupViaCbeApi(query: string, isKbo: boolean): Promise<Record<string, unknown> | null> {
  const key = process.env.CBEAPI_KEY;
  if (!key) return null;

  const url = isKbo
    ? `https://cbeapi.be/api/v1/company/${query}`
    : `https://cbeapi.be/api/v1/company/search?name=${encodeURIComponent(query)}`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) return null;

  const data = await resp.json() as Record<string, unknown>;

  let company: CbeCompany | null = null;

  if (isKbo) {
    company = (data.data ?? data) as CbeCompany;
  } else {
    const results = (data.enterprises ?? data.results ?? data.data ?? []) as CbeCompany[];
    if (Array.isArray(results) && results.length > 0) {
      company = results[0];
    }
  }

  if (!company?.cbe_number) return null;

  const addr = company.address;
  const activities = Array.isArray(company.activities) ? company.activities : [];
  const nace = activities.length > 0
    ? (activities[0] as Record<string, unknown>).nace_code ?? (activities[0] as Record<string, unknown>).code ?? null
    : null;

  return {
    company_name: company.denomination ?? company.denomination_with_legal_form,
    registration_number: company.cbe_number_formatted ?? formatKbo(company.cbe_number),
    status: company.status ?? "active",
    business_type: company.juridical_form ?? null,
    address: addr?.full_address || [addr?.street, addr?.street_number, addr?.post_code, addr?.city].filter(Boolean).join(", ") || null,
    registration_date: company.start_date ?? null,
    industry: nace ? String(nace) : null,
    directors: [],
    establishments_count: Array.isArray(company.establishments) ? company.establishments.length : 0,
    abbreviation: company.abbreviation,
    commercial_name: company.commercial_name,
  };
}

// ─── Browserless fallback (scrapes kbopub.economie.fgov.be) ─────────────────

async function lookupViaBrowserless(query: string, isKbo: boolean): Promise<Record<string, unknown>> {
  const searchUrl = isKbo
    ? `https://kbopub.economie.fgov.be/kbopub/toonondernemingps.html?ondernemingsnummer=${query}`
    : `https://kbopub.economie.fgov.be/kbopub/zoeknaamform.html?searchword=${encodeURIComponent(query)}&_oudession=true`;

  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.includes("geen onderneming") || text.includes("Geen resultaten") || text.length < 200) {
    throw new Error(`No Belgian company found matching "${query}".`);
  }

  return extractCompanyFromText(text, "Belgian", query);
}

// ─── Main executor ──────────────────────────────────────────────────────────

registerCapability("belgian-company-data", async (input: CapabilityInput) => {
  const raw = (input.enterprise_number as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'enterprise_number' or 'company_name' is required. Provide a KBO/BCE number (e.g. 0404.616.494) or company name.");
  }

  const trimmed = raw.trim();
  const kbo = findKbo(trimmed);
  const searchQuery = kbo ?? trimmed;
  const isKbo = !!kbo;

  // Primary: CBEAPI (free structured API)
  let output: Record<string, unknown> | null = null;
  let source = "cbeapi.be";

  try {
    output = await lookupViaCbeApi(searchQuery, isKbo);
  } catch {
    // CBEAPI failed — fall through to Browserless
  }

  // Fallback: Browserless scraping
  if (!output) {
    source = "kbopub.economie.fgov.be";
    if (!isKbo) {
      const name = await extractCompanyName(trimmed, "Belgian");
      output = await lookupViaBrowserless(name, false);
    } else {
      output = await lookupViaBrowserless(searchQuery, true);
    }
  }

  // Derive VAT from enterprise number
  const regNum = (output.registration_number as string) ?? kbo ?? "";
  const vat = deriveVatBE(regNum.replace(/\./g, ""));
  if (vat) output.vat_number = vat;

  return {
    output,
    provenance: {
      source,
      fetched_at: new Date().toISOString(),
    },
  };
});
