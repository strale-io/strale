import { registerCapability, type CapabilityInput } from "./index.js";
import { readJsonWithLimit } from "../lib/resource-limits.js";

// Job board search — one public-employment-service source per country, each
// chosen because its terms permit reuse in a paid service:
//
//   se  Arbetsförmedlingen, JobTech JobSearch — CC0, no key.
//   fr  France Travail, Offres d'emploi v2 — partners who accept the job-offer
//       reuse licence may reuse offers "pour tout usage et notamment être
//       rediffusées sur des sites tiers", contact data excepted (CGU, verified
//       2026-09-11). Needs FRANCE_TRAVAIL_CLIENT_ID / _SECRET.
//   us  USAJOBS (federal jobs) — reposting permitted "as long as data values
//       are not altered, USAJOBS is credited, and users are directed to
//       USAJOBS to apply"; raw bulk feeds are not (OPM's statement as quoted
//       by FedScoop; the primary text is to be confirmed at key registration,
//       see config/vendors.yaml usajobs). Needs USAJOBS_API_KEY and
//       USAJOBS_USER_AGENT (the email the key was registered to).
//
// A country whose credentials are not configured refuses rather than guesses.
// Ads carry contact persons' names, emails and phone numbers in all three
// sources; only the fields in JobResult are ever returned. Until 2026-09-11 an
// Adzuna path existed; its terms do not permit resale and it was removed
// (docs/security/2026-09-10-vendor-terms-audit-batch-2.md).

interface JobResult {
  title: string;
  company: string;
  location: string;
  salary_range: string | null;
  url: string | null;
  posted_date: string | null;
  source: string;
}

interface CountrySource {
  name: string;
  source: string;
  sourceUrl: string;
  attribution: string;
  configured: () => boolean;
  search: (query: string, location: string | undefined, remoteOnly: boolean) => Promise<{ jobs: JobResult[]; total: number }>;
}

const LIMIT = 10;

async function searchArbetsformedlingen(query: string, location: string | undefined, remoteOnly: boolean) {
  const params = new URLSearchParams({ q: query, limit: String(LIMIT) });
  if (location) params.set("municipality", location);
  if (remoteOnly) params.set("remote", "true");
  // unguarded-fetch-ok: fixed JobTech host; user input only in encoded query params
  const response = await fetch(`https://jobsearch.api.jobtechdev.se/search?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Arbetsförmedlingen API returned HTTP ${response.status}`);
  const data = await readJsonWithLimit<any>(response);
  const hits: any[] = data.hits ?? [];
  const jobs: JobResult[] = hits.map((hit: any) => ({
    title: hit.headline ?? "",
    company: hit.employer?.name ?? "",
    location: hit.workplace_address?.municipality ?? hit.workplace_address?.city ?? hit.workplace_address?.region ?? "",
    salary_range: hit.salary_description ?? hit.salary_type?.label ?? null,
    url: hit.webpage_url ?? hit.application_details?.url ?? null,
    posted_date: hit.publication_date ?? null,
    source: "arbetsformedlingen.se",
  }));
  return { jobs, total: data.total?.value ?? hits.length };
}

// ─── France Travail ─────────────────────────────────────────────────────────
const FT_TOKEN_URL = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
const FT_SEARCH_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search";
let ftToken: { value: string; expiresAt: number } | null = null;

async function franceTravailToken(): Promise<string> {
  if (ftToken && ftToken.expiresAt > Date.now() + 30_000) return ftToken.value;
  // unguarded-fetch-ok: fixed France Travail token host; body carries only our own client credentials
  const res = await fetch(FT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.FRANCE_TRAVAIL_CLIENT_ID ?? "",
      client_secret: process.env.FRANCE_TRAVAIL_CLIENT_SECRET ?? "",
      scope: "api_offresdemploiv2 o2dsoffre",
    }).toString(),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`France Travail authentication returned HTTP ${res.status}`);
  const body = await readJsonWithLimit<{ access_token?: string; expires_in?: number }>(res);
  if (!body.access_token) throw new Error("France Travail authentication returned no token");
  ftToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 600) * 1000 };
  return ftToken.value;
}

/** Test hook: forget a cached token. */
export function resetFranceTravailTokenForTests(): void { ftToken = null; }

/** Pure: France Travail location parameter from a department number or INSEE commune code. Exported for tests. */
export function franceTravailLocation(location: string | undefined): Record<string, string> {
  if (!location) return {};
  const loc = location.trim().toUpperCase();
  if (/^(\d{2,3}|2A|2B)$/.test(loc)) return { departement: loc };
  if (/^(\d{5}|2A\d{3}|2B\d{3})$/.test(loc)) return { commune: loc };
  throw new Error("'location' for France must be a department number (e.g. 75) or a 5-digit INSEE commune code.");
}

async function searchFranceTravail(query: string, location: string | undefined, remoteOnly: boolean) {
  const params = new URLSearchParams({ motsCles: query, range: `0-${LIMIT - 1}`, ...franceTravailLocation(location) });
  if (remoteOnly) params.set("modeTravail", "TELETRAVAIL");
  // unguarded-fetch-ok: fixed France Travail API host; user input only in encoded query params
  const res = await fetch(`${FT_SEARCH_URL}?${params.toString()}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${await franceTravailToken()}` },
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 204) return { jobs: [], total: 0 };
  if (res.status !== 200 && res.status !== 206) throw new Error(`France Travail API returned HTTP ${res.status}`);
  const data = await readJsonWithLimit<{ resultats?: any[] }>(res);
  const items = data.resultats ?? [];
  const total = Number((res.headers.get("Content-Range") ?? "").match(/\/(\d+)$/)?.[1] ?? items.length);
  const jobs: JobResult[] = items.map((o: any) => ({
    title: o.intitule ?? "",
    company: o.entreprise?.nom ?? "",
    location: o.lieuTravail?.libelle ?? "",
    salary_range: o.salaire?.libelle ?? null,
    url: o.id ? `https://candidat.francetravail.fr/offres/recherche/detail/${encodeURIComponent(o.id)}` : null,
    posted_date: o.dateCreation ?? null,
    source: "francetravail.fr",
  }));
  return { jobs, total };
}

