import { registerCapability, type CapabilityInput } from "./index.js";

// Job board search — combines Arbetsförmedlingen (Swedish PES) and Adzuna (multi-country)
// Both free APIs; Adzuna requires ADZUNA_APP_ID + ADZUNA_APP_KEY env vars (skipped if missing)

interface JobResult {
  title: string;
  company: string;
  location: string;
  salary_range: string | null;
  url: string | null;
  posted_date: string | null;
  source: string;
}

async function searchArbetsformedlingen(
  query: string,
  location?: string,
  remoteOnly?: boolean,
): Promise<{ jobs: JobResult[]; total: number }> {
  const params = new URLSearchParams({
    q: query,
    limit: "10",
  });
  if (location) params.set("municipality", location);
  if (remoteOnly) params.set("remote", "true");

  const url = `https://jobsearch.api.jobtechdev.se/search?${params.toString()}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Arbetsförmedlingen API returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as any;
  const hits: any[] = data.hits ?? [];
  const total: number = data.total?.value ?? hits.length;

  const jobs: JobResult[] = hits.map((hit: any) => ({
    title: hit.headline ?? "",
    company: hit.employer?.name ?? "",
    location:
      hit.workplace_address?.municipality ??
      hit.workplace_address?.city ??
      hit.workplace_address?.region ??
      "",
    salary_range: hit.salary_description ?? hit.salary_type?.label ?? null,
    url: hit.webpage_url ?? hit.application_details?.url ?? null,
    posted_date: hit.publication_date ?? null,
    source: "arbetsformedlingen.se",
  }));

  return { jobs, total };
}

async function searchAdzuna(
  query: string,
  countryCode: string,
  location?: string,
): Promise<{ jobs: JobResult[]; total: number }> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) {
    return { jobs: [], total: 0 };
  }

  // Adzuna uses 2-letter country code in path (lowercase)
  const cc = countryCode.toLowerCase();
  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    what: query,
    results_per_page: "10",
  });
  if (location) params.set("where", location);

  const url = `https://api.adzuna.com/v1/api/jobs/${cc}/search/1?${params.toString()}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    // Non-fatal: skip Adzuna if API call fails
    return { jobs: [], total: 0 };
  }

  const data = (await response.json()) as any;
  const results: any[] = data.results ?? [];
  const total: number = data.count ?? results.length;

  const jobs: JobResult[] = results.map((r: any) => ({
    title: r.title ?? "",
    company: r.company?.display_name ?? "",
    location: r.location?.display_name ?? "",
    salary_range:
      r.salary_min != null && r.salary_max != null
        ? `${r.salary_min}–${r.salary_max}`
        : r.salary_is_predicted === "1"
          ? `~${r.salary_min ?? r.salary_max} (estimated)`
          : null,
    url: r.redirect_url ?? null,
    posted_date: r.created ?? null,
    source: "adzuna.com",
  }));

  return { jobs, total };
}

registerCapability("job-board-search", async (input: CapabilityInput) => {
  const query =
    (input.query as string) ??
    (input.job_title as string) ??
    (input.task as string) ??
    "";
  if (typeof query !== "string" || !query.trim()) {
    throw new Error(
      "'query' or 'job_title' is required. Provide a job search query (e.g. 'TypeScript developer').",
    );
  }

  const location = (input.location as string) ?? undefined;
  const remoteOnly = input.remote_only === true || input.remote_only === "true";
  const countryCode = ((input.country_code as string) ?? "se").toLowerCase();

  const sourcesQueried: string[] = [];
  let allJobs: JobResult[] = [];
  let totalResults = 0;

  // Query Arbetsförmedlingen (always available, no key needed)
  try {
    const af = await searchArbetsformedlingen(query.trim(), location, remoteOnly);
    allJobs = allJobs.concat(af.jobs);
    totalResults += af.total;
    sourcesQueried.push("arbetsformedlingen.se");
  } catch {
    // Non-fatal — continue with other sources
  }

  // Query Adzuna (requires env vars)
  try {
    const az = await searchAdzuna(query.trim(), countryCode, location);
    if (az.jobs.length > 0) {
      allJobs = allJobs.concat(az.jobs);
      totalResults += az.total;
      sourcesQueried.push("adzuna.com");
    }
  } catch {
    // Non-fatal
  }

  if (allJobs.length === 0 && sourcesQueried.length === 0) {
    throw new Error(
      `No job search results found for "${query.trim()}". Both Arbetsförmedlingen and Adzuna returned no results.`,
    );
  }

  return {
    output: {
      query: query.trim(),
      location: location ?? null,
      jobs: allJobs,
      total_results: totalResults,
      sources_queried: sourcesQueried,
    },
    provenance: {
      source: sourcesQueried.join(", ") || "job-board-search",
      fetched_at: new Date().toISOString(),
    },
  };
});
