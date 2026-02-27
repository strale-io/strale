import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
} from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

// GDPR fine lookup via enforcementtracker.com (Browserless + Claude)

registerCapability("gdpr-fine-lookup", async (input: CapabilityInput) => {
  const company = ((input.company as string) ?? "").trim();
  const countryCode = ((input.country_code as string) ?? "").trim().toUpperCase();
  const task = ((input.task as string) ?? "").trim();

  if (!company && !countryCode && !task) {
    throw new Error("'company', 'country_code', or 'task' is required. Provide a company name or EU country code to search GDPR fines.");
  }

  let url: string;
  if (company) {
    url = `https://www.enforcementtracker.com/?query=${encodeURIComponent(company)}`;
  } else if (countryCode) {
    url = `https://www.enforcementtracker.com/statistics.html?C=${encodeURIComponent(countryCode)}`;
  } else {
    // Try to use task as a search query
    url = `https://www.enforcementtracker.com/?query=${encodeURIComponent(task)}`;
  }

  const html = await fetchRenderedHtml(url);
  const text = htmlToText(html);

  if (text.length < 200) {
    throw new Error(`Could not load GDPR fine data from enforcementtracker.com.`);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });

  const searchContext = company
    ? `company "${company}"`
    : countryCode
      ? `country code "${countryCode}"`
      : `query "${task}"`;

  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Extract GDPR fine information from this enforcement tracker page. Search was for: ${searchContext}.

Page text:
${text.slice(0, 12000)}

Return ONLY valid JSON:
{
  "fines": [
    {
      "company": "Company or organization fined",
      "amount_eur": 0,
      "authority": "Data protection authority that issued the fine",
      "date": "Date of the fine",
      "article_violated": "GDPR article(s) violated",
      "description": "Brief description of the violation",
      "country": "Country code"
    }
  ],
  "total_fines": "number of fines found",
  "total_amount_eur": "sum of all fine amounts"
}

Return up to 15 fines. Use null for missing fields. Amounts should be numbers, not strings.`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract GDPR fine data.");

  const output = JSON.parse(jsonMatch[0]);

  return {
    output,
    provenance: { source: "enforcementtracker.com", fetched_at: new Date().toISOString() },
  };
});
