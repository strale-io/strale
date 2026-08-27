import { registerCapability, type CapabilityInput } from "./index.js";
import { meteredVendorFetch } from "../lib/metered-vendor-fetch.js";
import { resolveCountryOrThrow } from "./lib/iso-3166.js";
import { resolveLanguageOrThrow } from "./lib/language-tag.js";

// "People Also Ask" questions + related searches for a query, via Serper.dev
// (the licensed SERP vendor — DEC-20260427-H-4 prohibits Strale-operated
// Google scraping). Requires SERPER_API_KEY.
//
// Demand evidence (catalog-buildout-strategy.md, 2026-08-12): SEO/SERP
// intelligence is what the top x402 customer actually buys; PAA extraction
// is a standard content-research primitive missing from the catalog.

registerCapability("serp-related-questions", async (input: CapabilityInput) => {
  for (const k of ["query", "q", "keyword", "task"] as const) {
    if (input[k] !== undefined && typeof input[k] !== "string") {
      throw new Error(`'${k}' must be a string. Received ${typeof input[k]}.`);
    }
  }
  const query = ((input.query as string) ?? (input.q as string) ?? (input.keyword as string) ?? (input.task as string) ?? "").trim();
  if (!query) throw new Error("'query' is required.");
  if (query.length < 2) throw new Error("'query' must be at least 2 characters.");

  const language = resolveLanguageOrThrow(input.language);
  const country = resolveCountryOrThrow(input.country);

  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) {
    throw new Error("SERPER_API_KEY is required. Sign up at https://serper.dev.");
  }

  const body: Record<string, unknown> = { q: query };
  if (language) body.hl = language;
  if (country) body.gl = country.toLowerCase();

  const res = await meteredVendorFetch("serper", "https://google.serper.dev/search", {
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

  const paa = (data.peopleAlsoAsk as Array<Record<string, unknown>>) ?? [];
  const related = (data.relatedSearches as Array<Record<string, unknown>>) ?? [];

  const relatedQuestions = paa.map((r) => ({
    question: (r.question as string) ?? null,
    answer_snippet: (r.snippet as string) ?? null,
    source_title: (r.title as string) ?? null,
    source_url: (r.link as string) ?? null,
  }));
  const relatedSearches = related.map((r) => r.query as string).filter(Boolean);

  return {
    output: {
      query,
      country: country ?? null,
      // Empty arrays are an honest answer here: Google genuinely shows no
      // PAA box for many queries — that IS the result, not a failure.
      related_questions: relatedQuestions,
      related_searches: relatedSearches,
      question_count: relatedQuestions.length,
    },
    provenance: {
      source: "serper.dev (Google SERP)",
      fetched_at: new Date().toISOString(),
      acquisition_method: "direct_api" as const,
      upstream_vendor: "Serper.dev",
    },
  };
});
