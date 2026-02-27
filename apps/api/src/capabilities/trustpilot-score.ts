import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

// Trustpilot score/review extraction via Browserless + Claude

function cleanDomain(input: string): string {
  let domain = input.trim();
  // Remove protocol
  domain = domain.replace(/^https?:\/\//, "");
  // Remove www.
  domain = domain.replace(/^www\./, "");
  // Remove trailing slash and path
  domain = domain.replace(/\/.*$/, "");
  return domain.toLowerCase();
}

registerCapability("trustpilot-score", async (input: CapabilityInput) => {
  const raw =
    ((input.domain as string) ?? (input.company as string) ?? (input.task as string) ?? "").trim();
  if (!raw) {
    throw new Error(
      "'domain' or 'company' is required. Provide a domain name (e.g. 'stripe.com') or company name.",
    );
  }

  const domain = cleanDomain(raw);
  const trustpilotUrl = `https://www.trustpilot.com/review/${domain}`;

  const html = await fetchRenderedHtml(trustpilotUrl);
  const pageText = htmlToText(html).slice(0, 12000);

  // Check if we got a valid Trustpilot page
  if (pageText.includes("We couldn't find") || pageText.includes("is not on Trustpilot")) {
    throw new Error(
      `No Trustpilot profile found for "${domain}". Try using the exact domain name.`,
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Extract Trustpilot review data from this page. Return ONLY valid JSON.

Domain: ${domain}
URL: ${trustpilotUrl}

Page text:
${pageText}

Return JSON:
{
  "company_name": "company display name",
  "domain": "${domain}",
  "trustscore": 4.5,
  "star_rating": 4.5,
  "review_count": 12345,
  "rating_distribution": {
    "5_star": 8000,
    "4_star": 2000,
    "3_star": 1000,
    "2_star": 500,
    "1_star": 845
  },
  "recent_reviews": [
    {
      "rating": 5,
      "title": "review title",
      "text": "review text (truncated to ~200 chars)",
      "date": "2024-01-15"
    }
  ],
  "claimed": true,
  "response_rate": "85%",
  "category": "Electronics & Technology"
}

Extract up to 5 recent reviews. Use null for any fields you cannot determine.`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract Trustpilot data.");

  const output = JSON.parse(jsonMatch[0]);
  output.trustpilot_url = trustpilotUrl;

  return {
    output,
    provenance: {
      source: "trustpilot.com",
      fetched_at: new Date().toISOString(),
    },
  };
});
