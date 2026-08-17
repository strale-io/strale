import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";
import { assertTargetAllowed } from "./lib/tos-blocklist.js";
import { extractJsonObject } from "./lib/llm-json.js";
import { fetchRenderedHtml } from "./lib/browserless-extract.js";
import { CapabilityRefusalError } from "../lib/capability-refusal.js";

registerCapability("web-extract", async (input: CapabilityInput) => {
  const url = input.url as string | undefined;
  const extract = (input.extract as string) || (input.task as string) || "";

  if (!url) {
    throw new Error(
      "'url' is required. Provide the URL of the web page to extract data from.",
    );
  }

  // Per-source ToS policy applies to EVERY fetch path, not only the purpose-
  // built extractors. Observed bypass (2026-08-12 activity analysis): a caller
  // refused on Trustpilot via product-reviews-extract re-ran the identical
  // extraction through web-extract with a raw prompt. Same blocklist, same
  // refusal, same compliant-alternative hint — closing the side door
  // commit 87b84db already flagged once for domain-contact-extract.
  // (Pure string check — runs before fetchRenderedHtml's DNS-touching
  // validateUrl, same ordering rationale as every other web-provider caller.)
  assertTargetAllowed(url);

  const browserlessUrl = process.env.BROWSERLESS_URL;
  const browserlessKey = process.env.BROWSERLESS_API_KEY;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!browserlessUrl || !browserlessKey) {
    throw new Error(
      "BROWSERLESS_URL and BROWSERLESS_API_KEY are required for web-extract.",
    );
  }
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for web-extract.");
  }

  // Step 1: Render page via the shared web-provider layer (lib/web-provider.ts)
  // — retry with exponential backoff and a concurrency limiter on top of
  // Browserless, the same resilience the other 47+ Browserless-backed
  // capabilities get. web-extract's output contract promises full
  // JavaScript rendering (manifest: "Handles SPAs, dynamic content, and
  // pages that require JS to load", data_source: "Headless browser
  // rendering via Browserless.io"), so skipFallback bypasses web-provider's
  // plain-fetch and Jina Reader tiers — neither runs the page's JS, and
  // Jina reformats the document, which would silently change both the
  // extracted content and the <title> this capability parses out.
  // waitUntil/pageTimeout/fetchTimeout reproduce the previous bare-fetch call
  // exactly (networkidle0, 25s nav timeout, 35s outer budget).
  // minHtmlLength: 50 reproduces web-extract's own pre-existing threshold —
  // the shared layer's default (100) would otherwise silently tighten it
  // (external review finding, 2026-08-16). The redundant local length guard
  // right below is kept as a defense-in-depth backstop, not the enforcement
  // point.
  // skipCache: true — this capability's manifest declares
  // freshness_category: live-fetch and stamps provenance.fetched_at at
  // return time unconditionally. A cache hit would return HTML rendered up
  // to 5 minutes earlier stamped with a fresh timestamp — fabricated
  // provenance on every repeat call within the TTL (six-lens review,
  // HIGH, 2026-08-16). The retry/backoff resilience is the value of this
  // whole change, not the cache, so this capability opts out of caching
  // entirely rather than reconciling the timestamp with cache age.
  // maxRetries: 2 (one retry, matching the shared default — see the
  // "maxRetries" note in the fix report for why this is 2, not 1) bounds
  // the Browserless leg's worst case at 2 attempts × 35s fetchTimeout +
  // ~1-1.5s backoff between ≈ 71.5s.
  let html = await fetchRenderedHtml(url, {
    waitUntil: "networkidle0",
    pageTimeout: 25000,
    fetchTimeout: 35000,
    skipFallback: true,
    minHtmlLength: 50,
    skipCache: true,
    maxRetries: 2,
  });

  if (!html || html.length < 50) {
    throw new Error("Page returned empty or too-short content.");
  }

  // Step 2: Strip HTML to text for the LLM (reduce token usage)
  // Remove scripts, styles, and SVG
  html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  html = html.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "");

  // Get title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const pageTitle = titleMatch ? titleMatch[1].trim() : "";

  // Convert to text, preserving some structure
  let text = html
    .replace(/<\/?(p|div|tr|li|h[1-6]|article|section|header|footer|main|nav|blockquote)[^>]*>/gi, "\n")
    .replace(/<\/?(td|th)[^>]*>/gi, "\t")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ");

  // Collapse whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  // Truncate to ~100k chars to stay within LLM context
  const MAX_CHARS = 100000;
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS) + "\n\n[Content truncated]";
  }

  // Step 3: Send to Claude for extraction
  const extractionPrompt = extract
    ? `Extract the following data from this web page and return it as structured JSON:\n\n${extract}`
    : "Extract the main content and key data from this web page and return it as structured JSON.";

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: `${extractionPrompt}

Page URL: ${url}
Page Title: ${pageTitle}

--- PAGE CONTENT ---
${text}
--- END PAGE CONTENT ---

Return ONLY valid JSON. No markdown, no explanation, no code fences. Just the JSON object.`,
      },
    ],
  });

  // Check BEFORE attempting to parse. A response cut off at max_tokens is
  // truncated mid-JSON, so extractJsonObject correctly returns null (the
  // object never closes — unbalanced braces), and the old code fell through
  // to the generic parse-failure error below. That error text contains
  // "failed to parse", which transaction-failure-taxonomy.ts's INTERNAL_RE
  // classifies as `internal` — our fault — so the quality floor (DEC-20260812-A)
  // counted these as capability failures and quarantined web-extract in
  // production on 2026-08-17 after six paid x402 calls hit this in 5 minutes,
  // all six were a ~100-name roster page that legitimately needed more than
  // 4000 output tokens. The fix is two-part: raise the budget (4000 -> 16000)
  // so most legitimate extractions fit, AND refuse distinctly when the model
  // still runs out, so the caller gets actionable guidance instead of a raw
  // parse error, and the failure is attributed to the request's scope (caller
  // input) rather than to us.
  if (response.stop_reason === "max_tokens") {
    throw new CapabilityRefusalError(
      "Extraction result too large for one call: the output exceeded the per-call budget before completing. " +
        "Narrow your 'extract' instruction or split the request (e.g. one page or one section at a time).",
    );
  }

  const responseText =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  const parsed = extractJsonObject(responseText);
  if (!parsed) {
    // Genuinely malformed (non-truncation) output — the model returned
    // something that isn't recoverable JSON even though it had room to
    // finish. This stays a plain Error: it's our parsing/prompting problem,
    // not the caller's request being too large, so it must keep classifying
    // as `internal` in the taxonomy.
    throw new Error(
      `Failed to parse extraction result as JSON. Raw response: ${responseText.slice(0, 300)}`,
    );
  }

  // Deliberately no empty-extraction guard here, unlike the sibling
  // extractors. `extract` is a free-text instruction, so "the field you asked
  // for is not on this page" is a legitimate negative answer rather than a
  // failure — and the response still carries `page_title`, so both fields the
  // manifest declares guaranteed are populated even when `data` is empty.
  // Throwing would turn a billed 200 into an error for a single-field ask
  // that legitimately found nothing.

  return {
    output: {
      data: parsed,
      page_title: pageTitle,
      source_url: url,
    },
    provenance: {
      source: `web-extract:${new URL(url).hostname}`,
      fetched_at: new Date().toISOString(),
    },
  };
});
