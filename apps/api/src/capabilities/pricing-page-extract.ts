import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("pricing-page-extract", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' is required. Provide a SaaS pricing page URL.");

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  const html = await fetchRenderedHtml(fullUrl);
  const pageText = htmlToText(html).slice(0, 10000);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 1500,
    prompt: `Extract pricing information from this SaaS pricing page. Return ONLY valid JSON.

URL: ${fullUrl}

Page text:
${pageText}

Return JSON:
{
  "plans": [
    {
      "name": "plan name",
      "price": "price string (e.g. '$29/mo')",
      "price_amount": <number or null>,
      "currency": "USD/EUR/etc",
      "billing_period": "monthly/yearly/one-time",
      "features": ["list of features"],
      "highlighted": <true if this is the recommended/popular plan>
    }
  ],
  "enterprise_cta": <true/false if there's a "Contact Sales" tier>,
  "free_trial_available": <true/false>,
  "free_tier_available": <true/false>,
  "money_back_guarantee": <true/false>,
  "annual_discount": "string or null (e.g. 'Save 20%')",
  "pricing_model": "per-seat/flat-rate/usage-based/tiered/freemium"
}`,
    truncationGuidance: "This pricing page produced more plans than fit in one call.",
    parseFailureError: () => new Error("Failed to extract pricing data."),
  });
  output.url = fullUrl;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
