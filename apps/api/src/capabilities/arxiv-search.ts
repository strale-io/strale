import { registerCapability, type CapabilityInput } from "./index.js";
import { MAX_FETCHED_API_RESPONSE_BYTES, readTextWithLimit } from "../lib/resource-limits.js";
import { readBoundedInt } from "../lib/capability-input.js";

// arXiv API — Atom feed of preprints (free, no key). arXiv asks clients to
// space requests ~3 s apart; one call per invocation and hourly harness
// traffic is far inside that. The http:// form 301s, so always https.
// Verified live 2026-09-04.
const API = "https://export.arxiv.org/api/query";
const USER_AGENT = "Strale/1.0 (support@strale.io)";
const MAX_SUMMARY_CHARS = 700;

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}
function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decodeXml(m[1]).replace(/\s+/g, " ").trim() : null;
}
function attrAll(block: string, tagName: string, attr: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tagName}\\b[^>]*\\b${attr}="([^"]*)"[^>]*/?>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) out.push(decodeXml(m[1]));
  return out;
}

export interface ArxivEntry {
  arxiv_id: string | null;
  version: number | null;
  title: string | null;
  summary: string | null;
  authors: string[];
  published: string | null;
  updated: string | null;
  primary_category: string | null;
  categories: string[];
  doi: string | null;
  abs_url: string | null;
  pdf_url: string | null;
}

/** Parse the entries of an arXiv Atom response without an XML library. */
export function parseArxivFeed(xml: string): { total: number; entries: ArxivEntry[] } {
  const totalRaw = xml.match(/<opensearch:totalResults[^>]*>(\d+)</);
  const total = totalRaw ? Number(totalRaw[1]) : 0;
  const entries: ArxivEntry[] = [];
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const idUrl = tag(block, "id");
    const idMatch = idUrl?.match(/abs\/([^v\s]+)(?:v(\d+))?$/);
    const authors: string[] = [];
    const authorRe = /<author>\s*<name>([\s\S]*?)<\/name>/g;
    let a: RegExpExecArray | null;
    while ((a = authorRe.exec(block)) !== null) authors.push(decodeXml(a[1]).trim());
    const summaryFull = tag(block, "summary");
    const primary = block.match(/<arxiv:primary_category\b[^>]*\bterm="([^"]*)"/);
    const pdf = block.match(/<link\b[^>]*\btitle="pdf"[^>]*\bhref="([^"]*)"/) ?? block.match(/<link\b[^>]*\bhref="([^"]*)"[^>]*\btitle="pdf"/);
    entries.push({
      arxiv_id: idMatch ? idMatch[1] : null,
      version: idMatch?.[2] ? Number(idMatch[2]) : null,
      title: tag(block, "title"),
      summary: summaryFull && summaryFull.length > MAX_SUMMARY_CHARS ? `${summaryFull.slice(0, MAX_SUMMARY_CHARS).trimEnd()}…` : summaryFull,
      authors,
      published: tag(block, "published"),
      updated: tag(block, "updated"),
      primary_category: primary ? primary[1] : null,
      categories: attrAll(block, "category", "term"),
      doi: tag(block, "arxiv:doi"),
      abs_url: idUrl,
      pdf_url: pdf ? pdf[1] : null,
    });
  }
  return { total, entries };
}

registerCapability("arxiv-search", async (input: CapabilityInput) => {
  const query = typeof input.query === "string" ? input.query.trim() : "";
  if (query.length < 2) throw new Error("'query' is required (at least 2 characters).");
  const limit = readBoundedInt(input.limit, "limit", { min: 1, max: 25, fallback: 10 });
  const sortBy = input.sort === "date" ? "submittedDate" : input.sort === "updated" ? "lastUpdatedDate" : "relevance";
  const category = typeof input.category === "string" && /^[a-z-]+(\.[A-Za-z-]+)?$/.test(input.category.trim()) ? input.category.trim() : null;

  // Free text goes to the `all:` field; a category constraint ANDs onto it.
  const searchQuery = category ? `all:${query} AND cat:${category}` : `all:${query}`;
  const params = new URLSearchParams({
    search_query: searchQuery,
    start: "0",
    max_results: String(limit),
    sortBy,
    sortOrder: "descending",
  });

  const response = await fetch(`${API}?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 429 || response.status === 503) throw new Error(`arXiv is throttling requests right now (HTTP ${response.status}). Retry shortly.`);
  if (!response.ok) throw new Error(`arXiv returned HTTP ${response.status}.`);

  const xml = await readTextWithLimit(response, MAX_FETCHED_API_RESPONSE_BYTES, "query", "an endpoint whose response is");
  const { total, entries } = parseArxivFeed(xml);

  return {
    output: {
      query,
      category,
      total_results: total,
      returned: entries.length,
      papers: entries,
    },
    provenance: { source: "arxiv.org", fetched_at: new Date().toISOString() },
  };
});
