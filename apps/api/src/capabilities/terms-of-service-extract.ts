import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
} from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

// ─── Terms of Service extraction — Browserless + Claude ──────────────────────

const TOS_PATHS = [
  "/terms",
  "/terms-of-service",
  "/tos",
  "/legal/terms",
  "/terms-and-conditions",
  "/legal/terms-of-service",
  "/legal/tos",
];

/** Try to find a ToS page by checking common paths and scanning the page for links. */
async function findTosPage(baseUrl: string): Promise<{ url: string; text: string }> {
  const parsedUrl = new URL(baseUrl);
  const origin = parsedUrl.origin;

  // First, fetch the base URL and look for terms links
  const mainHtml = await fetchRenderedHtml(baseUrl);
  const mainText = htmlToText(mainHtml);

  // Look for links to terms pages in the HTML
  const linkRegex = /<a[^>]*href=["']([^"']*(?:terms|tos|legal)[^"']*)["'][^>]*>/gi;
  const foundLinks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(mainHtml)) !== null) {
    foundLinks.push(match[1]);
  }

  // Try found links first (most likely to be the actual ToS page)
  for (const link of foundLinks) {
    let fullUrl: string;
    try {
      fullUrl = link.startsWith("http") ? link : new URL(link, origin).href;
    } catch {
      continue;
    }

    // Skip if same as base URL
    if (fullUrl === baseUrl) continue;

    try {
      const html = await fetchRenderedHtml(fullUrl);
      const text = htmlToText(html);
      if (text.length > 500) {
        return { url: fullUrl, text };
      }
    } catch {
      // Try next link
    }
  }

  // Try common paths
  for (const path of TOS_PATHS) {
    const tryUrl = `${origin}${path}`;
    if (tryUrl === baseUrl) continue;

    try {
      const html = await fetchRenderedHtml(tryUrl);
      const text = htmlToText(html);
      if (text.length > 500) {
        return { url: tryUrl, text };
      }
    } catch {
      // Try next path
    }
  }

  // Fall back to the main page if it has enough content
  if (mainText.length > 500) {
    return { url: baseUrl, text: mainText };
  }

  throw new Error(`Could not find Terms of Service page for ${baseUrl}. Tried common paths and scanned for links.`);
}

registerCapability("terms-of-service-extract", async (input: CapabilityInput) => {
  const rawUrl = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!rawUrl) {
    throw new Error("'url' is required. Provide a company website URL to extract Terms of Service.");
  }

  // Normalize URL
  let url = rawUrl;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  const { url: tosUrl, text } = await findTosPage(url);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Extract key Terms of Service information from this page. Analyze carefully for important clauses, rights, and restrictions.

URL: ${tosUrl}

Page text:
${text.slice(0, 12000)}

Return ONLY valid JSON:
{
  "company_name": "Company name or null",
  "last_updated": "Date the ToS was last updated if found, or null",
  "governing_law": "Governing law jurisdiction or null",
  "arbitration_clause": true/false,
  "class_action_waiver": true/false,
  "termination_conditions": ["List of conditions under which the service/account can be terminated"],
  "liability_limitations": ["Key liability limitations and disclaimers"],
  "data_collection_practices": ["Data collection practices mentioned in the ToS"],
  "user_rights": ["Rights granted to users"],
  "intellectual_property_notes": ["Key IP-related clauses"],
  "age_restriction": "Minimum age requirement (e.g. '13+', '16+', '18+') or null",
  "key_concerns": ["Noteworthy or unusual clauses that users should be aware of"],
  "readability_score": "simple/moderate/complex"
}

Use null for fields where information is not found. Be specific and factual — extract actual clauses, don't infer.`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract Terms of Service data.");

  const output = JSON.parse(jsonMatch[0]);

  const parsedTosUrl = new URL(tosUrl);

  return {
    output: { ...output, source_url: tosUrl },
    provenance: { source: parsedTosUrl.hostname, fetched_at: new Date().toISOString() },
  };
});
