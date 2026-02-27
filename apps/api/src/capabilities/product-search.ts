import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

// Google Shopping product search via Browserless + Claude extraction

registerCapability("product-search", async (input: CapabilityInput) => {
  const query =
    ((input.query as string) ?? (input.product as string) ?? (input.task as string) ?? "").trim();
  if (!query) {
    throw new Error(
      "'query' or 'product' is required. Provide a product search term (e.g. 'Sony WH-1000XM5 headphones').",
    );
  }

  const country = ((input.country as string) ?? "com").trim().toLowerCase();
  const tld = country === "com" ? "com" : country;
  const searchUrl = `https://www.google.${tld}/search?q=${encodeURIComponent(query)}&tbm=shop&hl=en`;

  const html = await fetchRenderedHtml(searchUrl);
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
        content: `Extract product listings from this Google Shopping results page. Return ONLY valid JSON.

Search query: "${query}"

Page text:
${pageText}

Return JSON:
{
  "query": "${query}",
  "products": [
    {
      "title": "product name",
      "price": "€29.99",
      "price_amount": 29.99,
      "currency": "EUR",
      "merchant": "Amazon",
      "url": "https://...",
      "rating": 4.5,
      "review_count": 123
    }
  ],
  "total_results_estimate": 1000
}

Extract as many products as visible. Use null for missing fields. If no products found, return an empty products array.`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract product listings from Google Shopping.");

  const output = JSON.parse(jsonMatch[0]);
  output.search_url = searchUrl;

  return {
    output,
    provenance: {
      source: "google.com/shopping",
      fetched_at: new Date().toISOString(),
    },
  };
});
