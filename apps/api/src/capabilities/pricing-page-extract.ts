import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("pricing-page-extract", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' is required. Provide a SaaS pricing page URL.");

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  const html = await fetchRenderedHtml(fullUrl);
  const pageText = htmlToText(html).slice(0, 10000);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Extract pricing information from this SaaS pricing page. Return ONLY valid JSON.

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
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract pricing data.");

  const output = JSON.parse(jsonMatch[0]);
  output.url = fullUrl;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
