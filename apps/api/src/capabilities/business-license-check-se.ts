import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
} from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

// ─── Swedish business license check via Allabolag.se — Browserless + Claude ──

const ORG_NUMBER_RE = /^(\d{6})-?(\d{4})$/;

function cleanOrgNumber(input: string): string | null {
  const cleaned = input.replace(/[\s-]/g, "");
  if (/^\d{10}$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

function formatOrgNumber(digits: string): string {
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

function findOrgNumber(input: string): string | null {
  const match = input.match(/\d{6}-?\d{4}/);
  if (!match) return null;
  return cleanOrgNumber(match[0]);
}

/** Use Claude to extract a company name from natural language. */
async function extractCompanyName(naturalLanguage: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required for company name resolution.");

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: `Extract the Swedish company name from this request. Return ONLY the company name, nothing else. No quotes, no explanation.\n\nRequest: "${naturalLanguage}"`,
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

/** Search Allabolag for a company name and return its org number. */
async function searchAllabolag(companyName: string): Promise<string> {
  const searchUrl = `https://www.allabolag.se/what/${encodeURIComponent(companyName)}`;
  const html = await fetchRenderedHtml(searchUrl);

  const orgMatch = html.match(/(\d{6})-(\d{4})/);
  if (!orgMatch) {
    throw new Error(`No Swedish company found matching "${companyName}" on Allabolag.se. Try providing a specific organization number.`);
  }

  return `${orgMatch[1]}${orgMatch[2]}`;
}

registerCapability("business-license-check-se", async (input: CapabilityInput) => {
  const rawInput = (
    (input.org_number as string) ??
    (input.company as string) ??
    (input.task as string) ??
    ""
  ).trim();

  if (!rawInput) {
    throw new Error(
      "'org_number' or 'company' is required. Provide a Swedish organization number (e.g. 556703-7485) or company name.",
    );
  }

  // Resolve to a clean 10-digit org number
  let orgDigits = cleanOrgNumber(rawInput) ?? findOrgNumber(rawInput);

  if (!orgDigits) {
    // Try fuzzy: use LLM to extract company name, then search Allabolag
    const companyName = await extractCompanyName(rawInput);
    orgDigits = await searchAllabolag(companyName);
  }

  // Fetch the Allabolag company page
  const targetUrl = `https://www.allabolag.se/${orgDigits}`;
  const html = await fetchRenderedHtml(targetUrl);
  const text = htmlToText(html);

  if (text.length < 200) {
    throw new Error(`Could not load company data for org number ${formatOrgNumber(orgDigits)} from Allabolag.se.`);
  }

  // Use Claude to extract structured business license / registration data
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Extract Swedish company registration and license data from this Allabolag.se page.

Organization number: ${formatOrgNumber(orgDigits)}

Page text:
${text.slice(0, 12000)}

Return ONLY valid JSON:
{
  "company_name": "Full registered company name",
  "org_number": "${formatOrgNumber(orgDigits)}",
  "registration_status": "active/dissolved/bankruptcy/liquidation/unknown",
  "company_type": "AB/HB/KB/EF/Ek.för./Stiftelse/etc.",
  "registered_date": "Date of registration or null",
  "sni_codes": [{"code": "62010", "description": "Computer programming activities"}],
  "f_skatt": true/false or null,
  "moms_registered": true/false or null,
  "employer_registered": true/false or null,
  "registered_address": "Full registered address or null",
  "board_members": ["List of board member names"] or null
}

Use null for fields not found on the page. For boolean fields (f_skatt, moms_registered, employer_registered), look for:
- "F-skatt: Ja/Nej" or "F-skattsedel"
- "Momsregistrerad: Ja/Nej" or "Moms"
- "Arbetsgivare: Ja/Nej" or "Registrerad arbetsgivare"
For SNI codes, look for "SNI" or "Bransch" sections.
For board members, look for "Styrelse" or "Befattningshavare" sections.`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract business license data.");

  const output = JSON.parse(jsonMatch[0]);

  // Ensure org_number is correctly formatted
  output.org_number = formatOrgNumber(orgDigits);

  return {
    output,
    provenance: { source: "allabolag.se", fetched_at: new Date().toISOString() },
  };
});
