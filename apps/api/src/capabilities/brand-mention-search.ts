import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("brand-mention-search", async (input: CapabilityInput) => {
  const brandName = ((input.brand_name as string) ?? (input.brand as string) ?? (input.task as string) ?? "").trim();
  if (!brandName) throw new Error("'brand_name' is required.");

  const excludeOwnDomain = (input.exclude_own_domain as string)?.trim();
  const maxResults = Math.min((input.max_results as number) ?? 10, 20);

  // Build search query
  let query = `"${brandName}"`;
  if (excludeOwnDomain) query += ` -site:${excludeOwnDomain}`;

  // Use Google search via Browserless
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${maxResults}&hl=en`;
  const html = await fetchRenderedHtml(searchUrl);
  const pageText = htmlToText(html).slice(0, 12000);

  // Check for CAPTCHA
  if (html.includes("captcha") || html.includes("unusual traffic")) {
    // Fallback: return what we can
    return {
      output: {
        brand_name: brandName,
        mentions: [],
        error: "Search blocked by CAPTCHA. Try again later or reduce request frequency.",
        query,
      },
      provenance: { source: "google.com", fetched_at: new Date().toISOString() },
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Extract brand mentions from these Google search results. Return ONLY valid JSON.

Brand name: "${brandName}"
Search query: ${query}

Search results page text:
${pageText}

Return JSON:
{
  "mentions": [
    {
      "url": "result URL",
      "title": "result title",
      "snippet": "result snippet/description",
      "sentiment": "positive/negative/neutral",
      "source_type": "news/blog/forum/social/review/directory/other",
      "relevance": "high/medium/low"
    }
  ],
  "total_results_found": <number>
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract brand mentions.");

  const output = JSON.parse(jsonMatch[0]);
  output.brand_name = brandName;
  output.query = query;

  return {
    output,
    provenance: { source: "google.com", fetched_at: new Date().toISOString() },
  };
});
