import { registerCapability, type CapabilityInput } from "./index.js";
import { readJsonWithLimit } from "../lib/resource-limits.js";
import { readBoundedInt } from "../lib/capability-input.js";

// Hacker News Search by Algolia — the official public HN search API (free,
// no key, documented at hn.algolia.com/api). Verified live 2026-09-04.
const API = "https://hn.algolia.com/api/v1";
const USER_AGENT = "Strale/1.0 (support@strale.io)";
const MAX_TEXT_CHARS = 500;

interface Hit {
  objectID?: string; title?: string | null; url?: string | null; author?: string; points?: number | null;
  num_comments?: number | null; created_at?: string; created_at_i?: number; story_text?: string | null;
  comment_text?: string | null; story_id?: number | null; story_title?: string | null; parent_id?: number | null;
  _tags?: string[];
}

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const clip = (s: string | null | undefined) => (s ? (stripHtml(s).length > MAX_TEXT_CHARS ? `${stripHtml(s).slice(0, MAX_TEXT_CHARS).trimEnd()}…` : stripHtml(s)) : null);

registerCapability("hacker-news-search", async (input: CapabilityInput) => {
  const query = typeof input.query === "string" ? input.query.trim() : "";
  if (query.length < 2) throw new Error("'query' is required (at least 2 characters).");
  const limit = readBoundedInt(input.limit, "limit", { min: 1, max: 30, fallback: 10 });
  const kind = input.type === "comment" ? "comment" : input.type === "all" ? "all" : "story";
  const byDate = input.sort === "date";
  const sinceDays = input.since_days === undefined ? null : readBoundedInt(input.since_days, "since_days", { min: 1, max: 3650, fallback: 30 });

  const params = new URLSearchParams({ query, hitsPerPage: String(limit) });
  if (kind !== "all") params.set("tags", kind);
  if (sinceDays !== null) params.set("numericFilters", `created_at_i>${Math.floor(Date.now() / 1000) - sinceDays * 86_400}`);

  const response = await fetch(`${API}/${byDate ? "search_by_date" : "search"}?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 429) throw new Error("Hacker News search (Algolia) is rate-limiting requests right now. Retry shortly.");
  if (!response.ok) throw new Error(`Hacker News search returned HTTP ${response.status}.`);

  const data = await readJsonWithLimit<{ hits?: Hit[]; nbHits?: number }>(response);
  const hits = Array.isArray(data.hits) ? data.hits : [];
  const results = hits.map((h) => {
    const isComment = (h._tags ?? []).includes("comment");
    const id = h.objectID ?? null;
    return {
      id,
      type: isComment ? "comment" : "story",
      title: isComment ? (h.story_title ?? null) : (h.title ?? null),
      url: h.url ?? null,
      hn_url: id ? `https://news.ycombinator.com/item?id=${id}` : null,
      author: h.author ?? null,
      points: h.points ?? null,
      num_comments: h.num_comments ?? null,
      created_at: h.created_at ?? (h.created_at_i ? new Date(h.created_at_i * 1000).toISOString() : null),
      text: clip(isComment ? h.comment_text : h.story_text),
      story_id: h.story_id ?? null,
    };
  });

  return {
    output: { query, type: kind, sort: byDate ? "date" : "relevance", total_results: data.nbHits ?? results.length, returned: results.length, results },
    provenance: { source: "hn.algolia.com", fetched_at: new Date().toISOString() },
  };
});
