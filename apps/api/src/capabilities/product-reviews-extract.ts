import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

// Product review extraction from Amazon, Trustpilot, Google, etc. via Browserless + Claude

registerCapability("product-reviews-extract", async (input: CapabilityInput) => {
  const url =
    ((input.url as string) ?? (input.product_url as string) ?? (input.task as string) ?? "").trim();
  if (!url) {
    throw new Error(
      "'url' or 'product_url' is required. Provide an Amazon, Trustpilot, or other product review page URL.",
    );
  }

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;

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

  return {
    output,
    provenance: {
      source: domain,
      fetched_at: new Date().toISOString(),
    },
  };
});
