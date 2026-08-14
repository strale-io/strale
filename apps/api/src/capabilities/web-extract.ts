import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";
import { validateUrl } from "../lib/url-validator.js";
import { assertTargetAllowed } from "./lib/tos-blocklist.js";
import { extractJsonObject } from "./lib/llm-json.js";

registerCapability("web-extract", async (input: CapabilityInput) => {
  const url = input.url as string | undefined;
  const extract = (input.extract as string) || (input.task as string) || "";

  if (!url) {
    throw new Error(
      "'url' is required. Provide the URL of the web page to extract data from.",
    );
  }

  // F-0-006: the URL is forwarded to Browserless, which does the fetch
  // from its own network. Our `safeFetch` dispatcher cannot protect that
  // outbound call. The only layer we control is THIS validator: if it
  // rejects the URL we never pass it along. Private IP / carrier-grade
  // NAT / cloud metadata / non-http schemes are refused here before
  // Browserless is even contacted.
  // Per-source ToS policy applies to EVERY fetch path, not only the purpose-
  // built extractors. Observed bypass (2026-08-12 activity analysis): a caller
  // refused on Trustpilot via product-reviews-extract re-ran the identical
  // extraction through web-extract with a raw prompt. Same blocklist, same
  // refusal, same compliant-alternative hint — closing the side door
  // commit 87b84db already flagged once for domain-contact-extract.
  // (Pure string check — runs before the DNS-touching validateUrl.)
  assertTargetAllowed(url);

  await validateUrl(url);

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

  // Step 1: Render page with Browserless
  // buildBrowserlessRequestUrl appends ?launch= per-request — Browserless v2's
  // LAUNCH_ARGS env var is deprecated/ignored. See lib/browserless-launch.ts.
  const { buildBrowserlessRequestUrl } = await import("../lib/browserless-launch.js");
  const contentUrl = buildBrowserlessRequestUrl(browserlessUrl, "/content", browserlessKey);

  // unguarded-fetch-ok: our Browserless endpoint; caller URL gated by assertTargetAllowed above
  const renderResponse = await fetch(contentUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      // 25s matches every other Browserless caller (annual-report-extract,
      // html-to-pdf, screenshot-url) and web-provider's default pageTimeout.
      // Was 20s, the odd one out. Note this only helps pages that are slow but
      // alive — an unreachable host burns the whole budget either way.
      gotoOptions: { waitUntil: "networkidle0", timeout: 25000 },
    }),
    // Outer budget stays 10s above the navigation timeout so Browserless gets
    // to return its own structured error instead of us aborting the socket.
    signal: AbortSignal.timeout(35000),
  });

  if (!renderResponse.ok) {
    const errText = await renderResponse.text().catch(() => "");
    throw new Error(
      `Failed to render page: Browserless returned HTTP ${renderResponse.status}: ${errText.slice(0, 200)}`,
    );
  }

  let html = await renderResponse.text();

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
