import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
  extractCompanyName,
} from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

// Swedish credit report summary via Allabolag.se
// Extracts credit rating, financial summary, risk indicators

registerCapability("credit-report-summary", async (input: CapabilityInput) => {
  const raw = (input.org_number as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'org_number' or 'company_name' is required.");
  }

  const trimmed = raw.trim();

  // Try to extract a Swedish org number
  const orgMatch = trimmed.replace(/[\s-]/g, "").match(/^\d{10}$/);
  let orgNumber: string;

  if (orgMatch) {
    orgNumber = orgMatch[0];
  } else {
    const name = await extractCompanyName(trimmed, "Swedish");
    // Search Allabolag for the company
    const searchHtml = await fetchRenderedHtml(
      `https://www.allabolag.se/what/${encodeURIComponent(name)}`
    );
    const searchText = htmlToText(searchHtml);
    // Try to find an org number in the search results
    const foundOrg = searchText.match(/\d{6}-?\d{4}/);
    if (!foundOrg) throw new Error(`Could not find a Swedish org number for "${name}".`);
    orgNumber = foundOrg[0].replace(/-/g, "");
  }

  // Fetch the company page from Allabolag
  const html = await fetchRenderedHtml(`https://www.allabolag.se/${orgNumber}`);
  const text = htmlToText(html);

  if (text.length < 200 || text.includes("Sidan kunde inte hittas")) {
    throw new Error(`No credit data found for org number ${orgNumber}.`);
  }

  // Use Claude to extract structured credit report data
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `Extract a credit report summary from this Swedish company page. Return ONLY valid JSON with these fields:
{
  "company_name": "string",
  "org_number": "string",
  "credit_rating": "string or null (e.g. AAA, AA, A, B, C)",
  "credit_limit_sek": "number or null",
  "risk_indicator": "string or null (low/medium/high)",
  "revenue_sek": "number or null",
  "profit_sek": "number or null",
  "employees": "number or null",
  "registered_address": "string or null",
  "industry": "string or null",
  "fiscal_year": "string or null",
  "board_members": ["name1", "name2"],
  "total_assets_sek": "number or null",
  "equity_sek": "number or null"
}

Page text:
${text.slice(0, 12000)}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract credit report data.");

  const output = JSON.parse(jsonMatch[0]);

  return {
    output,
    provenance: { source: "allabolag.se", fetched_at: new Date().toISOString() },
  };
});
