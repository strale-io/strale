import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

// Employer review summary via Glassdoor (Browserless + Claude)
// Renders Glassdoor reviews page, extracts structured employer review data

registerCapability("employer-review-summary", async (input: CapabilityInput) => {
  const company =
    (input.company as string) ??
    (input.company_name as string) ??
    (input.task as string) ??
    "";
  if (typeof company !== "string" || !company.trim()) {
    throw new Error(
      "'company' or 'company_name' is required. Provide a company name to look up reviews (e.g. 'Spotify').",
    );
  }

  const companyName = company.trim();
  const country = (input.country as string) ?? "";

  // Try Glassdoor reviews search page
  const slug = companyName
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
  const glassdoorUrl = `https://www.glassdoor.com/Reviews/${slug}-reviews-SRCH_KE0,${slug.length}.htm`;

  let text: string;
  try {
    const html = await fetchRenderedHtml(glassdoorUrl);
    text = htmlToText(html);
  } catch {
    // Fallback to Google search if Glassdoor blocks direct access
    const countryClause = country ? ` ${country}` : "";
    const query = encodeURIComponent(
      `${companyName} glassdoor reviews${countryClause}`,
    );
    const fallbackUrl = `https://www.google.com/search?q=${query}`;
    const html = await fetchRenderedHtml(fallbackUrl);
    text = htmlToText(html);
  }

  if (text.length < 100) {
    throw new Error(
      `Could not retrieve review information for "${companyName}".`,
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
        content: `Extract employer review information for "${companyName}" from this page.

Return ONLY valid JSON with these fields (use null for missing data):
{
  "company_name": "string",
  "overall_rating": "number (1-5 scale) or null",
  "recommend_percent": "number (0-100) or null",
  "ceo_approval": "number (0-100) or null",
  "ratings_breakdown": {
    "culture": "number or null",
    "compensation": "number or null",
    "work_life_balance": "number or null",
    "management": "number or null",
    "career_opportunities": "number or null"
  },
  "pros_themes": ["string", "..."],
  "cons_themes": ["string", "..."],
  "review_count": "number or null",
  "source": "string"
}

Page text:
${text.slice(0, 12000)}`,
      },
    ],
  });

  const responseText =
    r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch)
    throw new Error("Failed to extract review data from the page.");

  const output = JSON.parse(jsonMatch[0]);

  return {
    output,
    provenance: {
      source: "glassdoor.com",
      fetched_at: new Date().toISOString(),
    },
  };
});
