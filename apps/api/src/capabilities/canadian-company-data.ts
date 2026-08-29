import { registerCapability, type CapabilityInput } from "./index.js";
import {
  MAX_FETCHED_API_RESPONSE_BYTES,
  readJsonWithLimit,
  readPageHtml,
} from "../lib/resource-limits.js";
import { extractCompanyName } from "./lib/browserless-extract.js";
import { discardBody, safeFetch } from "../lib/safe-fetch.js";
import { pickByName as pickByNameShared } from "../lib/company-name-match.js";

// Canada — Corporations Canada (ISED)
//
// Numeric lookups use the OFFICIAL JSON API (no key, no rendering):
//   GET https://ised-isde.canada.ca/cc/lgcy/api/corporations/{id}.json?lang=eng
// It accepts a 7-digit corporation number OR a 9-digit business number and
// returns [englishData, null] — or, for unknown IDs, a plain array of two
// error STRINGS (not [data, null]), which is why the parser type-checks
// element 0. Verified live 2026-08-12 (corp 1007, 3000061).
//
// Named directors are NOT in the API response — only directorLimits
// (min/max). The web UI shows names, but scraping it is exactly the
// DEC-20260428-A/DEC-20260518-F question pending Petter's ruling, so
// tier_2_available stays false with an honest reason.
//
// Name-search path (rebuilt 2026-08-14, see #224 follow-up): the site's
// GET `V_SEARCH.*` query-string params (used pre-migration) do nothing —
// they render the empty search form for every query, silently producing
// all-null LLM-extracted output. The form is actually a POST:
//   <form id="verticalForm" action="/cc/lgcy/fdrlCrpSrch.html?lang=eng" method="post">
// Verified live 2026-08-14 with `corpName=Shopify`: returns 6 real rows
// including SHOPIFY INC. (corpId 4261607) and Shopify Commerce Inc.
// (corpId 4368525). A cookie jar from a prior GET is NOT required — a bare
// POST with no prior request returns byte-identical results (also verified
// live). This is a plain HTTP POST via safeFetch, not Browserless — no
// JavaScript execution needed, so no rendering step and no per-result LLM
// extraction: candidates are parsed structurally (name + corpId + status)
// and the winner's full record comes from the same official JSON API used
// by the numeric path (fetchCorporationJson), not from page text.
const CORP_API = "https://ised-isde.canada.ca/cc/lgcy/api/corporations";
const NAME_SEARCH_URL = "https://ised-isde.canada.ca/cc/lgcy/fdrlCrpSrch.html?lang=eng";

// Corporation IDs are NOT fixed-width: modern CBCA corps have 7 digits but
// older federal corps have shorter IDs (corp 1007 = Abbotsford Chamber of
// Commerce, verified live). 9 digits = business number. Any all-digit input
// up to 9 digits goes to the API; embedded numbers only count at 7-9 digits
// (shorter embedded digit runs inside free text are too ambiguous).
const REGISTRY_NUM_RE = /^\d{1,9}$/;

export function findRegistryNumber(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  if (REGISTRY_NUM_RE.test(cleaned)) return cleaned;
  const match = input.match(/\b\d{7,9}\b/);
  return match ? match[0] : null;
}

interface CorpApiRecord {
  corporationId?: string;
  act?: string;
  status?: string;
  corporationNames?: Array<{
    CorporationName?: { name?: string; nameType?: string; current?: boolean; effectiveDate?: string };
  }>;
  // The API really does spell it "adresses" (verified live) — accept both.
  adresses?: Array<{ address?: ApiAddress }>;
  addresses?: Array<{ address?: ApiAddress }>;
  directorLimits?: { minimum?: number; maximum?: number };
  businessNumbers?: { businessNumber?: string };
  annualReturns?: Array<{ annualReturn?: { yearOfFiling?: string } }>;
  activities?: Array<{ activity?: { activity?: string; date?: string } }>;
}

interface ApiAddress {
  addressLine?: string[];
  city?: string;
  postalCode?: string;
  provinceCode?: string;
  countryCode?: string;
  current?: boolean;
}

