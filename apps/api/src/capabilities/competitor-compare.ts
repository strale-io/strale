import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";
import { ResultCache } from "./lib/result-cache.js";

/**
 * 24h result cache, keyed on the normalized domain pair.
 *
 * A comparison costs two Browserless renders, an LLM call, and 12-15 seconds.
 * The customer who prompted this ran one identical pair four times; the last
 * three were repeats of work already done. Competitor websites do not
 * meaningfully change within a day, so a day is the window where a repeat is
 * genuinely the same answer rather than a stale one.
 *
 * A hit still bills normally: the caller receives the answer they asked for,
 * and `vat-validate` — the pattern this follows — bills its cache hits too.
 * What the caller gains is an instant response instead of a 14-second one, and
 * `cache_hit` / `cache_age_hours` so the reuse is disclosed rather than hidden.
 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedComparison {
  output: Record<string, unknown>;
  /** When the underlying sites were actually fetched. Carried into provenance. */
  fetchedAt: string;
}

const cache = new ResultCache<CachedComparison>({
  ttlMs: CACHE_TTL_MS,
  maxEntries: 500,
});

setInterval(() => cache.sweep(), 60 * 60 * 1000).unref();

/**
 * Order-SENSITIVE key. (a,b) and (b,a) are deliberately different entries,
 * because the output labels one site `company_a` and the other `company_b` —
 * serving a flipped pair from cache would silently swap which company each
 * finding is about, which is a wrong answer rather than a stale one.
 */
export function comparisonCacheKey(domain1: string, domain2: string): string {
  const normalize = (d: string) =>
    d.trim().toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/+$/, "");
  return `${normalize(domain1)}|${normalize(domain2)}`;
}

registerCapability("competitor-compare", async (input: CapabilityInput) => {
  const domain1 = ((input.domain1 as string) ?? (input.company1 as string) ?? "").trim();
  const domain2 = ((input.domain2 as string) ?? (input.company2 as string) ?? "").trim();
  if (!domain1 || !domain2) throw new Error("'domain1' and 'domain2' are required.");

  const cacheKey = comparisonCacheKey(domain1, domain2);
  const hit = cache.get(cacheKey);
  if (hit) {
    return {
      output: {
        ...hit.value.output,
        cache_hit: true,
        cached_at: new Date(hit.cachedAt).toISOString(),
        cache_age_hours: Math.round((hit.ageMs / 3_600_000) * 10) / 10,
      },
      // The ORIGINAL fetch time, never the time of this hit. Provenance is a
      // freshness statement, and "fetched_at: now" for a value computed
      // yesterday would be false.
      provenance: { source: "claude-haiku", fetched_at: hit.value.fetchedAt },
    };
  }

  const url1 = domain1.startsWith("http") ? domain1 : `https://${domain1}`;
  const url2 = domain2.startsWith("http") ? domain2 : `https://${domain2}`;

  // Scrape both sites in parallel
  const [html1, html2] = await Promise.all([
    fetchRenderedHtml(url1),
    fetchRenderedHtml(url2),
  ]);

  const text1 = htmlToText(html1).slice(0, 6000);
  const text2 = htmlToText(html2).slice(0, 6000);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 2000,
    // Deterministic extraction: the same pair of sites should yield the same
    // comparison. A paying customer ran one input four times on 2026-08-23/25
    // and got four different answers at €1.00 each — that was sampling at the
    // API-default temperature, not a malfunction, and it reads as
    // unreliability on a platform whose product is trust.
    temperature: 0,
    prompt: `Compare these two competitor websites. Return ONLY valid JSON.

COMPANY A: ${url1}
${text1}

COMPANY B: ${url2}
${text2}

Return JSON:
{
  "company_a": { "domain": "${domain1}", "name": "detected name", "tagline": "main value prop" },
  "company_b": { "domain": "${domain2}", "name": "detected name", "tagline": "main value prop" },
  "comparison": {
    "positioning": { "company_a": "string", "company_b": "string", "analysis": "string" },
    "target_audience": { "company_a": "string", "company_b": "string", "analysis": "string" },
    "pricing_model": { "company_a": "string or unknown", "company_b": "string or unknown" },
    "feature_emphasis": { "company_a": ["top features"], "company_b": ["top features"] },
    "trust_signals": { "company_a": ["signals"], "company_b": ["signals"] },
    "content_strategy": { "company_a": "string", "company_b": "string" }
  },
  "strategic_analysis": "2-3 paragraph strategic comparison",
  "key_differentiators": ["list of main differences"],
  "competitive_advantages": { "company_a": ["advantages"], "company_b": ["advantages"] }
}`,
    truncationGuidance: "Compare fewer aspects per call, or two smaller sites.",
    parseFailureError: () => new Error("Failed to compare competitors."),
  });
  output.disclaimer = "AI-generated competitive analysis. Verify specific claims independently.";

  const fetchedAt = new Date().toISOString();
  // Store the answer WITHOUT the cache_* fields, so a hit derives them from
  // its own age rather than replaying a previous hit's numbers.
  cache.set(cacheKey, { output: { ...output }, fetchedAt });

  return {
    output: { ...output, cache_hit: false },
    provenance: { source: "claude-haiku", fetched_at: fetchedAt },
  };
});
