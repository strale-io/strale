import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";
import { assertTargetAllowed } from "./lib/tos-blocklist.js";
import { extractJsonObject } from "./lib/llm-json.js";
import { fetchRenderedHtml } from "./lib/browserless-extract.js";

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
  // — retry with exponential backoff, a 5-minute response cache, and a
  // concurrency limiter on top of Browserless, the same resilience the other
  // 47+ Browserless-backed capabilities get. web-extract's output contract
  // promises full JavaScript rendering (manifest: "Handles SPAs, dynamic
  // content, and pages that require JS to load", data_source: "Headless
  // browser rendering via Browserless.io"), so skipFallback bypasses
  // web-provider's plain-fetch and Jina Reader tiers — neither runs the
  // page's JS, and Jina reformats the document, which would silently change
  // both the extracted content and the <title> this capability parses out.
  // waitUntil/pageTimeout/fetchTimeout reproduce the previous bare-fetch call
  // exactly (networkidle0, 25s nav timeout, 35s outer budget).
  let html = await fetchRenderedHtml(url, {
    waitUntil: "networkidle0",
    pageTimeout: 25000,
    fetchTimeout: 35000,
    skipFallback: true,
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
    max_tokens: 4000,
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

  const responseText =
    response.content[0].type === "text" ? response.content[0].text : "";

  const parsed = extractJsonObject(responseText);
  if (!parsed) {
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
