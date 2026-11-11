import { createAnthropicClient } from "../lib/anthropic-client.js";
import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import type Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";
import { UpstreamUnavailableError } from "../lib/upstream-result.js";

/**
 * Below this much visible text the render is a shell, not a pricing page.
 * Same floor as gdpr-fine-lookup and container-track.
 */
const MIN_PAGE_TEXT = 200;

/**
 * The caller's page rendered, but not as a page that can answer: an empty
 * app shell, or (as the model reports it) a cookie, consent or login wall,
 * an error or maintenance page (2026-11-06 swallowed-failures audit, row 5).
 * Before, each came back as a billed `plans: []`, which reads as "this
 * product publishes no prices". Now the call throws, unbilled. The page is
 * the caller's target, not a source Strale depends on, so the wording ("URL
 * did not answer") is one the breaker's USER_INPUT_ERROR_PATTERNS recognise:
 * one caller's walled site must not suspend the capability for everyone.
 * Not retryable: the same URL serves the same wall.
 *
 * `targetFault` (out of the quality floor) is set only for the deterministic
 * empty render. The model's `page_error` is a judgement: a prompt or model
 * regression would show up only as more of them, so those still count
 * against the capability (PR #1018 review round 2, S-b).
 */
function unreadablePage(
  fullUrl: string,
  what: string,
  code: string,
  targetFault: boolean,
): UpstreamUnavailableError {
  return new UpstreamUnavailableError(
    `website ${new URL(fullUrl).hostname}`,
    `URL did not answer with a readable pricing page: ${what}.`,
    { code, retryable: false, targetFault },
  );
}

registerCapability("pricing-page-extract", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' is required. Provide a SaaS pricing page URL.");

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  const html = await fetchRenderedHtml(fullUrl);
  const pageText = htmlToText(html).slice(0, 10000);
  if (pageText.trim().length < MIN_PAGE_TEXT) {
    throw unreadablePage(fullUrl, "it rendered almost no text (an empty app shell or a blank page)", "empty", true);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = createAnthropicClient({ apiKey });
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
  "page_status": "pricing" if the page shows prices or plans, even behind a cookie banner, consent overlay or popup (visible prices always mean "pricing"), "no_pricing" if it is a real page for the product that publishes no prices (for example only "Contact sales"), or "page_error" if it is a cookie or consent wall, a login wall, an error or maintenance page, or an app shell with no product content at all,
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
}

If page_status is "page_error", return "plans": [] and false for every boolean.`,
    truncationGuidance: "This pricing page produced more plans than fit in one call.",
    parseFailureError: () => new Error("Failed to extract pricing data."),
  });
  // The model's page_error is honoured only when it found no plan: a page
  // that shows prices under a cookie banner is a pricing page, and dropping
  // the plans it read would fail a call that has an answer (PR #1018 review, S4).
  // It is then billed as "pricing", the manifest's enum being [pricing, no_pricing].
  const plans = output.plans;
  if (output.page_status === "page_error") {
    if (!Array.isArray(plans) || plans.length === 0) {
      throw unreadablePage(
        fullUrl,
        "it showed a cookie, consent or login wall, an error page or an empty app shell instead of the product's pricing",
        "page_error",
        false,
      );
    }
    output.page_status = "pricing";
  }
  output.url = fullUrl;


  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