// ─── USAJOBS ────────────────────────────────────────────────────────────────
/** Pure: USAJOBS pay as published — the values themselves, unaltered. Exported for tests. */
export function usajobsSalary(pay: { MinimumRange?: string; MaximumRange?: string; Description?: string; RateIntervalCode?: string } | undefined): string | null {
  if (!pay?.MinimumRange && !pay?.MaximumRange) return null;
  const range = [pay.MinimumRange, pay.MaximumRange].filter(Boolean).join("–");
  const per = pay.Description ?? pay.RateIntervalCode;
  return per ? `${range} ${per}` : range;
}

async function searchUsajobs(query: string, location: string | undefined, remoteOnly: boolean) {
  const params = new URLSearchParams({ Keyword: query, ResultsPerPage: String(LIMIT) });
  if (location) params.set("LocationName", location);
  if (remoteOnly) params.set("RemoteIndicator", "True");
  // unguarded-fetch-ok: fixed USAJOBS API host; user input only in encoded query params
  const res = await fetch(`https://data.usajobs.gov/api/search?${params.toString()}`, {
    headers: {
      Host: "data.usajobs.gov",
      "User-Agent": process.env.USAJOBS_USER_AGENT ?? "",
      "Authorization-Key": process.env.USAJOBS_API_KEY ?? "",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`USAJOBS API returned HTTP ${res.status}`);
  const data = await readJsonWithLimit<any>(res);
  const items: any[] = data.SearchResult?.SearchResultItems ?? [];
  const jobs: JobResult[] = items.map((it: any) => {
    const d = it.MatchedObjectDescriptor ?? {};
    return {
      title: d.PositionTitle ?? "",
      company: d.OrganizationName ?? "",
      location: d.PositionLocationDisplay ?? d.PositionLocation?.[0]?.LocationName ?? "",
      salary_range: usajobsSalary(d.PositionRemuneration?.[0]),
      // USAJOBS requires applicants to be sent to USAJOBS: its own posting page.
      url: d.PositionURI ?? null,
      posted_date: d.PublicationStartDate ?? null,
      source: "usajobs.gov",
    };
  });
  return { jobs, total: Number(data.SearchResult?.SearchResultCountAll ?? items.length) };
}

export const COUNTRIES: Record<string, CountrySource> = {
  se: {
    name: "Sweden", source: "arbetsformedlingen.se (JobTech JobSearch, CC0)",
    sourceUrl: "https://data.jobtechdev.se/dataservice/jobsearch/",
    attribution: "Job ads from Arbetsförmedlingen (JobTech, CC0).",
    configured: () => true, search: searchArbetsformedlingen,
  },
  fr: {
    name: "France", source: "francetravail.fr (Offres d'emploi v2)",
    sourceUrl: "https://francetravail.io/",
    attribution: "Job offers from France Travail.",
    configured: () => !!process.env.FRANCE_TRAVAIL_CLIENT_ID && !!process.env.FRANCE_TRAVAIL_CLIENT_SECRET,
    search: searchFranceTravail,
  },
  us: {
    name: "United States (federal jobs)", source: "usajobs.gov",
    sourceUrl: "https://www.usajobs.gov/",
    attribution: "Federal job announcements from USAJOBS (usajobs.gov). Apply through the USAJOBS links.",
    configured: () => !!process.env.USAJOBS_API_KEY && !!process.env.USAJOBS_USER_AGENT,
    search: searchUsajobs,
  },
};

registerCapability("job-board-search", async (input: CapabilityInput) => {
  const query = (input.query as string) ?? (input.job_title as string) ?? (input.task as string) ?? "";
  if (typeof query !== "string" || !query.trim()) {
    throw new Error("'query' or 'job_title' is required. Provide a job search query (e.g. 'TypeScript developer').");
  }
  const location = typeof input.location === "string" && input.location.trim() ? input.location.trim() : undefined;
  const remoteOnly = input.remote_only === true || input.remote_only === "true";
  const countryCode = String(input.country_code ?? "se").trim().toLowerCase();

  const country = COUNTRIES[countryCode];
  if (!country) {
    const list = Object.entries(COUNTRIES).map(([cc, c]) => `"${cc}" (${c.name})`).join(", ");
    throw new Error(`'country_code' must be one of ${list}; "${countryCode}" is not covered.`);
  }
  if (!country.configured()) throw new Error(`Job search for ${country.name} is not available yet.`);

  // One source per country, so its error is the answer — no fallback to hide it behind.
  const result = await country.search(query.trim(), location, remoteOnly);

  return {
    output: {
      query: query.trim(),
      location: location ?? null,
      country_code: countryCode,
      jobs: result.jobs,
      total_results: result.total,
      sources_queried: [result.jobs[0]?.source ?? country.source.split(" ")[0]],
      attribution: country.attribution,
    },
    provenance: { source: country.source, source_url: country.sourceUrl, fetched_at: new Date().toISOString() },
  };
});
