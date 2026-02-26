import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

// EUIPO TMView trademark search via Browserless + Claude extraction
registerCapability("eu-trademark-search", async (input: CapabilityInput) => {
  const query = ((input.query as string) ?? (input.trademark as string) ?? (input.name as string) ?? (input.task as string) ?? "").trim();
  if (!query) throw new Error("'query' (trademark name to search) is required.");

  const niceClass = ((input.nice_class as string) ?? (input.class as string) ?? "").trim();

  // Search EUIPO eSearch Plus
  let searchUrl = `https://euipo.europa.eu/eSearch/#basic/${encodeURIComponent(query)}`;
  if (niceClass) searchUrl += `/class/${niceClass}`;

  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.length < 200) {
    throw new Error("Could not load EUIPO trademark search results. The page may be temporarily unavailable.");
  }

  // Use Claude to extract structured results
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Extract trademark search results from this EUIPO eSearch page. The search was for: "${query}".

Return ONLY valid JSON:
{
  "total_results": <number or null>,
  "trademarks": [
    {
      "name": "trademark name",
      "number": "registration/application number",
      "status": "registered/pending/expired/etc",
      "type": "word/figurative/etc",
      "owner": "owner name",
      "filing_date": "date or null",
      "nice_classes": ["class numbers"]
    }
  ]
}

Page text:
${text.slice(0, 12000)}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract trademark results.");

  const output = JSON.parse(jsonMatch[0]);
  output.query = query;
  output.source_url = searchUrl;

  return {
    output,
    provenance: { source: "euipo.europa.eu", fetched_at: new Date().toISOString() },
  };
});
