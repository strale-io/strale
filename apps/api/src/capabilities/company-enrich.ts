import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";
import { validateUrl } from "../lib/url-validator.js";

const EXTRACTION_PROMPT = `You are a company intelligence extraction system.

From the provided web page content, extract as much of the following as possible:
{
  "company_name": "string",
  "industry": "string (e.g. 'SaaS', 'E-commerce', 'FinTech')",
  "employee_estimate": "string (e.g. '50-200', '1000+')",
  "hq_location": "string (city, country)",
  "description": "string (1-2 sentence summary of what the company does)",
  "social_links": {
    "linkedin": "url or null",
    "twitter": "url or null",
    "github": "url or null"
  },
  "tech_stack": ["string array of technologies if detectable"],
  "founded_year": "number or null",
  "website": "string"
}

Return ONLY valid JSON. If a field cannot be determined, use null.`;

async function scrapeUrl(url: string): Promise<string> {
  // F-0-006: Browserless fetches the URL from its own network, so our
  // undici Dispatcher can't protect that hop. The only layer we own is
  // refusing to forward — validateUrl throws on private IPs / bad schemes.
  await validateUrl(url);

  const browserlessUrl = process.env.BROWSERLESS_URL;
  const browserlessKey = process.env.BROWSERLESS_API_KEY;

  if (!browserlessUrl || !browserlessKey) {
    throw new Error("BROWSERLESS_URL and BROWSERLESS_API_KEY are required.");
  }

  const contentUrl = `${browserlessUrl}/content?token=${browserlessKey}`;
  const response = await fetch(contentUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      gotoOptions: { waitUntil: "networkidle0", timeout: 20000 },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) return "";

  let html = await response.text();
  // Strip to text
  html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  html = html.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "");
  let text = html
    .replace(/<\/?(p|div|tr|li|h[1-6]|article|section)[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Truncate
  if (text.length > 50000) text = text.slice(0, 50000);
  return text;
}

function normalizeDomain(input: string): string {
  let domain = input.trim().toLowerCase();
  // If it looks like an email, extract domain
  if (domain.includes("@")) {
    domain = domain.split("@")[1];
  }
  // Remove protocol if present
  domain = domain.replace(/^https?:\/\//, "");
  // Remove path
  domain = domain.split("/")[0];
  // Remove www
  domain = domain.replace(/^www\./, "");
  return domain;
}

registerCapability("company-enrich", async (input: CapabilityInput) => {
  const rawInput = (input.domain as string) ?? (input.email as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof rawInput !== "string" || !rawInput.trim()) {
    throw new Error("'domain', 'email', or 'company_name' is required.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const domain = normalizeDomain(rawInput);
  const websiteUrl = `https://${domain}`;

  // Scrape the company website
  const websiteText = await scrapeUrl(websiteUrl);
  if (!websiteText) {
    throw new Error(`Could not access website at ${websiteUrl}. Verify the domain is correct.`);
  }

  // Also try the about page
  const aboutText = await scrapeUrl(`${websiteUrl}/about`).catch(() => "");

  const combinedText = [
    `=== WEBSITE (${websiteUrl}) ===`,
    websiteText,
    aboutText ? `\n=== ABOUT PAGE ===\n${aboutText}` : "",
  ].join("\n");

  // Truncate combined text
  const truncated = combinedText.length > 80000
    ? combinedText.slice(0, 80000)
    : combinedText;

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `${EXTRACTION_PROMPT}\n\nDomain: ${domain}\n\n--- PAGE CONTENT ---\n${truncated}\n--- END ---`,
      },
    ],
  });

  const responseText =
    response.content[0].type === "text" ? response.content[0].text : "";
  const jsonStr = responseText
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse enrichment result. Raw: ${responseText.slice(0, 300)}`);
  }

  // Ensure website field
  if (!parsed.website) parsed.website = websiteUrl;

  return {
    output: parsed,
    provenance: {
      source: `company-enrich:${domain}`,
      fetched_at: new Date().toISOString(),
    },
  };
});
