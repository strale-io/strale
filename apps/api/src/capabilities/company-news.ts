import { registerCapability, type CapabilityInput } from "./index.js";
import { withRetry } from "../lib/retry.js";

/**
 * Company News — real-time news monitoring via GDELT.
 *
 * GDELT monitors print, broadcast, and web news in 100+ languages,
 * updating every 15 minutes. Returns recent articles mentioning a
 * company with source, date, and tone/sentiment.
 *
 * Free, no auth, global coverage. Works for any country.
 * Data source: GDELT Doc 2.0 API (api.gdeltproject.org)
 */

const GDELT_API = "https://api.gdeltproject.org/api/v2/doc/doc";

/**
 * Phase-4 tail fix (2026-08-17): GDELT rate-limits (HTTP 429) under normal
 * traffic and this executor previously surfaced that straight through as a
 * capability failure with no retry. Same idiom as us-company-data.ts's
 * `fetchSec` — delegate to the shared `withRetry` primitive, whose default
 * retryable-pattern set already covers `/HTTP 429/i`, so a single retry
 * with backoff+jitter (~1s) is enough without widening the shared default
 * or introducing new retry machinery. Only 429 is retried here; any other
 * non-ok status (4xx/5xx) passes straight through to the existing
 * `!resp.ok` handling below, unchanged.
 */
export function fetchGdelt(url: string, fetchImpl: typeof fetch = fetch): Promise<Response> {
  return withRetry(
    async () => {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(25000) });
      if (response.status === 429) {
        throw new Error(`GDELT API returned HTTP 429`);
      }
      return response;
    },
    { maxRetries: 1, baseDelayMs: 1000, slug: "company-news" },
  );
}

const VALID_TIMESPANS = ["1d", "3d", "7d", "14d", "30d"];

registerCapability("company-news", async (input: CapabilityInput) => {
  const companyName = (input.company_name as string)?.trim() ?? "";
  const country = (input.country as string)?.trim() ?? "";
  const timespan = VALID_TIMESPANS.includes(input.timespan as string)
    ? (input.timespan as string)
    : "7d";
  const maxArticles = Math.min(Number(input.max_articles) || 10, 25);

  if (!companyName || companyName.length < 2) {
    throw new Error("'company_name' is required (minimum 2 characters). Provide the company name to search for in global news.");
  }

  // Build GDELT query — quote the company name for exact match
  let query = `"${companyName}"`;
  if (country) {
    query += ` sourcecountry:${country.toUpperCase()}`;
  }

  const params = new URLSearchParams({
    query,
    mode: "artlist",
    maxrecords: String(maxArticles),
    format: "json",
    timespan,
    sort: "datedesc",
  });

  const url = `${GDELT_API}?${params}`;
  const resp = await fetchGdelt(url);

  if (!resp.ok) {
    throw new Error(`GDELT API returned HTTP ${resp.status}. The news search service may be temporarily unavailable. Please try again.`);
  }

  const data = await resp.json() as any;
  const articles = data?.articles || [];

  const results = articles.map((a: any) => ({
    title: a.title || null,
    url: a.url || null,
    source: a.domain || null,
    language: a.language || null,
    country: a.sourcecountry || null,
    date: a.seendate ? formatGdeltDate(a.seendate) : null,
    tone: a.tone != null ? parseTone(a.tone) : null,
    image: a.socialimage || null,
  }));

  // Compute summary sentiment
  const tones = results
    .filter((r: any) => r.tone?.score != null)
    .map((r: any) => r.tone.score);
  const avgTone = tones.length > 0
    ? Math.round((tones.reduce((a: number, b: number) => a + b, 0) / tones.length) * 100) / 100
    : null;

  return {
    output: {
      company_name: companyName,
      timespan,
      articles_found: results.length,
      sentiment_summary: avgTone != null
        ? {
            average_tone: avgTone,
            label: avgTone > 2 ? "positive" : avgTone < -2 ? "negative" : "neutral",
            articles_analyzed: tones.length,
          }
        : null,
      articles: results,
    },
    provenance: {
      source: "GDELT Project (api.gdeltproject.org)",
      fetched_at: new Date().toISOString(),
    },
  };
});

/** Convert GDELT date format (20260412T000000Z) to ISO string */
function formatGdeltDate(gdeltDate: string): string {
  if (!gdeltDate || gdeltDate.length < 8) return gdeltDate;
  const y = gdeltDate.slice(0, 4);
  const m = gdeltDate.slice(4, 6);
  const d = gdeltDate.slice(6, 8);
  const h = gdeltDate.length >= 11 ? gdeltDate.slice(9, 11) : "00";
  const min = gdeltDate.length >= 13 ? gdeltDate.slice(11, 13) : "00";
  return `${y}-${m}-${d}T${h}:${min}:00Z`;
}

/** Parse GDELT tone string into structured sentiment */
function parseTone(tone: unknown): { score: number; label: string } | null {
  const num = typeof tone === "number" ? tone : parseFloat(String(tone));
  if (isNaN(num)) return null;
  return {
    score: Math.round(num * 100) / 100,
    label: num > 2 ? "positive" : num < -2 ? "negative" : "neutral",
  };
}
