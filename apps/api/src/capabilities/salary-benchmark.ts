import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

// Salary benchmark via Glassdoor (Browserless + Claude)
// Renders Glassdoor salary page, extracts structured compensation data

registerCapability("salary-benchmark", async (input: CapabilityInput) => {
  const jobTitle =
    (input.job_title as string) ??
    (input.title as string) ??
    (input.task as string) ??
    "";
  if (typeof jobTitle !== "string" || !jobTitle.trim()) {
    throw new Error(
      "'job_title' is required. Provide a job title to look up salary data (e.g. 'Software Engineer').",
    );
  }

  const country = ((input.country_code as string) ?? "US").toUpperCase();
  const city = (input.city as string) ?? "";
  const experienceLevel = (input.experience_level as string) ?? "";

  const slug = jobTitle
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");

  // Use Glassdoor salary knowledge page via Browserless
  const targetUrl = `https://www.glassdoor.com/Salaries/know/what-does-a-${slug}-make`;

  let text: string;
  try {
    const html = await fetchRenderedHtml(targetUrl);
    text = htmlToText(html);
  } catch {
    // Fallback to Google search if Glassdoor blocks
    const query = encodeURIComponent(
      `${jobTitle.trim()} salary ${country} ${city}`.trim(),
    );
    const fallbackUrl = `https://www.google.com/search?q=${query}`;
    const html = await fetchRenderedHtml(fallbackUrl);
    text = htmlToText(html);
  }

  if (text.length < 100) {
    throw new Error(
      `Could not retrieve salary information for "${jobTitle.trim()}".`,
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const experienceClause = experienceLevel
    ? ` The user is interested in ${experienceLevel}-level salaries.`
    : "";
  const locationClause = city ? ` in ${city}, ${country}` : ` in ${country}`;

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Extract salary information for "${jobTitle.trim()}"${locationClause} from this page.${experienceClause}

Return ONLY valid JSON with these fields (use null for missing data):
{
  "job_title": "string",
  "location": "string",
  "median_salary": "number or null (annual, in local currency)",
  "p25": "number or null (25th percentile)",
  "p75": "number or null (75th percentile)",
  "currency": "string (e.g. USD, EUR, SEK)",
  "sample_size": "number or null",
  "source": "string",
  "comparable_titles": [{"title": "string", "median": "number or null"}]
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
    throw new Error("Failed to extract salary data from the page.");

  const output = JSON.parse(jsonMatch[0]);

  return {
    output,
    provenance: { source: "glassdoor.com", fetched_at: new Date().toISOString() },
  };
});
