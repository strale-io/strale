import { registerCapability, type CapabilityInput } from "./index.js";
import { readJsonWithLimit } from "../lib/resource-limits.js";
import { abstractFromInvertedIndex } from "./academic-paper-search.js";

// OpenAlex — one scholarly work by DOI or OpenAlex id (free, no key).
// Verified live 2026-09-04 with doi 10.1038/s41586-020-2649-2.
const API = "https://api.openalex.org/works";
const CONTACT = "support@strale.io";
const USER_AGENT = `Strale/1.0 (${CONTACT})`;

const DOI_RE = /\b10\.\d{4,9}\/[^\s"<>]+/i;
const OPENALEX_ID_RE = /^W\d{4,}$/i;

/** Accept a bare DOI, a doi.org URL, or an OpenAlex work id; return the API path segment. */
export function resolveWorkIdentifier(raw: string): { kind: "doi" | "openalex"; id: string } | null {
  const value = raw.trim();
  if (OPENALEX_ID_RE.test(value)) return { kind: "openalex", id: value.toUpperCase() };
  const m = value.match(DOI_RE);
  if (m) return { kind: "doi", id: m[0].replace(/[.,;)]+$/, "").toLowerCase() };
  return null;
}

interface OpenAlexWork {
  id?: string;
  doi?: string | null;
  title?: string | null;
  publication_year?: number | null;
  publication_date?: string | null;
  type?: string | null;
  language?: string | null;
  cited_by_count?: number;
  referenced_works_count?: number;
  is_retracted?: boolean;
  authorships?: Array<{
    author?: { display_name?: string; orcid?: string | null };
    institutions?: Array<{ display_name?: string; country_code?: string | null }>;
  }>;
  primary_location?: { source?: { display_name?: string; type?: string } | null; landing_page_url?: string | null; pdf_url?: string | null } | null;
  open_access?: { is_oa?: boolean; oa_status?: string; oa_url?: string | null } | null;
  topics?: Array<{ display_name?: string; score?: number }>;
  keywords?: Array<{ display_name?: string }>;
  abstract_inverted_index?: Record<string, number[]> | null;
}

registerCapability("paper-details", async (input: CapabilityInput) => {
  const raw = [input.doi, input.openalex_id, input.identifier, input.id]
    .find((v): v is string => typeof v === "string" && v.trim().length > 0);
  if (!raw) throw new Error("'doi' is required (a DOI such as 10.1038/s41586-020-2649-2, or an OpenAlex work id like W3035965352).");

  const ident = resolveWorkIdentifier(raw);
  if (!ident) throw new Error(`'doi' does not look like a DOI or OpenAlex work id: ${JSON.stringify(raw.slice(0, 80))}.`);

  const path = ident.kind === "doi" ? `https://doi.org/${ident.id}` : ident.id;
  const response = await fetch(`${API}/${path}?mailto=${encodeURIComponent(CONTACT)}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (response.status === 404) throw new Error(`No work found in OpenAlex for ${ident.kind === "doi" ? "DOI" : "id"} ${ident.id}.`);
  if (response.status === 429) throw new Error("OpenAlex is rate-limiting requests right now. Retry shortly.");
  if (!response.ok) throw new Error(`OpenAlex returned HTTP ${response.status}.`);

  const w = await readJsonWithLimit<OpenAlexWork>(response);
  const authors = (w.authorships ?? []).slice(0, 50).map((a) => ({
    name: a.author?.display_name ?? null,
    orcid: a.author?.orcid ?? null,
    institutions: (a.institutions ?? []).map((i) => i.display_name).filter(Boolean).slice(0, 5),
  }));

  return {
    output: {
      openalex_id: w.id ?? null,
      doi: w.doi ?? null,
      title: w.title ?? null,
      publication_year: w.publication_year ?? null,
      publication_date: w.publication_date ?? null,
      type: w.type ?? null,
      language: w.language ?? null,
      venue: w.primary_location?.source?.display_name ?? null,
      venue_type: w.primary_location?.source?.type ?? null,
      landing_page_url: w.primary_location?.landing_page_url ?? null,
      pdf_url: w.primary_location?.pdf_url ?? w.open_access?.oa_url ?? null,
      is_open_access: w.open_access?.is_oa ?? false,
      open_access_status: w.open_access?.oa_status ?? null,
      is_retracted: w.is_retracted ?? false,
      cited_by_count: w.cited_by_count ?? 0,
      referenced_works_count: w.referenced_works_count ?? 0,
      author_count: (w.authorships ?? []).length,
      authors,
      topics: (w.topics ?? []).slice(0, 5).map((t) => t.display_name).filter(Boolean),
      keywords: (w.keywords ?? []).slice(0, 10).map((k) => k.display_name).filter(Boolean),
      abstract: abstractFromInvertedIndex(w.abstract_inverted_index, 2000),
    },
    provenance: { source: "openalex.org", fetched_at: new Date().toISOString() },
  };
});
