import { createAnthropicClient } from "../lib/anthropic-client.js";
import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
} from "./lib/browserless-extract.js";
import type Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";
import { UpstreamUnavailableError } from "../lib/upstream-result.js";

// GDPR fine lookup via enforcementtracker.com (Browserless + Claude)

/**
 * enforcementtracker.com is the source Strale chose, so a page that renders
 * without its fine table is that source failing, and counts against this
 * capability's health (2026-11-06 swallowed-failures audit, row 6). Before,
 * a shell of 200 characters or more came back as a billed `fines: []` with
 * totals of 0, which reads as "no fines on record". Now it throws, unbilled.
 */
const TRACKER = "enforcementtracker.com";

function trackerUnavailable(detail: string, code: string): UpstreamUnavailableError {
  return new UpstreamUnavailableError(TRACKER, `${detail}; retry shortly.`, { code });
}

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

  const html = await fetchRenderedHtml(url, { source: "strale" });
  const text = htmlToText(html);

  if (text.length < 200) {
    throw trackerUnavailable("the page rendered without readable content", "empty");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = createAnthropicClient({ apiKey });

  const searchContext = company
    ? `company "${company}"`
    : countryCode
      ? `country code "${countryCode}"`
      : `query "${task}"`;

  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 2000,
    prompt: `Extract GDPR fine information from this enforcement tracker page. Search was for: ${searchContext}.

Page text:
${text.slice(0, 12000)}

Return ONLY valid JSON:
{
  "page_status": "results" if the page lists fines, "no_results" if the page shows the tracker's fine table or search with no fine matching the search, or "page_error" if it is an error or maintenance page, a cookie or consent wall, or an app shell that never shows the fine table,
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

Return up to 15 fines. Use null for missing fields. Amounts should be numbers, not strings. If page_status is "page_error", return "fines": [] and 0 for both totals.`,
    truncationGuidance: "Narrow the search (specific company or country) so fewer fines are returned per call.",
    parseFailureError: () => new Error("Failed to extract GDPR fine data."),
  });
  if (output.page_status === "page_error") {
    throw trackerUnavailable("the page showed no fine table (an error, maintenance or consent page, or an empty app shell)", "page_error");
  }

  return {
    output,
    provenance: { source: "enforcementtracker.com", fetched_at: new Date().toISOString() },
  };
});
