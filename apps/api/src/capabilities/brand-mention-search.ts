import { createAnthropicClient } from "../lib/anthropic-client.js";
import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import { meteredVendorFetch } from "../lib/metered-vendor-fetch.js";
import {
  resolveSerperLinks,
  startSerperBudget,
  usableResultUrl,
} from "../lib/serper-links.js";
import type Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

// Uses Serper.dev API for search (avoids CAPTCHA issues from direct Google scraping)
registerCapability("brand-mention-search", async (input: CapabilityInput) => {
  // One budget for the whole Serper leg, taken before any input work.
  // Round-2 review: the search used to ask for the entire 15 s
  // SYNC_TRANSACTION_WALL_MS and resolution then added its own slice on
  // top, so a slow pair could exceed the wall and the caller would get an
  // infrastructure error instead of this capability's designed answer.
  const budget = startSerperBudget();
  const brandName = ((input.brand_name as string) ?? (input.brand as string) ?? (input.name as string) ?? "").trim();
  if (!brandName) throw new Error("'brand_name' is required.");
  if (brandName.length < 2) throw new Error("'brand_name' must be at least 2 characters.");

  const excludeOwnDomain = (input.exclude_own_domain as string)?.trim();
  const maxResults = Math.min((input.max_results as number) ?? 10, 20);

  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) {
    throw new Error("SERPER_API_KEY is required. Sign up at https://serper.dev (free tier: 2,500 queries/month).");
  }

  // Build search query
  let query = `"${brandName}"`;
  if (excludeOwnDomain) query += ` -site:${excludeOwnDomain}`;

  const res = await meteredVendorFetch("serper", "https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": serperKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: maxResults }),
    signal: AbortSignal.timeout(budget.searchTimeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Serper API error: HTTP ${res.status} ${errText.slice(0, 200)}`);
  }

  const data = await res.json() as Record<string, unknown>;

  // Google wraps organic links past the top three in an opaque
  // `google.com/goto` redirect (2026-10-30). Resolve before the results reach
  // the model: an LLM asked to pass a URL through will pass the wrapper
  // through, and the mention list would cite Google as the source of every
  // mention past position 3.
  await resolveSerperLinks(data, serperKey, undefined, budget.resolveDeadline);

  const organic = (data.organic as Array<Record<string, unknown>>) ?? [];

  if (organic.length === 0) {
    return {
      output: {
        brand_name: brandName,
        query,
        mentions: [],
        total_results_found: 0,
        summary: "No mentions found for this brand.",
      },
      provenance: { source: "google-serper", fetched_at: new Date().toISOString() },
    };
  }

  // Build context from search results for Claude analysis
  // A result whose real URL is unknown is described as such rather than
  // given to the model as an address it would pass through to the caller.
  const resultsText = organic.map((r, i) =>
    `${i + 1}. ${r.title}\n   URL: ${usableResultUrl(r.link) ?? "(unavailable)"}\n   ${r.snippet ?? ""}`
  ).join("\n\n");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = createAnthropicClient({ apiKey });
  // extractJsonWithLlm's stop_reason check now catches the truncation case
  // the old try/catch's "response may have been truncated" message was
  // guessing at — a genuine max_tokens cutoff is refused distinctly, before
  // parsing is attempted at all, so it no longer needs to be inferred from a
  // JSON.parse failure downstream.
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 3000,
    prompt: `Analyze these search results for brand mentions. Return ONLY valid JSON.

Brand name: "${brandName}"
Search query: ${query}

Search results:
${resultsText.slice(0, 6000)}

Return JSON:
{
  "mentions": [
    {
      "url": "result URL",
      "title": "result title",
      "snippet": "result snippet/description",
      "sentiment": "positive/negative/neutral",
      "source_type": "news/blog/forum/social/review/directory/other",
      "relevance": "high/medium/low"
    }
  ],
  "total_results_found": <number>
}`,
    truncationGuidance: "Reduce max_results to shrink the number of search results analyzed per call.",
    parseFailureError: (responseText) =>
      new Error(
        `Failed to extract brand mentions. Raw: ${responseText.slice(0, 200)}`,
      ),
  });
  output.brand_name = brandName;
  output.query = query;

  // Round-2 review: the model is the last writer on this capability's output,
  // and it was handed `URL: (unavailable)` for any result whose link stayed
  // wrapped. Two bad outputs follow from that — the literal string
  // "(unavailable)" in a field a caller will fetch, or, more likely because
  // the title and snippet name the host, a plausible URL the model
  // reconstructed. A fabricated source on an `ai_generated` capability is
  // exactly what DEC-20260428-B forbids: never assert what the input does
  // not support. So every emitted URL is checked against the set of real
  // links that actually came back from Serper, and anything else is nulled
  // and marked rather than trusted.
  const servedUrls = new Set(
    organic.map((r) => usableResultUrl(r.link)).filter((url): url is string => url !== null),
  );
  let fabricated = 0;
  if (Array.isArray(output.mentions)) {
    for (const mention of output.mentions as Array<Record<string, unknown>>) {
      if (typeof mention.url === "string" && servedUrls.has(mention.url)) continue;
      mention.url = null;
      mention.url_unavailable = true;
      fabricated += 1;
    }
  }
  output.unresolved_url_count = fabricated;

  return {
    output,
    provenance: { source: "google-serper", fetched_at: new Date().toISOString() },
  };
});
