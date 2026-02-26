import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

// Amazon product price via Browserless scraping + Claude extraction
registerCapability("amazon-price", async (input: CapabilityInput) => {
  const product = ((input.url as string) ?? (input.asin as string) ?? (input.product as string) ?? (input.task as string) ?? "").trim();
  if (!product) throw new Error("'url' (Amazon product URL) or 'asin' (Amazon product ID) is required.");

  const marketplace = ((input.marketplace as string) ?? "com").trim().toLowerCase();

  // Build Amazon URL
  let amazonUrl: string;
  if (product.startsWith("http")) {
    amazonUrl = product;
  } else if (/^[A-Z0-9]{10}$/.test(product)) {
    // ASIN
    amazonUrl = `https://www.amazon.${marketplace}/dp/${product}`;
  } else {
    // Search query
    amazonUrl = `https://www.amazon.${marketplace}/s?k=${encodeURIComponent(product)}`;
  }

  const html = await fetchRenderedHtml(amazonUrl);
  const text = htmlToText(html);

  if (text.length < 200) {
    throw new Error("Could not load Amazon page. The page may require CAPTCHA or be unavailable.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `Extract product and pricing information from this Amazon page. Return ONLY valid JSON.

Return JSON:
{
  "product_name": "full product title",
  "asin": "ASIN if visible",
  "price": "current price with currency symbol",
  "price_amount": <numeric price or null>,
  "currency": "USD/EUR/GBP/etc",
  "original_price": "original/list price if on sale, or null",
  "discount_percent": <percentage off or null>,
  "availability": "in stock/out of stock/etc",
  "seller": "sold by",
  "rating": <star rating number or null>,
  "review_count": <number of reviews or null>,
  "is_prime": true/false,
  "brand": "brand name or null"
}

Page text:
${text.slice(0, 10000)}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract product data from Amazon.");

  const output = JSON.parse(jsonMatch[0]);
  output.amazon_url = amazonUrl;
  output.marketplace = `amazon.${marketplace}`;

  return {
    output,
    provenance: { source: `amazon.${marketplace}`, fetched_at: new Date().toISOString() },
  };
});
