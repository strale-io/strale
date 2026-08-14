import Anthropic from "@anthropic-ai/sdk";
import { CapabilityRefusalError } from "../../lib/capability-refusal.js";

/**
 * Shared Browserless scraping + Claude extraction utility for company registries.
 * Used by country-specific executors that don't have free JSON APIs.
 *
 * fetchRenderedHtml and getBrowserlessConfig are re-exported from web-provider.ts
 * which adds retry, caching, and resilience. All 47+ consumers get the upgrade
 * without changing their imports.
 *
 * F-0-006: web-provider.ts validates the URL at the top of fetchPage (and
 * runs plain fetches through safeFetch), so every caller of this file
 * inherits SSRF protection automatically. No call site here needs to
 * call validateUrl explicitly.
 */

export {
  fetchRenderedHtml,
  fetchRenderedHtmlFresh,
  fetchCompanyPage,
  fetchPage,
  getBrowserlessConfig,
} from "./web-provider.js";
export type { WebProviderOptions, WebProviderResult } from "./web-provider.js";

/** Strip HTML to plain text for LLM extraction. */
export function htmlToText(html: string): string {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<\/?(p|div|tr|td|th|li|h[1-6]|dt|dd|section|br)[^>]*>/gi, "\n");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/\u00a0/g, " ");
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n\s*\n/g, "\n");
  return text.trim().slice(0, 15000); // Limit for LLM context
}

/** Use Claude Haiku to extract structured company data from registry page text. */
export async function extractCompanyFromText(
  text: string,
  country: string,
  searchTerm: string,
): Promise<Record<string, unknown>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: `Extract structured company data from this ${country} company registry page. The search was for: "${searchTerm}".

Return ONLY valid JSON with these fields (use null for missing data):
{
  "company_name": "string",
  "registration_number": "string",
  "business_type": "string (e.g. Ltd, GmbH, SA, BV)",
  "address": "string",
  "registration_date": "string or null",
  "status": "active|inactive|dissolved|unknown",
  "industry": "string or null",
  "directors": "string or null"
}

Registry page text:
${text.slice(0, 12000)}`,
      },
    ],
  });

  const content = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not extract company data for "${searchTerm}" from ${country} registry.`);
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error(`Failed to parse extracted company data for "${searchTerm}".`);
  }
}

/** Extract company name from natural language using Claude Haiku. */
export async function extractCompanyName(
  naturalLanguage: string,
  country: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content:
          `Extract the ${country} company name from this request. ` +
          `Return ONLY the company name, nothing else. ` +
          `If the request does not name a specific company, return exactly ${NO_NAME_SENTINEL}.` +
          `\n\nRequest: "${naturalLanguage}"`,
      },
    ],
  });

  const name =
    response.content[0].type === "text"
      ? response.content[0].text.trim().replace(/^["']|["']$/g, "")
      : "";

  if (!name || name === NO_NAME_SENTINEL || looksLikeRefusal(name)) {
    throw new CapabilityRefusalError(
      `Could not identify a specific ${country} company name in the request. ` +
        `Provide the company's registration number, or a more specific company name.`,
    );
  }
  return name;
}

/** Sentinel the model is asked to return when the request names no company. */
const NO_NAME_SENTINEL = "NONE";

/**
 * Does this look like prose rather than a company name?
 *
 * The prompt asks for a bare name, but the model sometimes declines in a
 * sentence instead — "I cannot extract a Canadian company name from this
 * request. 'Bank' is too generic…". Nothing used to catch that, so the refusal
 * became the search query and surfaced to the caller quoted inside another
 * error: `No Canadian company found matching "I cannot extract a…"`. That reads
 * as a malfunction, leaks that an LLM is in the path, and tells the caller
 * nothing about what to send instead.
 *
 * The sentinel handles the cooperative case; this is the backstop for when the
 * model ignores it. Deliberately conservative — real names are short and rarely
 * open with these phrases, and a false positive only costs a clear error where
 * the lookup would have failed anyway.
 */
function looksLikeRefusal(text: string): boolean {
  if (text.length > 120) return true;
  return /^(i cannot|i can't|i am unable|i'm unable|sorry|unfortunately|there is no|no specific|the request)/i.test(
    text,
  );
}
