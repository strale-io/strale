import { registerCapability, type CapabilityInput } from "./index.js";

// Job board search — Swedish listings from Arbetsförmedlingen's JobTech JobSearch
// API, published as open data under CC0 with no key or registration.
//
// Until 2026-09-11 it also queried Adzuna for other countries. Adzuna's terms
// allow only publishing its listings (with its branding), salary estimates and
// personal research, so that path was removed in the vendor-terms audit
// (docs/security/2026-09-10-vendor-terms-audit-batch-2.md). Ads can carry
// contact persons' names, emails and phone numbers; only the non-personal
// fields below are ever returned.

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
  const countryCode = String(input.country_code ?? "se").trim().toLowerCase();
  if (countryCode !== "se") {
    throw new Error(`'country_code' must be "se": this capability covers Swedish job listings only; "${countryCode}" is not covered.`);
  }

  // One source now, so its error is the answer — no fallback to hide it behind.
  const af = await searchArbetsformedlingen(query.trim(), location, remoteOnly);

  return {
    output: {
      query: query.trim(),
      location: location ?? null,
      jobs: af.jobs,
      total_results: af.total,
      sources_queried: ["arbetsformedlingen.se"],
    },
    provenance: {
      source: "arbetsformedlingen.se (JobTech JobSearch, CC0)",
      source_url: "https://data.jobtechdev.se/dataservice/jobsearch/",
      fetched_at: new Date().toISOString(),
    },
  };
});
