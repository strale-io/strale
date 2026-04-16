import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";
import { validateUrl } from "../lib/url-validator.js";

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
  const contentUrl = `${browserlessUrl}/content?token=${browserlessKey}`;

  const renderResponse = await fetch(contentUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      gotoOptions: { waitUntil: "networkidle0", timeout: 20000 },
    }),
    signal: AbortSignal.timeout(30000),
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

  // Strip code fences if present
  const jsonStr = responseText
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(
      `Failed to parse extraction result as JSON. Raw response: ${responseText.slice(0, 300)}`,
    );
  }

  return {
    output: {
      data: parsed,
      page_title: pageTitle,
      source_url: url,
    },
    provenance: {
      source: `web-extract:${parsedUrl.hostname}`,
      fetched_at: new Date().toISOString(),
    },
  };
});
