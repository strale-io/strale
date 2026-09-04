import { registerCapability, type CapabilityInput } from "./index.js";
import { readJsonWithLimit } from "../lib/resource-limits.js";
import { readBoundedInt } from "../lib/capability-input.js";

// NCBI E-utilities — PubMed (free, no key; 3 requests/second per IP without
// one). One search + one summary call per invocation. Verified live
// 2026-09-04 (esearch "crispr", esummary 33244136).
const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const TOOL = "strale";
const EMAIL = "support@strale.io";
const USER_AGENT = `Strale/1.0 (${EMAIL})`;

interface ESearch { esearchresult?: { count?: string; idlist?: string[]; errorlist?: unknown; warninglist?: unknown } }
interface ESummaryDoc {
  uid?: string; title?: string; pubdate?: string; epubdate?: string; source?: string; fulljournalname?: string;
  volume?: string; issue?: string; pages?: string; lang?: string[]; pubtype?: string[];
  authors?: Array<{ name?: string; authtype?: string }>;
  articleids?: Array<{ idtype?: string; value?: string }>;
  error?: string;
}
interface ESummary { result?: Record<string, ESummaryDoc | string[]> }

const DATE_RE = /^\d{4}(\/\d{2}(\/\d{2})?)?$/;

registerCapability("pubmed-search", async (input: CapabilityInput) => {
  const query = typeof input.query === "string" ? input.query.trim() : "";
  if (query.length < 2) throw new Error("'query' is required (at least 2 characters). PubMed field syntax such as \"crispr[Title] AND 2024[dp]\" is accepted.");
  const limit = readBoundedInt(input.limit, "limit", { min: 1, max: 20, fallback: 10 });
  const sort = input.sort === "date" ? "pub_date" : "relevance";
  const minDate = typeof input.min_date === "string" && DATE_RE.test(input.min_date.trim()) ? input.min_date.trim() : null;
  const maxDate = typeof input.max_date === "string" && DATE_RE.test(input.max_date.trim()) ? input.max_date.trim() : null;
  if ((input.min_date && !minDate) || (input.max_date && !maxDate)) {
    throw new Error("'min_date' / 'max_date' must be YYYY, YYYY/MM or YYYY/MM/DD.");
  }

  const search = new URLSearchParams({ db: "pubmed", term: query, retmax: String(limit), retmode: "json", sort, tool: TOOL, email: EMAIL });
  if (minDate || maxDate) {
    search.set("datetype", "pdat");
    search.set("mindate", minDate ?? "1800");
    search.set("maxdate", maxDate ?? "3000");
  }
  const headers = { "User-Agent": USER_AGENT, Accept: "application/json" };
  const sRes = await fetch(`${EUTILS}/esearch.fcgi?${search.toString()}`, { headers, signal: AbortSignal.timeout(10_000) });
  if (sRes.status === 429) throw new Error("PubMed (NCBI E-utilities) is rate-limiting requests right now. Retry shortly.");
  if (!sRes.ok) throw new Error(`PubMed search returned HTTP ${sRes.status}.`);
  const sData = await readJsonWithLimit<ESearch>(sRes);
  const ids = sData.esearchresult?.idlist ?? [];
  const total = Number(sData.esearchresult?.count ?? ids.length) || 0;

  let articles: unknown[] = [];
  if (ids.length > 0) {
    const summary = new URLSearchParams({ db: "pubmed", id: ids.join(","), retmode: "json", tool: TOOL, email: EMAIL });
    const uRes = await fetch(`${EUTILS}/esummary.fcgi?${summary.toString()}`, { headers, signal: AbortSignal.timeout(10_000) });
    if (!uRes.ok) throw new Error(`PubMed summary returned HTTP ${uRes.status}.`);
    const uData = await readJsonWithLimit<ESummary>(uRes);
    const result = uData.result ?? {};
    articles = ids.flatMap((id) => {
      const d = result[id];
      if (!d || Array.isArray(d) || d.error) return [];
      const doi = d.articleids?.find((a) => a.idtype === "doi")?.value ?? null;
      const pmc = d.articleids?.find((a) => a.idtype === "pmc")?.value ?? null;
      return [{
        pmid: d.uid ?? id,
        title: d.title ?? null,
        authors: (d.authors ?? []).map((a) => a.name).filter(Boolean).slice(0, 20),
        journal: d.fulljournalname ?? d.source ?? null,
        journal_abbrev: d.source ?? null,
        pub_date: d.pubdate ?? null,
        epub_date: d.epubdate || null,
        volume: d.volume || null,
        issue: d.issue || null,
        pages: d.pages || null,
        languages: d.lang ?? [],
        publication_types: d.pubtype ?? [],
        doi,
        pmc_id: pmc,
        url: `https://pubmed.ncbi.nlm.nih.gov/${d.uid ?? id}/`,
      }];
    });
  }

  return {
    output: { query, total_results: total, returned: articles.length, articles },
    provenance: { source: "pubmed.ncbi.nlm.nih.gov", fetched_at: new Date().toISOString() },
  };
});
