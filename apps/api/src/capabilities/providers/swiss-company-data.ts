/**
 * DataProvider chain for swiss-company-data.
 *
 * Sole provider: Zefix PublicREST API (zefix.admin.ch/ZefixPublicREST)
 *   - Free government API, no rate limits defined
 *   - Requires HTTP Basic Auth: ZEFIX_USERNAME + ZEFIX_PASSWORD
 *   - Attribution required: "Data from Zefix, Federal Office of Justice, Switzerland"
 *
 * The northdata.com Browserless fallback was removed under DEC-20260427-I
 * (commercial KYB-aggregator scraping ban).
 */

import { registerChain } from "../../lib/data-provider.js";
import { classifyNameMatch } from "../../lib/company-name-match.js";

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

// Zefix's `legalForm` is a structured object; the canonical short name
// used in Swiss company correspondence is the German form ("AG", "GmbH",
// "Sàrl", "SA"). Prefer .de, then .en as a fallback so non-Swiss callers
// still get a meaningful string.
export function extractLegalFormShort(legalForm: unknown): string | null {
  if (!legalForm || typeof legalForm !== "object") return null;
  const shortName = (legalForm as { shortName?: Record<string, unknown> }).shortName;
  if (!shortName || typeof shortName !== "object") return null;
  return (shortName.de as string) ?? (shortName.en as string) ?? null;
}

export function extractLegalFormId(legalForm: unknown): number | null {
  if (!legalForm || typeof legalForm !== "object") return null;
  const id = (legalForm as { id?: unknown }).id;
  return typeof id === "number" ? id : null;
}

export function parseCompany(company: Record<string, unknown>): Record<string, unknown> {
  const address = company.address as Record<string, unknown> | undefined;
  // Zefix returns `legalSeat` as a STRING (the municipality name, e.g.
  // "Basel"), NOT as a nested object — the prior parser treated it as an
  // object and silently produced `null` for canton/municipality. The
  // canonical canton code (2 letters, e.g. "BS") lives at the company's
  // top level, not under legalSeat.
  const legalSeatString = typeof company.legalSeat === "string" ? company.legalSeat : null;

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
    legal_form: extractLegalFormShort(company.legalForm),
    legal_form_id: extractLegalFormId(company.legalForm),
    status: (company.status as string) ?? null,
    canton: (company.canton as string) ?? null,
    municipality: legalSeatString,
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
          // Name search.
          //
          // MUST be POST. Zefix's /company/search accepts a JSON body and
          // returns 405 Method Not Allowed for GET — which is exactly what
          // production returned for {"uid": "Swisscom"} before this fix, twice.
          // The 405 was surfaced raw to the caller as "Zefix API error: HTTP
          // 405", which reads like an outage rather than our bug.
          const res = await fetch(`${ZEFIX_API}/company/search`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ name: raw, languageKey: "en", maxEntries: 20 }),
            signal: AbortSignal.timeout(10000),
          });
          if (!res.ok) {
            throw new Error(`Zefix API error: HTTP ${res.status} for name "${raw}"`);
          }
          const data = await res.json();
          const candidates: Array<Record<string, unknown>> = Array.isArray(data) ? data : [data];

          // Score candidates rather than trusting the first. Zefix's search is
          // fuzzy, and a name query that lands on a different legal entity is
          // undetectable by the caller — the same failure class fixed in
          // finnish/norwegian-company-data.
          let best: Record<string, unknown> | null = null;
          for (const cand of candidates) {
            const nm = cand?.name;
            if (typeof nm !== "string" || !nm) continue;
            const { match_confidence } = classifyNameMatch(raw, nm);
            if (match_confidence === "exact") { best = cand; break; }
            if (match_confidence === "high" && !best) best = cand;
          }
          if (!best) {
            // Two distinct failures, and conflating them sends the caller the
            // wrong way. Zefix matches diacritics LITERALLY and does no folding
            // of its own: "Nestle" returns 0 results while "Nestlé" returns 15
            // including Nestlé AG. So an empty result set usually means the
            // accent is missing, not that the company is absent.
            if (candidates.length === 0) {
              throw new Error(
                `Zefix returned no companies for "${raw}". Its name search matches accented ` +
                  `characters literally — try the exact registered spelling (e.g. "Nestlé" rather ` +
                  `than "Nestle"), or provide the UID (CHE-xxx.xxx.xxx) for an exact lookup.`,
              );
            }
            const closest = candidates
              .slice(0, 3)
              .map((c) => c?.name)
              .filter((n): n is string => typeof n === "string")
              .join(", ");
            throw new Error(
              `No confident Swiss registry match for "${raw}". Zefix's name search is fuzzy and ` +
                `returned only unrelated entities${closest ? ` (closest: ${closest})` : ""}. ` +
                `Provide the UID (CHE-xxx.xxx.xxx) for an exact lookup.`,
            );
          }
          company = best;
        }

        if (!company) {
          // Zefix answers an unknown-but-well-formed UID with 200 [] rather
          // than 404, so this is the not-found path for exact lookups. Say so
          // plainly: three production calls for CHE-105.805.977 landed here,
          // and "no company found" alone does not tell the caller whether the
          // identifier is wrong or the register is incomplete.
          throw new Error(
            `No Swiss company found for "${raw}". The identifier is well-formed but is not in ` +
              `Zefix — it may belong to a deregistered entity, or be a typo. Search by ` +
              `company_name instead if you are unsure of the UID.`,
          );
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
  ],
});
