import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

// Price comparison via PriceRunner (Nordic) / Google Shopping + Claude extraction

const NORDIC_COUNTRIES = new Set(["se", "dk", "no", "fi"]);

function getPriceRunnerTld(country: string): string | null {
  switch (country) {
    case "se": return "se";
    case "dk": return "dk";
    default: return null;
  }
}

registerCapability("price-compare", async (input: CapabilityInput) => {
  const product =
    ((input.product as string) ?? (input.query as string) ?? (input.ean as string) ?? (input.task as string) ?? "").trim();
  if (!product) {
    throw new Error(
      "'product' or 'query' is required. Provide a product name or EAN to compare prices.",
    );
  }

  const country = ((input.country as string) ?? "se").trim().toLowerCase();
  const isNordic = NORDIC_COUNTRIES.has(country);

  let pageText = "";
  let sourceUsed = "";

  // Try PriceRunner first for Nordic countries
  if (isNordic) {
    const prTld = getPriceRunnerTld(country);
    if (prTld) {
      try {
        const prUrl = `https://www.pricerunner.${prTld}/search?q=${encodeURIComponent(product)}`;
        const html = await fetchRenderedHtml(prUrl);
        pageText = htmlToText(html).slice(0, 12000);
        sourceUsed = `pricerunner.${prTld}`;
      } catch {
        // Fall through to Google Shopping
      }
    }
  }

  // Fallback to Google Shopping
  if (!pageText) {
    const gsUrl = `https://www.google.com/search?q=${encodeURIComponent(product)}&tbm=shop`;
    const html = await fetchRenderedHtml(gsUrl);
    pageText = htmlToText(html).slice(0, 12000);
    sourceUsed = "google.com/shopping";
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Extract price comparison data from this shopping page. Return ONLY valid JSON.

Product searched: "${product}"
Source: ${sourceUsed}

Page text:
${pageText}

Return JSON:
{
  "product_name": "matched product name",
  "prices": [
    {
      "merchant": "store name",
      "price": 299,
      "currency": "SEK",
      "url": "https://...",
      "in_stock": true,
      "shipping": "free"
    }
  ],
  "lowest_price": { "merchant": "...", "price": 279, "currency": "SEK" },
  "highest_price": { "merchant": "...", "price": 349, "currency": "SEK" },
  "average_price": 310,
  "price_range": 70,
  "total_offers": 5
}

Extract all visible offers. Calculate lowest, highest, average and range from the extracted prices. Use null for missing fields.`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract price comparison data.");

  const output = JSON.parse(jsonMatch[0]);
  output.source = sourceUsed;
  output.country = country;

  return {
    output,
    provenance: {
      source: sourceUsed,
      fetched_at: new Date().toISOString(),
    },
  };
});
