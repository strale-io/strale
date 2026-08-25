import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("competitor-compare", async (input: CapabilityInput) => {
  const domain1 = ((input.domain1 as string) ?? (input.company1 as string) ?? "").trim();
  const domain2 = ((input.domain2 as string) ?? (input.company2 as string) ?? "").trim();
  if (!domain1 || !domain2) throw new Error("'domain1' and 'domain2' are required.");

  const url1 = domain1.startsWith("http") ? domain1 : `https://${domain1}`;
  const url2 = domain2.startsWith("http") ? domain2 : `https://${domain2}`;

  // Scrape both sites in parallel
  const [html1, html2] = await Promise.all([
    fetchRenderedHtml(url1),
    fetchRenderedHtml(url2),
  ]);

  const text1 = htmlToText(html1).slice(0, 6000);
  const text2 = htmlToText(html2).slice(0, 6000);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: "claude-haiku-4-5-20251001",
    maxTokens: 2000,
    // Deterministic extraction: the same pair of sites should yield the same
    // comparison. A paying customer ran one input four times on 2026-08-23/25
    // and got four different answers at €1.00 each — that was sampling at the
    // API-default temperature, not a malfunction, and it reads as
    // unreliability on a platform whose product is trust.
    temperature: 0,
    prompt: `Compare these two competitor websites. Return ONLY valid JSON.

COMPANY A: ${url1}
${text1}

COMPANY B: ${url2}
${text2}

Return JSON:
{
  "company_a": { "domain": "${domain1}", "name": "detected name", "tagline": "main value prop" },
  "company_b": { "domain": "${domain2}", "name": "detected name", "tagline": "main value prop" },
  "comparison": {
    "positioning": { "company_a": "string", "company_b": "string", "analysis": "string" },
    "target_audience": { "company_a": "string", "company_b": "string", "analysis": "string" },
    "pricing_model": { "company_a": "string or unknown", "company_b": "string or unknown" },
    "feature_emphasis": { "company_a": ["top features"], "company_b": ["top features"] },
    "trust_signals": { "company_a": ["signals"], "company_b": ["signals"] },
    "content_strategy": { "company_a": "string", "company_b": "string" }
  },
  "strategic_analysis": "2-3 paragraph strategic comparison",
  "key_differentiators": ["list of main differences"],
  "competitive_advantages": { "company_a": ["advantages"], "company_b": ["advantages"] }
}`,
    truncationGuidance: "Compare fewer aspects per call, or two smaller sites.",
    parseFailureError: () => new Error("Failed to compare competitors."),
  });
  output.disclaimer = "AI-generated competitive analysis. Verify specific claims independently.";

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
