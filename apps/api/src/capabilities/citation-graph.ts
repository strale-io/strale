import { registerCapability, type CapabilityInput } from "./index.js";
import { readJsonWithLimit } from "../lib/resource-limits.js";
import { readBoundedInt } from "../lib/capability-input.js";

// OpenAlex — free, keyless, and already the source behind paper-details and
// academic-paper-search, so this adds no new upstream dependency.
//
// Semantic Scholar was the obvious alternative and was rejected during this
// batch: its keyless pool is shared and returned HTTP 429 on the very first
// live verification run, which would trip the circuit breaker in production.
// Verified live 2026-09-05 (10.1038/nature12373 -> W2159974629, 1,989 cited-by,
// 36 references; the cites: filter reported 1,990 citing works).
const API = "https://api.openalex.org";
const CONTACT = "support@strale.io";
const USER_AGENT = `Strale/1.0 (${CONTACT})`;

interface Authorship { author?: { display_name?: string } }
interface Work {
  id?: string;
  doi?: string;
  title?: string;
  display_name?: string;
  publication_year?: number;
  cited_by_count?: number;
  referenced_works?: string[];
  type?: string;
  authorships?: Authorship[];
  primary_location?: { source?: { display_name?: string } } | null;
  best_oa_location?: { pdf_url?: string } | null;
  ids?: { pmid?: string; doi?: string };
}
interface WorkList { meta?: { count?: number }; results?: Work[] }

const OPENALEX_ID_RE = /^W\d{4,12}$/i;
const DOI_RE = /10\.\d{4,9}\/[-._;()/:a-z0-9<>[\]+]+/i;
const ARXIV_RE = /^(?:arxiv:)?(\d{4}\.\d{4,5})(v\d+)?$/i;

/**
 * Resolve a caller identifier to the path segment OpenAlex accepts. arXiv ids
 * have no OpenAlex namespace, so they are resolved through their registered
 * DataCite DOI (`10.48550/arXiv.<id>`).
 */
export function resolveWorkPath(raw: string): string | null {
  const v = raw.trim();
  if (v.length === 0) return null;
  if (OPENALEX_ID_RE.test(v)) return v.toUpperCase();
  const doi = v.match(DOI_RE);
  if (doi) return `doi:${doi[0].replace(/[.,;)\]]+$/, "")}`;
  const arxiv = v.match(ARXIV_RE);
  if (arxiv) return `doi:10.48550/arXiv.${arxiv[1]}`;
  if (/^\d{6,9}$/.test(v)) return `pmid:${v}`;
  return null;
}

/** Bare `W…` id from a full OpenAlex URL. */
export function shortId(url?: string): string | null {
  if (!url) return null;
  const tail = url.split("/").pop();
  return tail && OPENALEX_ID_RE.test(tail) ? tail.toUpperCase() : null;
}

/** Shared projection for the focal work and for every edge. */
export function normalizeWork(w: Work | null | undefined): Record<string, unknown> | null {
  if (!w || !w.id) return null;
  return {
    openalex_id: shortId(w.id),
    title: w.title ?? w.display_name ?? null,
    year: typeof w.publication_year === "number" ? w.publication_year : null,
    venue: w.primary_location?.source?.display_name ?? null,
    citation_count: typeof w.cited_by_count === "number" ? w.cited_by_count : null,
    doi: w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//, "") : null,
    type: w.type ?? null,
    authors: (w.authorships ?? [])
      .map((a) => a.author?.display_name)
      .filter((n): n is string => typeof n === "string"),
    url: w.id,
  };
}

