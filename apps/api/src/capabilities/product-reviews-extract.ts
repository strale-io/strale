import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import { assertTargetAllowed } from "./lib/tos-blocklist.js";
import Anthropic from "@anthropic-ai/sdk";

// Product review extraction from review and product pages via Browserless + Claude.
// Trustpilot is NOT supported — see lib/tos-blocklist.ts.

registerCapability("product-reviews-extract", async (input: CapabilityInput) => {
  const url =
    ((input.url as string) ?? (input.product_url as string) ?? (input.task as string) ?? "").trim();
  if (!url) {
    throw new Error(
      "'url' or 'product_url' is required. Provide a product or review page URL — for example a first-party product page, or a Reviews.io / Feefo listing.",
    );
  }

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;

  // Before any network work: refuse targets whose ToS forbids automated access,
  // so the caller gets a straight answer instead of the target's 403, and we
  // burn no Browserless render or LLM tokens on a request we cannot serve.
  assertTargetAllowed(fullUrl);

  // Extract domain for provenance
  let domain: string;
  try {
    domain = new URL(fullUrl).hostname.replace(/^www\./, "");
  } catch {
    domain = "unknown";
  }

  const html = await fetchRenderedHtml(fullUrl);
  const pageText = htmlToText(html).slice(0, 12000);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Extract product review data from this page. Return ONLY valid JSON.

URL: ${fullUrl}

Page text:
${pageText}

Return JSON:
{
  "product_name": "product name",
  "source": "${domain}",
  "average_rating": 4.3,
  "review_count": 2456,
  "rating_distribution": {
    "5_star": 1200,
    "4_star": 600,
    "3_star": 300,
    "2_star": 200,
    "1_star": 156
  },
  "recent_reviews": [
    {
      "rating": 5,
      "title": "review title",
      "text": "review text (truncated to ~200 chars)",
      "date": "2024-01-15",
      "verified": true
    }
  ],
  "common_pros": ["Good quality", "Fast delivery"],
  "common_cons": ["Expensive", "Fragile"],
  "sentiment_summary": "Overall positive with concerns about price"
}

Extract up to 10 recent reviews. Use null for any fields you cannot determine. Summarize common pros/cons from the reviews.`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract product review data.");

  const output = JSON.parse(jsonMatch[0]);
  output.url = fullUrl;

  // Refuse to bill for an empty extraction.
  //
  // The prompt above tells the model to "use null for any fields you cannot
  // determine", so a page that renders its reviews client-side, or serves a
  // bot-detection interstitial, yields a well-formed object in which every
  // review field is null — and this used to return it as `status: completed`.
  // The customer was charged the full price for a response whose own
  // sentiment_summary read "No review data available on the provided page
  // text". DEC-14 is explicit that we deduct only on success, and an
  // extraction that found no reviews is not a success.
  //
  // Surfaced by the 2026-08-09 ALLOW_MATRIX sweep: this capability's fixture
  // failed 0/6 while the call itself reported success.
  const hasAnyReviewSignal =
    output.average_rating != null ||
    output.review_count != null ||
    (Array.isArray(output.recent_reviews) && output.recent_reviews.length > 0) ||
    (Array.isArray(output.common_pros) && output.common_pros.length > 0) ||
    (Array.isArray(output.common_cons) && output.common_cons.length > 0);

  if (!hasAnyReviewSignal) {
    throw new Error(
      `No review data could be extracted from ${domain}. The page was fetched successfully but ` +
        `contained no readable reviews — this usually means the reviews are rendered client-side, ` +
        `sit behind a bot-detection interstitial, or the URL is not a product page. ` +
        `You were not charged. Try a product page whose reviews are visible in the raw HTML.`,
    );
  }

  return {
    output,
    provenance: {
      source: domain,
      fetched_at: new Date().toISOString(),
    },
  };
});
