import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import { extractJsonWithLlm } from "./lib/llm-extract.js";
import Anthropic from "@anthropic-ai/sdk";

// Price comparison via PriceRunner (Nordic) / Google Shopping + Claude extraction

const NORDIC_COUNTRIES = new Set(["se", "dk", "no", "fi"]);

// A shopping page can yield many offers; 2000 tokens truncated the offer list
// on busy results (3/3 production failures, x402 traffic 2026-06-17→24). 4000
// (~16KB JSON) covers a long offer list with headroom while staying well
// under Haiku 4.5's 64K output limit.
const MAX_OUTPUT_TOKENS = 4000;

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

  // The former Google Shopping fallback is GONE (P2 review H-2, 2026-08-12):
  // google.com/search is on the ToS blocklist (DEC-20260427-H-4), and the
  // fetch-layer gate now refuses it — keeping the branch would have made
  // every non-Nordic call a silent, breaker-invisible failure. Coverage is
  // honestly Nordic-only until a licensed price source is added; the
  // manifest limitation says so.
  if (!isNordic) {
    throw new Error(
      `Price comparison currently covers Nordic countries only (SE/NO/DK/FI) via PriceRunner. ` +
        `"${country}" is not supported — no licensed price source exists for it yet.`,
    );
  }
  const prTld = getPriceRunnerTld(country);
  if (!prTld) {
    throw new Error(`No PriceRunner site for country "${country}". Supported: SE, NO, DK, FI.`);
  }
  const prUrl = `https://www.pricerunner.${prTld}/search?q=${encodeURIComponent(product)}`;
  const html = await fetchRenderedHtml(prUrl);
  pageText = htmlToText(html).slice(0, 12000);
  sourceUsed = `pricerunner.${prTld}`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  // Truncation surfaced as "Unterminated string in JSON" via the naive
  // parser (production incident, 2026-06-17→24). extractJsonWithLlm's
  // stop_reason check catches it before the parse and throws a
  // CapabilityRefusalError (caller_input) rather than the plain Error this
  // used to throw — the plain Error classified as `internal` under
  // transaction-failure-taxonomy.ts, the same misclassification PR #314
  // fixed on web-extract.
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: MAX_OUTPUT_TOKENS,
    prompt: `Extract price comparison data from this shopping page. Return ONLY valid JSON.

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
    truncationGuidance: "Retry with a smaller or more focused request — fewer offers per call.",
    parseFailureError: () => new Error("Failed to extract price comparison data."),
  });

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