async function openalex(path: string, timeoutMs = 6_000): Promise<Response> {
  const joiner = path.includes("?") ? "&" : "?";
  const res = await fetch(`${API}${path}${joiner}mailto=${encodeURIComponent(CONTACT)}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 429) {
    throw new Error("OpenAlex is rate-limiting requests right now. Retry shortly.");
  }
  return res;
}

registerCapability("citation-graph", async (input: CapabilityInput) => {
  const raw = typeof input.paper_id === "string" ? input.paper_id.trim() : "";
  if (raw.length === 0) {
    throw new Error("'paper_id' must be a DOI, arXiv id, PubMed id, or OpenAlex work id (W2159974629).");
  }
  const path = resolveWorkPath(raw);
  if (!path) {
    throw new Error(`'paper_id' must be a DOI, arXiv id (2209.15001), PubMed id, or OpenAlex work id (W2159974629); '${raw}' is none of those.`);
  }
  const limit = readBoundedInt(input.limit, "limit", { min: 1, max: 50, fallback: 10 });

  const direction = input.direction === undefined || input.direction === null || input.direction === ""
    ? "both"
    : String(input.direction).trim().toLowerCase();
  if (!["citations", "references", "both"].includes(direction)) {
    throw new Error("'direction' must be one of: citations, references, both.");
  }

  const workRes = await openalex(`/works/${path}`);
  if (workRes.status === 404) throw new Error(`'paper_id' must be a work OpenAlex has a record for; it has none for '${raw}'.`);
  if (!workRes.ok) throw new Error(`OpenAlex returned HTTP ${workRes.status}.`);
  const work = await readJsonWithLimit<Work>(workRes);

  const id = shortId(work.id);
  if (!id) throw new Error("OpenAlex returned a work without a usable identifier.");

  const referencedWorks = Array.isArray(work.referenced_works) ? work.referenced_works : [];
  const wantCitations = direction === "citations" || direction === "both";
  const wantReferences = direction === "references" || direction === "both";

  // Citing works come from a filtered query; the reference list is a batch
  // fetch of the ids the record already carries. Both are optional edges, so
  // one failing degrades that edge rather than the whole call.
  const refIds = referencedWorks.slice(0, limit).map((u) => shortId(u)).filter((v): v is string => v !== null);

  const [citeRes, refRes] = await Promise.all([
    wantCitations
      ? openalex(`/works?filter=cites:${id}&per-page=${limit}&sort=cited_by_count:desc`).catch(() => null)
      : Promise.resolve(null),
    wantReferences && refIds.length > 0
      ? openalex(`/works?filter=openalex_id:${refIds.join("|")}&per-page=${refIds.length}`).catch(() => null)
      : Promise.resolve(null),
  ]);

  let citations: Record<string, unknown>[] = [];
  let citingTotal: number | null = null;
  let citationsUnavailable = wantCitations;
  if (citeRes?.ok) {
    const body = await readJsonWithLimit<WorkList>(citeRes);
    citations = (body.results ?? []).flatMap((w) => { const n = normalizeWork(w); return n ? [n] : []; });
    citingTotal = typeof body.meta?.count === "number" ? body.meta.count : null;
    citationsUnavailable = false;
  }

  let references: Record<string, unknown>[] = [];
  let referencesUnavailable = wantReferences && refIds.length > 0;
  if (refRes?.ok) {
    const body = await readJsonWithLimit<WorkList>(refRes);
    references = (body.results ?? []).flatMap((w) => { const n = normalizeWork(w); return n ? [n] : []; });
    referencesUnavailable = false;
  } else if (wantReferences && refIds.length === 0) {
    referencesUnavailable = false; // The work genuinely lists no references.
  }

  return {
    output: {
      resolved_id: id,
      paper: normalizeWork(work),
      // cited_by_count is the figure on the work record; citing_works_total is
      // what the cites: filter counts. They can differ by a small margin as
      // OpenAlex reindexes, so both are reported rather than reconciled.
      citation_count: typeof work.cited_by_count === "number" ? work.cited_by_count : null,
      citing_works_total: citingTotal,
      reference_count: referencedWorks.length,
      open_access_pdf: work.best_oa_location?.pdf_url ?? null,
      citations,
      references,
      citations_unavailable: citationsUnavailable,
      references_unavailable: referencesUnavailable,
    },
    provenance: { source: "openalex.org", fetched_at: new Date().toISOString() },
  };
});
