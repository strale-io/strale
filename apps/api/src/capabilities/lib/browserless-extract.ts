import Anthropic from "@anthropic-ai/sdk";

/**
 * Shared Browserless scraping + Claude extraction utility for company registries.
 * Used by country-specific executors that don't have free JSON APIs.
 *
 * fetchRenderedHtml and getBrowserlessConfig are re-exported from web-provider.ts
 * which adds retry, caching, and resilience. All 47+ consumers get the upgrade
 * without changing their imports.
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
        content: `Extract the ${country} company name from this request. Return ONLY the company name, nothing else.\n\nRequest: "${naturalLanguage}"`,
      },
    ],
  });

  const name =
    response.content[0].type === "text"
      ? response.content[0].text.trim().replace(/^["']|["']$/g, "")
      : "";
  if (!name) throw new Error(`Could not identify a company name from: "${naturalLanguage}".`);
  return name;
}
