import { registerCapability, type CapabilityInput } from "./index.js";
import { readJsonWithLimit } from "../lib/resource-limits.js";
import { readBoundedInt } from "../lib/capability-input.js";

// OpenAlex — open catalogue of scholarly works (free, no key). The `mailto`
// parameter opts into the "polite pool", which OpenAlex documents as faster
// and more reliable than anonymous traffic. Verified live 2026-09-04.
const API = "https://api.openalex.org/works";
const CONTACT = "support@strale.io";
const USER_AGENT = `Strale/1.0 (${CONTACT})`;
// OpenAlex ships the abstract as an inverted index; we only ever return a
// bounded reconstruction, so the response is also asked to omit everything
// this capability does not surface.
const SELECT = [
  "id", "doi", "title", "publication_year", "publication_date", "type",
  "cited_by_count", "authorships", "primary_location", "open_access",
  "abstract_inverted_index",
].join(",");
const MAX_ABSTRACT_CHARS = 800;

interface OpenAlexWork {
  id?: string;
  doi?: string | null;
  title?: string | null;
  publication_year?: number | null;
  publication_date?: string | null;
  type?: string | null;
  cited_by_count?: number;
  authorships?: Array<{ author?: { display_name?: string }; institutions?: Array<{ display_name?: string }> }>;
  primary_location?: { source?: { display_name?: string } | null; landing_page_url?: string | null } | null;
  open_access?: { is_oa?: boolean; oa_url?: string | null } | null;
  abstract_inverted_index?: Record<string, number[]> | null;
}

/** Rebuild plain text from OpenAlex's word → positions map, bounded. */
export function abstractFromInvertedIndex(
  index: Record<string, number[]> | null | undefined,
  maxChars = MAX_ABSTRACT_CHARS,
): string | null {
  if (!index) return null;
  const words: Array<[number, string]> = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const p of positions) words.push([p, word]);
  }
  if (words.length === 0) return null;
  words.sort((a, b) => a[0] - b[0]);
  const text = words.map(([, w]) => w).join(" ");
  return text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}…` : text;
}

export function summarizeWork(w: OpenAlexWork) {
  const authors = (w.authorships ?? [])
    .map((a) => a.author?.display_name)
    .filter((n): n is string => typeof n === "string" && n.length > 0)
    .slice(0, 10);
  return {
    openalex_id: w.id ?? null,
    doi: w.doi ?? null,
    title: w.title ?? null,
    publication_year: w.publication_year ?? null,
    publication_date: w.publication_date ?? null,
    type: w.type ?? null,
    cited_by_count: w.cited_by_count ?? 0,
    authors,
    venue: w.primary_location?.source?.display_name ?? null,
    landing_page_url: w.primary_location?.landing_page_url ?? null,
    is_open_access: w.open_access?.is_oa ?? false,
    open_access_url: w.open_access?.oa_url ?? null,
    abstract: abstractFromInvertedIndex(w.abstract_inverted_index),
  };
}

registerCapability("academic-paper-search", async (input: CapabilityInput) => {
  const query = typeof input.query === "string" ? input.query.trim() : "";
  if (query.length < 2) throw new Error("'query' is required (at least 2 characters).");

  const limit = readBoundedInt(input.limit, "limit", { min: 1, max: 25, fallback: 10 });
  const yearFrom = input.year_from === undefined ? null : readBoundedInt(input.year_from, "year_from", { min: 1800, max: 2100, fallback: 1800 });
  const yearTo = input.year_to === undefined ? null : readBoundedInt(input.year_to, "year_to", { min: 1800, max: 2100, fallback: 2100 });
  const openAccessOnly = input.open_access_only === true || input.open_access_only === "true";
  const sort = input.sort === "cited" ? "cited_by_count:desc" : input.sort === "date" ? "publication_date:desc" : "relevance_score:desc";

  const filters: string[] = [];
  if (yearFrom !== null) filters.push(`from_publication_date:${yearFrom}-01-01`);
  if (yearTo !== null) filters.push(`to_publication_date:${yearTo}-12-31`);
  if (openAccessOnly) filters.push("is_oa:true");

  const params = new URLSearchParams({
    search: query,
    "per-page": String(limit),
    select: SELECT,
    sort,
    mailto: CONTACT,
  });
  if (filters.length > 0) params.set("filter", filters.join(","));

  const response = await fetch(`${API}?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (response.status === 429) throw new Error("OpenAlex is rate-limiting requests right now. Retry shortly.");
  if (!response.ok) throw new Error(`OpenAlex returned HTTP ${response.status}.`);

  const data = await readJsonWithLimit<{ meta?: { count?: number }; results?: OpenAlexWork[] }>(response);
  const results = Array.isArray(data.results) ? data.results : [];

  return {
    output: {
      query,
      total_results: data.meta?.count ?? results.length,
      returned: results.length,
      papers: results.map(summarizeWork),
    },
    provenance: { source: "openalex.org", fetched_at: new Date().toISOString() },
  };
});
