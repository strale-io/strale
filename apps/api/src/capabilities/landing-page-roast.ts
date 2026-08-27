import { registerCapability, type CapabilityInput } from "./index.js";
import { extractJsonObject } from "./lib/llm-json.js";
import { assertTargetAllowed } from "../lib/tos-blocklist.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import { getBrowserlessConfig } from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";
import { browserlessFetch } from "../lib/metered-vendor-fetch.js";

registerCapability("landing-page-roast", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' is required.");

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  // ToS gate BEFORE the screenshot leg — it fired ahead of the gated render
  // path (legal audit 2026-08-12).
  assertTargetAllowed(fullUrl);

  // Get screenshot via Browserless
  const { url: blessUrl, key } = getBrowserlessConfig();
  // unguarded-fetch-ok: our Browserless /screenshot endpoint; caller URL gated by assertTargetAllowed above
  const screenshotRes = await browserlessFetch(`${blessUrl}/screenshot?token=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: fullUrl,
      gotoOptions: { waitUntil: "networkidle0", timeout: 20000 },
      options: { fullPage: false, type: "png" },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!screenshotRes.ok) throw new Error(`Browserless screenshot failed: HTTP ${screenshotRes.status}`);
  const screenshotBuf = Buffer.from(await screenshotRes.arrayBuffer());
  const screenshotB64 = screenshotBuf.toString("base64");

  // Also get HTML text for additional context
  const html = await fetchRenderedHtml(fullUrl);
  const pageText = htmlToText(html).slice(0, 6000);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: screenshotB64 },
          },
          {
            type: "text",
            text: `You are a conversion rate optimization expert. Analyze this landing page screenshot and text content. Return ONLY valid JSON.

URL: ${fullUrl}

Page text (first 6000 chars):
${pageText}

Return JSON:
{
  "overall_score": <1-100>,
  "headline_effectiveness": <1-100>,
  "cta_clarity": <1-100>,
  "value_proposition_score": <1-100>,
  "trust_signals": ["list of trust signals found"],
  "issues": ["list of conversion-killing issues"],
  "suggestions": ["prioritized improvement suggestions"],
  "mobile_readiness": "good/fair/poor",
  "summary": "2-3 sentence overall assessment"
}`,
          },
        ],
      },
    ],
  });

  const responseText = r.content[0]?.type === "text" ? r.content[0].text.trim() : "";
  const output = extractJsonObject(responseText);
  if (!output) throw new Error("Failed to analyze landing page.");
  output.url = fullUrl;
  output.disclaimer = "AI-generated analysis. Results reflect automated assessment, not guaranteed conversion outcomes.";

  return {
    output,
    provenance: { source: "claude-vision", fetched_at: new Date().toISOString() },
  };
});
