/**
 * DataProvider chain for swiss-company-data.
 *
 * Primary: Zefix PublicREST API (zefix.admin.ch/ZefixPublicREST)
 *   - Free government API, no rate limits defined
 *   - Requires HTTP Basic Auth: ZEFIX_USERNAME + ZEFIX_PASSWORD
 *   - Attribution required: "Data from Zefix, Federal Office of Justice, Switzerland"
 *
 * Fallback: Existing Browserless scraper (registered executor)
 */

import { registerChain } from "../../lib/data-provider.js";
import { getDirectExecutor } from "../index.js";

const ZEFIX_API = "https://www.zefix.admin.ch/ZefixPublicREST/api/v1";

// Swiss UID: CHE-xxx.xxx.xxx (with or without dashes/dots)
const UID_RE = /CHE[- ]?\d{3}\.?\d{3}\.?\d{3}/i;
// EHRAID: numeric, typically 5-7 digits
const EHRAID_RE = /^\d{5,7}$/;

function getBasicAuth(): string {
  const username = process.env.ZEFIX_USERNAME;
  const password = process.env.ZEFIX_PASSWORD;
  if (!username || !password) {
    throw new Error(
      "ZEFIX_USERNAME and ZEFIX_PASSWORD are required. Register at https://www.zefix.admin.ch/ZefixPublicREST/",
    );
  }
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function normalizeUid(raw: string): string {
  // Normalize to CHE123456789 (no dashes/dots)
  return raw.replace(/[- .]/g, "").toUpperCase();
}

function parseCompany(company: Record<string, unknown>): Record<string, unknown> {
  const legalSeat = company.legalSeat as Record<string, unknown> | undefined;
  const address = company.address as Record<string, unknown> | undefined;

  // Build address string
  let addressStr: string | null = null;
  if (address) {
    const parts = [
      address.street,
      address.houseNumber,
      [address.swissZipCode, address.city].filter(Boolean).join(" "),
    ].filter(Boolean);
    addressStr = parts.join(", ") || null;
  }

  return {
    company_name: (company.name as string) ?? null,
    uid: (company.uid as string) ?? null,
    ehraid: (company.ehraid as number) ?? null,
    ch_id: (company.chid as number) ?? (company.chId as number) ?? null,
    legal_form: (company.legalForm as string) ?? null,
    legal_form_id: (company.legalFormId as number) ?? null,
    status: (company.status as string) ?? null,
    canton: legalSeat
      ? (legalSeat.canton as string) ?? null
      : (company.canton as string) ?? null,
    municipality: legalSeat
      ? (legalSeat.municipalityName as string) ?? null
      : (company.municipality as string) ?? null,
    address: addressStr,
    purpose: (company.purpose as string) ?? (company.purposeTranslations as any)?.en ?? null,
    registration_date: (company.sogcDate as string) ?? (company.registrationDate as string) ?? null,
    deletion_date: (company.deletionDate as string) ?? null,
    data_source: "Zefix, Federal Office of Justice, Switzerland",
    data_source_url: "https://www.zefix.admin.ch/",
    data_attribution: "Data from Zefix, Federal Office of Justice, Switzerland",
  };
}

registerChain({
  capabilitySlug: "swiss-company-data",
  providers: [
    {
      id: "zefix-public-rest",
      name: "Zefix PublicREST API (Federal Office of Justice)",
      type: "api",
      requiredEnvVars: ["ZEFIX_USERNAME", "ZEFIX_PASSWORD"],
      requiredServices: [],
      expectedLatencyMs: 800,
      fetch: async (input) => {
        const auth = getBasicAuth();
        const raw = String(
          input.uid ?? input.company_name ?? input.name ?? input.task ?? "",
        ).trim();
        if (!raw) {
          throw new Error(
            "'uid' or 'company_name' is required. Provide a Swiss UID (CHE-xxx.xxx.xxx), EHRAID, or company name.",
          );
        }

        const headers: Record<string, string> = {
          Accept: "application/json",
          Authorization: auth,
        };

        let company: Record<string, unknown> | null = null;

        // Route by input type
        const uidMatch = raw.match(UID_RE);
        if (uidMatch) {
          // UID lookup
          const uid = normalizeUid(uidMatch[0]);
          const res = await fetch(`${ZEFIX_API}/company/uid/${uid}`, {
            headers,
            signal: AbortSignal.timeout(10000),
          });
          if (!res.ok) {
            throw new Error(`Zefix API error: HTTP ${res.status} for UID ${uid}`);
          }
          const data = await res.json();
          company = Array.isArray(data) ? data[0] : data;
        } else if (EHRAID_RE.test(raw)) {
          // EHRAID lookup
          const res = await fetch(`${ZEFIX_API}/company/ehraid/${raw}`, {
            headers,
            signal: AbortSignal.timeout(10000),
          });
          if (!res.ok) {
            throw new Error(`Zefix API error: HTTP ${res.status} for EHRAID ${raw}`);
          }
          const data = await res.json();
          company = Array.isArray(data) ? data[0] : data;
        } else {
          // Name search
          const res = await fetch(
            `${ZEFIX_API}/company/search?name=${encodeURIComponent(raw)}&languageKey=en&maxEntries=1`,
            { headers, signal: AbortSignal.timeout(10000) },
          );
          if (!res.ok) {
            throw new Error(`Zefix API error: HTTP ${res.status} for name "${raw}"`);
          }
          const data = await res.json();
          company = Array.isArray(data) ? data[0] : data;
        }

        if (!company) {
          throw new Error(`No Swiss company found for "${raw}"`);
        }

        return {
          output: parseCompany(company),
          provenance: {
            source: "zefix.admin.ch",
            fetched_at: new Date().toISOString(),
            data_attribution: "Data from Zefix, Federal Office of Justice, Switzerland",
          },
        };
      },
    },
    {
      id: "browserless-zefix",
      name: "Browserless scrape of Zefix (fallback)",
      type: "scraping",
      requiredServices: ["browserless"],
      fetch: async (input) => {
        const executor = getDirectExecutor("swiss-company-data");
        if (!executor) throw new Error("No executor for swiss-company-data");
        return executor(input);
      },
    },
  ],
});