async function fetchCorporationJson(registryNumber: string): Promise<Record<string, unknown>> {
  const url = `${CORP_API}/${encodeURIComponent(registryNumber)}.json?lang=eng`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    // Nothing below reads the body (#434). Cancel it rather than leaving
    // it to pin the keep-alive connection until GC.
    await discardBody(response, "canadian-company-data: non-2xx");
    throw new Error(`Corporations Canada API returned HTTP ${response.status}`);
  }
  const data = await readJsonWithLimit<unknown[]>(
    response,
    MAX_FETCHED_API_RESPONSE_BYTES,
    "corporation_number",
  );
  const first = Array.isArray(data) ? data[0] : null;
  if (typeof first === "string") {
    // Not-found shape: ["could not find corporation …", "… est inconnu."]
    throw new Error(
      `No Canadian federal corporation found for "${registryNumber}". ` +
        `Provide a federal corporation number (older corporations have fewer than 7 digits) ` +
        `or a 9-digit business number; provincially registered businesses are not in this registry.`,
    );
  }
  if (!first || typeof first !== "object") {
    throw new Error("Corporations Canada API returned an unexpected response shape.");
  }
  const c = first as CorpApiRecord;

  const currentName = (c.corporationNames ?? [])
    .map((n) => n.CorporationName)
    .find((n) => n?.current);
  const nameHistory = (c.corporationNames ?? [])
    .map((n) => n.CorporationName)
    .filter((n): n is NonNullable<typeof n> => Boolean(n?.name) && !n?.current)
    .map((n) => n.name);

  // ?.length fallthrough (not ??): an empty "adresses" array must not shadow
  // a populated "addresses" if upstream ever fixes their key spelling.
  const addrArray = (c.adresses?.length ? c.adresses : c.addresses) ?? [];
  const addrEntry = addrArray.map((a) => a.address).find((a) => a?.current) ?? addrArray[0]?.address;
  const address = addrEntry
    ? [
        ...(addrEntry.addressLine ?? []),
        [addrEntry.city, addrEntry.provinceCode].filter(Boolean).join(" "),
        addrEntry.postalCode,
        addrEntry.countryCode,
      ]
        .filter(Boolean)
        .join(", ") || null
    : null;

  const incorporation = (c.activities ?? [])
    .map((a) => a.activity)
    .find((a) => a?.activity === "Incorporation");

  return {
    company_name: currentName?.name ?? null,
    // corporation_number kept alongside registration_number: it was the
    // pre-migration output contract's guaranteed field.
    corporation_number: c.corporationId ?? registryNumber,
    registration_number: c.corporationId ?? registryNumber,
    business_number: c.businessNumbers?.businessNumber ?? null,
    status: c.status ?? null,
    business_type: c.act ?? null,
    address,
    registration_date: incorporation?.date ?? currentName?.effectiveDate ?? null,
    name_history: nameHistory,
    director_limits: c.directorLimits ?? null,
    latest_annual_return_year:
      (c.annualReturns ?? [])
        .map((r) => r.annualReturn?.yearOfFiling)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    industry: null,
    jurisdiction: "CA",
  };
}

export interface CaNameCandidate {
  corpId: string;
  name: string;
  status: string;
}

export interface CaNameResolution {
  corpId: string;
  matchedName: string;
  matchConfidence: "exact" | "high";
}

/**
 * Each search hit renders as one `<li class="pad-md row ...">` block
 * containing the corporation-detail link (name + corpId in the query
 * string) and a "Status: ..." span. Structural parse, no LLM — verified
 * live 2026-08-14 against the `corpName=Shopify` response (6 rows).
 */
export function parseNameSearchResults(html: string): CaNameCandidate[] {
  const blocks = html.split(/<li class="pad-md row/).slice(1);
  const out: CaNameCandidate[] = [];
  for (const block of blocks) {
    const nameMatch = block.match(/<a href="fdrlCrpDtls\.html\?[^"]*corpId=(\d+)[^"]*"[^>]*>([^<]+)<\/a>/);
    if (!nameMatch) continue;
    const statusMatch = block.match(/Status:\s*([\s\S]*?)<\/span>/);
    out.push({
      corpId: nameMatch[1],
      name: nameMatch[2].trim(),
      status: statusMatch ? statusMatch[1].replace(/\s+/g, " ").trim() : "",
    });
  }
  return out;
}

/**
 * Field set matches `<form id="verticalForm" ... method="post">` on the
 * federal corporation search page exactly (verified live 2026-08-14):
 * corpName/corpNumber/busNumber/corpAct/corpProvince/corpStatus are the
 * visible filter fields, `_page`/`_pageFlowMap` are hidden state fields
 * (empty on a fresh, cookie-less request — see NAME_SEARCH_URL comment),
 * and `buttonNext=Search` is the submit button's name/value pair the
 * server's controller dispatches on.
 */
export function buildNameSearchBody(query: string): URLSearchParams {
  return new URLSearchParams({
    corpName: query,
    corpNumber: "",
    busNumber: "",
    corpAct: "",
    corpProvince: "",
    corpStatus: "",
    _page: "",
    _pageFlowMap: "",
    buttonNext: "Search",
  });
}

async function searchByName(query: string): Promise<CaNameCandidate[]> {
  const response = await safeFetch(NAME_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: buildNameSearchBody(query).toString(),
    timeoutMs: 15000,
  });
  if (!response.ok) {
    await discardBody(response, "canadian-company-data: name search non-2xx");
    throw new Error(`Corporations Canada name search returned HTTP ${response.status}.`);
  }
  const html = await readPageHtml(response, "company_name");
  const candidates = parseNameSearchResults(html);
  if (candidates.length === 0) {
    throw new Error(`No Canadian company found matching "${query}".`);
  }
  return candidates;
}

