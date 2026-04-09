import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
} from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

// ─── Privacy Policy analysis — Browserless + Claude ──────────────────────────

const PRIVACY_PATHS = [
  "/privacy",
  "/privacy-policy",
  "/legal/privacy",
  "/privacypolicy",
  "/legal/privacy-policy",
  "/privacy-notice",
  "/legal/privacy-notice",
  "/data-privacy",
];

/** Try to find a privacy policy page by checking common paths and scanning for links. */
async function findPrivacyPage(baseUrl: string): Promise<{ url: string; text: string }> {
  const parsedUrl = new URL(baseUrl);
  const origin = parsedUrl.origin;

  // First, fetch the base URL and look for privacy links
  const mainHtml = await fetchRenderedHtml(baseUrl);
  const mainText = htmlToText(mainHtml);

  // Look for links to privacy pages in the HTML
  const linkRegex = /<a[^>]*href=["']([^"']*(?:privacy|datenschutz|integritet|confidentialite)[^"']*)["'][^>]*>/gi;
  const foundLinks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(mainHtml)) !== null) {
    foundLinks.push(match[1]);
  }

  // Try found links first
  for (const link of foundLinks) {
    let fullUrl: string;
    try {
      fullUrl = link.startsWith("http") ? link : new URL(link, origin).href;
    } catch {
      continue;
    }

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
  for (const path of PRIVACY_PATHS) {
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

  // Fall back to the main page
  if (mainText.length > 500) {
    return { url: baseUrl, text: mainText };
  }

  throw new Error(`Could not find Privacy Policy page for ${baseUrl}. Tried common paths and scanned for links.`);
}

registerCapability("privacy-policy-analyze", async (input: CapabilityInput) => {
  const rawUrl = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!rawUrl) {
    throw new Error("'url' is required. Provide a company website URL to analyze its Privacy Policy.");
  }

  // Normalize URL
  let url = rawUrl;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  const { url: privacyUrl, text } = await findPrivacyPage(url);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Analyze this privacy policy page. Extract all key information about data handling, user rights, and compliance.

URL: ${privacyUrl}

Page text:
${text.slice(0, 12000)}

Return ONLY valid JSON:
{
  "company_name": "Company name or null",
  "last_updated": "Date the policy was last updated if found, or null",
  "data_collected": ["List of personal information types collected (e.g. 'name', 'email', 'IP address', 'browsing history')"],
  "purposes": ["List of purposes for data collection (e.g. 'service delivery', 'marketing', 'analytics')"],
  "third_parties": ["List of third parties data is shared with (e.g. 'Google Analytics', 'payment processors', 'advertising partners')"],
  "retention_periods": ["How long different data types are kept, or 'not specified'"],
  "user_rights": ["List of rights available to users (e.g. 'access', 'deletion', 'portability', 'rectification', 'objection')"],
  "dpo_contact": "Data Protection Officer email or contact info, or null",
  "legal_basis": ["Legal bases for processing (e.g. 'consent', 'legitimate interest', 'contract performance', 'legal obligation')"],
  "international_transfers": ["Countries or mechanisms for international data transfers (e.g. 'US via Standard Contractual Clauses')"],
  "cookie_usage": "Description of cookie usage or null",
  "children_data": "How children's data is handled or null",
  "gdpr_compliant_signals": ["Positive GDPR compliance indicators found"],
  "ccpa_compliant_signals": ["Positive CCPA compliance indicators found"],
  "missing_elements": ["Elements a complete privacy policy should have but this one doesn't mention"]
}

Be specific and factual. Use null for fields where information is not found. For missing_elements, consider: DPO contact, data retention periods, specific legal bases, international transfer mechanisms, cookie specifics, children's data handling, automated decision-making disclosure, right to lodge complaint with supervisory authority.`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract privacy policy data.");

  const output = JSON.parse(jsonMatch[0]);

  const parsedPrivacyUrl = new URL(privacyUrl);

  return {
    output: { ...output, source_url: privacyUrl },
    provenance: { source: parsedPrivacyUrl.hostname, fetched_at: new Date().toISOString() },
  };
});
