import { registerCapability, type CapabilityInput } from "./index.js";
import { deriveVatBE } from "../lib/vat-derivation.js";

/**
 * Belgian company data via the CBEAPI.be vendor wrapper of KBO/BCE
 * (Crossroads Bank for Enterprises).
 *
 * acquisition_method: vendor_aggregation. CBEAPI is a third-party wrapper
 * over the Belgian KBO open data; underlying records are public-record
 * statutory data published by FPS Economy.
 *
 * The Browserless fallback against kbopub.economie.fgov.be was removed
 * 2026-04-29 per DEC-20260428-A Tier 1: Strale itself never operates
 * scrapers, even as a fallback.
 *
 * Long-term migration target: direct ingest of FPS Economy's KBO Open
 * Data (registered re-user agreement; daily SFTP CSV). Tracked
 * separately — see handoff/_general/from-code/2026-04-29-be-kbo-open-data-scaffold.md.
 */

// Belgium — KBO/BCE enterprise number: 10 digits, formatted 0xxx.xxx.xxx
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

async function lookupViaCbeApi(
  query: string,
  isKbo: boolean,
): Promise<Record<string, unknown>> {
  const key = process.env.CBEAPI_KEY;
  if (!key) {
    throw new Error(
      "Belgian company data lookup is currently unavailable: CBEAPI_KEY is not configured.",
    );
  }

  const url = isKbo
    ? `https://cbeapi.be/api/v1/company/${query}`
    : `https://cbeapi.be/api/v1/company/search?name=${encodeURIComponent(query)}`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    throw new Error(`CBEAPI returned HTTP ${resp.status}.`);
  }

  const data = (await resp.json()) as Record<string, unknown>;

  let company: CbeCompany | null = null;

  if (isKbo) {
    company = (data.data ?? data) as CbeCompany;
  } else {
    const results = (data.enterprises ?? data.results ?? data.data ?? []) as CbeCompany[];
    if (Array.isArray(results) && results.length > 0) {
      company = results[0];
    }
  }

  if (!company?.cbe_number) {
    throw new Error(`No Belgian company found matching "${query}".`);
  }

  const addr = company.address;
  const activities = Array.isArray(company.activities) ? company.activities : [];
  const nace =
    activities.length > 0
      ? (activities[0] as Record<string, unknown>).nace_code ??
        (activities[0] as Record<string, unknown>).code ??
        null
      : null;

  return {
    company_name: company.denomination ?? company.denomination_with_legal_form,
    registration_number: company.cbe_number_formatted ?? formatKbo(company.cbe_number),
    status: company.status ?? "active",
    business_type: company.juridical_form ?? null,
    address:
      addr?.full_address ||
      [addr?.street, addr?.street_number, addr?.post_code, addr?.city]
        .filter(Boolean)
        .join(", ") ||
      null,
    registration_date: company.start_date ?? null,
    industry: nace ? String(nace) : null,
    directors: [],
    establishments_count: Array.isArray(company.establishments)
      ? company.establishments.length
      : 0,
    abbreviation: company.abbreviation,
    commercial_name: company.commercial_name,
  };
}

registerCapability("belgian-company-data", async (input: CapabilityInput) => {
  const raw =
    (input.enterprise_number as string) ??
    (input.company_name as string) ??
    (input.task as string) ??
    "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(
      "'enterprise_number' or 'company_name' is required. Provide a KBO/BCE number (e.g. 0404.616.494) or company name.",
    );
  }

  const trimmed = raw.trim();
  const kbo = findKbo(trimmed);
  const searchQuery = kbo ?? trimmed;
  const isKbo = !!kbo;

  const output = await lookupViaCbeApi(searchQuery, isKbo);

  // Derive VAT from enterprise number (BE VAT == BE + KBO digits).
  const regNum = (output.registration_number as string) ?? kbo ?? "";
  const vat = deriveVatBE(regNum.replace(/\./g, ""));
  if (vat) output.vat_number = vat;

  const cbeNumber = String(output.registration_number ?? "").replace(/\./g, "");
  const primarySourceUrl = cbeNumber
    ? `https://kbopub.economie.fgov.be/kbopub/toonondernemingps.html?ondernemingsnummer=${cbeNumber}`
    : "https://kbopub.economie.fgov.be/kbopub/zoekofficielenummerform.html";

  return {
    output,
    provenance: {
      source: "cbeapi.be",
      source_url: "https://cbeapi.be/",
      fetched_at: new Date().toISOString(),
      acquisition_method: "vendor_aggregation" as const,
      upstream_vendor: "cbeapi.be",
      primary_source_reference: primarySourceUrl,
      attribution:
        "Data sourced from CBEAPI.be, a third-party JSON wrapper of the Belgian KBO/BCE Crossroads Bank for Enterprises. Underlying records are public-register data published by FPS Economy under Belgian re-use law.",
      source_note:
        "Tier-2 vendor-mediated public records (DEC-20260428-A). Migration to first-party ingest of FPS Economy KBO Open Data is queued.",
    },
  };
});