/**
 * The site search returns a page of candidates, not a single best guess —
 * same discipline as the shared pickByName (the #161 wrong-company class):
 * score every candidate by name, refuse when several distinct corporations
 * tie at the same confidence, and refuse when nothing genuinely matches
 * rather than silently returning the first row.
 *
 * Thin field-mapping wrapper: the bucket/score/refuse logic itself now lives
 * once in company-name-match.ts (consolidated 2026-08-14, was duplicated
 * four ways — see that module's pickByName doc comment). Kept as an exported
 * `pickByName(query, candidates)` two-argument function, same shape as
 * before, so canadian-company-data.test.ts and the executor below don't need
 * to change, and so the Canadian-specific wording (which differs from the
 * other three registries' wording — see the shared function's doc comment)
 * is declared exactly once, here.
 */
export function pickByName(query: string, candidates: CaNameCandidate[]): CaNameResolution {
  const resolved = pickByNameShared(query, candidates, (c) => c.name, (c) => c.corpId, {
    subjectLabel: "Canadian company",
    disambiguationHint:
      "Provide the corporation number (older corporations have fewer than 7 digits) or the 9-digit business number to disambiguate.",
    noMatchLabel: "Canadian federal registry",
    searchDescription: "The Corporations Canada site search",
    noMatchHint:
      "Provide the corporation number (older corporations have fewer than 7 digits) or the 9-digit business number for an exact lookup.",
  });
  return { corpId: resolved.id, matchedName: resolved.matchedName, matchConfidence: resolved.matchConfidence };
}

registerCapability("canadian-company-data", async (input: CapabilityInput) => {
  const raw = (input.corporation_number as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'corporation_number' or 'company_name' is required.");
  }

  const trimmed = raw.trim();
  if (trimmed.length < 2) {
    // Principle B: never reach the paid LLM/Browserless path on junk input.
    throw new Error("Input must be at least 2 characters.");
  }
  let registryNumber = findRegistryNumber(trimmed);
  let nameResolution: CaNameResolution | null = null;
  if (!registryNumber) {
    const name = await extractCompanyName(trimmed, "Canadian");
    const candidates = await searchByName(name);
    nameResolution = pickByName(name, candidates);
    registryNumber = nameResolution.corpId;
  }

  const output = await fetchCorporationJson(registryNumber);

  if (nameResolution) {
    // Surface how the name resolved so callers can gate on fuzzy resolution
    // (same pattern as uk-company-data / finnish-company-data). The winning
    // candidate's full record still comes from the official JSON API, same
    // as the numeric path — only the corpId was resolved via the search
    // page, so this is now a fully structured lookup with no per-result LLM
    // extraction step.
    output.match_confidence = nameResolution.matchConfidence;
    output.matched_registry_name = nameResolution.matchedName;
  }

  // Evidence Tier canonical aliases + honest Tier-2/UBO posture.
  {
    const o = output;
    if (o.legal_name === undefined) o.legal_name = o.company_name;
    if (o.primary_registration_id === undefined) o.primary_registration_id = o.registration_number;
    if (o.legal_form === undefined) o.legal_form = o.business_type;
    if (o.registered_address === undefined) o.registered_address = o.address;
    if (o.date_incorporated === undefined) o.date_incorporated = o.registration_date;
    o.tier_2_available = false;
    o.tier_2_available_reason =
      "Corporations Canada's JSON API exposes director count limits but not named directors; " +
      "the web UI shows names but automated extraction from it is pending a sourcing-doctrine ruling";
    o.ubo_availability = "restricted";
    o.ubo_availability_reason =
      "CBCA individuals-with-significant-control information is filed with Corporations Canada but " +
      "not exposed via the public JSON API";
  }

  // Both paths now end in the same official JSON API call for the actual
  // record (fetchCorporationJson) — the name path only used the site search
  // POST to resolve which corpId to ask the API for. source_note documents
  // that resolution step honestly without diluting acquisition_method, which
  // describes how the returned DATA was obtained.
  const recordUrl = `${CORP_API}/${encodeURIComponent(registryNumber)}.json?lang=eng`;
  return {
    output,
    provenance: {
      source: "ised-isde.canada.ca (Corporations Canada JSON API)",
      source_url: recordUrl,
      fetched_at: new Date().toISOString(),
      acquisition_method: "direct_api" as const,
      primary_source_reference: recordUrl,
      ...(nameResolution
        ? {
            source_note:
              "Corporation identified via a structured POST to the Corporations Canada federal " +
              "corporation search (name + status parsed from the results page, no LLM extraction); " +
              "the returned record itself was fetched from the official JSON API.",
          }
        : {}),
    },
  };
});
