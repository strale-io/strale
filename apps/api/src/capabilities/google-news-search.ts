import { registerCapability, type CapabilityInput } from "./index.js";
import { meteredVendorFetch } from "../lib/metered-vendor-fetch.js";
import { resolveCountryOrThrow } from "./lib/iso-3166.js";
import { resolveLanguageOrThrow } from "./lib/language-tag.js";

// Google News results via Serper.dev (the licensed SERP vendor already
// powering google-search and brand-mention-search — DEC-20260427-H-4
// prohibits Strale-operated Google scraping; this is the compliant path).
// Requires SERPER_API_KEY.
//
// Demand evidence (catalog-buildout-strategy.md, 2026-08-12): the top x402
// customer buys SEO/SERP/web-intelligence; news search is the top-ranked
// gap on an already-paid vendor.

const TIME_RANGES: Record<string, string> = {
  hour: "qdr:h",
  day: "qdr:d",
  week: "qdr:w",
  month: "qdr:m",
  year: "qdr:y",
};

registerCapability("google-news-search", async (input: CapabilityInput) => {
  for (const k of ["query", "q", "search", "task", "time_range"] as const) {
    if (input[k] !== undefined && typeof input[k] !== "string") {
      throw new Error(`'${k}' must be a string. Received ${typeof input[k]}.`);
    }
  }
  const query = ((input.query as string) ?? (input.q as string) ?? (input.search as string) ?? (input.task as string) ?? "").trim();
  if (!query) throw new Error("'query' is required.");
  if (query.length < 2) throw new Error("'query' must be at least 2 characters.");

  // Validated BEFORE spending a Serper call (review M-1): a NaN num_results
  // used to slice to an empty array — billing 10 cents for zero results.
  const rawNum = input.num_results ?? 10;
  if (typeof rawNum !== "number" || !Number.isInteger(rawNum) || rawNum < 1) {
    throw new Error("'num_results' must be an integer >= 1 (default 10, max 20).");
  }
  const numResults = Math.min(rawNum, 20);
  const language = resolveLanguageOrThrow(input.language);
  const country = resolveCountryOrThrow(input.country);

  // Validate BEFORE spending a Serper call (Principle B): an unknown
  // time_range silently searching all-time would bill for the wrong answer.
  let tbs: string | undefined;
  const timeRange = ((input.time_range as string) ?? "").trim().toLowerCase();
  if (timeRange) {
    tbs = TIME_RANGES[timeRange];
    if (!tbs) {
      throw new Error(
        `'time_range' must be one of: ${Object.keys(TIME_RANGES).join(", ")} (got "${timeRange}"). Omit it to search all time.`,
      );
    }
  }

  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) {
    throw new Error("SERPER_API_KEY is required. Sign up at https://serper.dev.");
  }

  const body: Record<string, unknown> = { q: query, num: numResults };
  if (language) body.hl = language;
  if (country) body.gl = country.toLowerCase();
  if (tbs) body.tbs = tbs;

  const res = await meteredVendorFetch("serper", "https://google.serper.dev/news", {
    method: "POST",
    headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Serper API error: HTTP ${res.status} ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const news = (data.news as Array<Record<string, unknown>>) ?? [];
  const results = news.slice(0, numResults).map((r, i) => ({
    position: i + 1,
    title: (r.title as string) ?? null,
    url: (r.link as string) ?? null,
    source: (r.source as string) ?? null,
    // Serper returns relative dates ("2 hours ago") — passed through
    // verbatim; no fabricated ISO timestamps.
    published: (r.date as string) ?? null,
    snippet: (r.snippet as string) ?? null,
    image_url: (r.imageUrl as string) ?? null,
  }));

  return {
    output: {
      query,
      time_range: timeRange || null,
      country: country ?? null,
      result_count: results.length,
      results,
    },
    provenance: {
      source: "serper.dev (Google News)",
      fetched_at: new Date().toISOString(),
      acquisition_method: "direct_api" as const,
      upstream_vendor: "Serper.dev",
    },
  };
});
