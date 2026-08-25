import { registerCapability, type CapabilityInput } from "./index.js";
import { meteredVendorFetch } from "../lib/metered-vendor-fetch.js";
import { resolveCountryOrThrow } from "./lib/iso-3166.js";
import { resolveLanguageOrThrow } from "./lib/language-tag.js";

// Uses Serper.dev API (free tier: 2,500 queries/month, no CAPTCHA issues)
// Requires SERPER_API_KEY env var
registerCapability("google-search", async (input: CapabilityInput) => {
  const query = ((input.query as string) ?? (input.q as string) ?? (input.search as string) ?? "").trim();
  if (!query) throw new Error("'query' is required.");
  if (query.length < 2) throw new Error("'query' must be at least 2 characters.");

  const numResults = Math.min((input.num_results as number) ?? 10, 20);
  // Same silent-ignore behaviour as `country` below — Google drops an
  // unrecognised `hl` and bills the call anyway.
  const language = resolveLanguageOrThrow(input.language);

  // Validate before spending a Serper call. An unresolvable country used to be
  // forwarded verbatim as `gl`, which Serper ignores — the caller paid for a
  // search silently unscoped to the country they asked for. Observed in
  // production 2026-08-09: 50 consecutive calls passing gl="墨西".
  // No fallback here: omitting `country` means an unscoped global search.
  const country = resolveCountryOrThrow(input.country);

  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) {
    throw new Error("SERPER_API_KEY is required. Sign up at https://serper.dev (free tier: 2,500 queries/month).");
  }

  const body: Record<string, unknown> = { q: query, num: numResults };
  if (language) body.hl = language;
  if (country) body.gl = country.toLowerCase(); // Serper expects lowercase gl

  const res = await meteredVendorFetch("serper", "https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": serperKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Serper API error: HTTP ${res.status} ${errText.slice(0, 200)}`);
  }

  const data = await res.json() as Record<string, unknown>;

  // Map Serper response to our format
  const organic = (data.organic as Array<Record<string, unknown>>) ?? [];
  const results = organic.map((r, i) => ({
    position: i + 1,
    title: r.title as string,
    url: r.link as string,
    snippet: r.snippet as string,
    date: (r.date as string) ?? null,
    sitelinks: r.sitelinks ?? null,
  }));

  const knowledgeGraph = data.knowledgeGraph ?? null;
  const answerBox = data.answerBox ?? null;
  const peopleAlsoAsk = (data.peopleAlsoAsk as Array<Record<string, unknown>>) ?? [];

  const searchInfo = data.searchParameters as Record<string, unknown> | undefined;

  return {
    output: {
      query,
      results,
      result_count: results.length,
      knowledge_graph: knowledgeGraph,
      answer_box: answerBox,
      people_also_ask: peopleAlsoAsk.map((q) => ({
        question: q.question,
        snippet: q.snippet,
        link: q.link,
      })),
      search_parameters: {
        language: language || (searchInfo?.hl as string) || null,
        // Lowercase, matching the `gl` actually sent and matching what
        // serp-analyze / keyword-rank-check echo for the same field.
        country: country?.toLowerCase() || (searchInfo?.gl as string) || null,
      },
    },
    provenance: { source: "google-serper", fetched_at: new Date().toISOString() },
  };
});
