import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("google-search", async (input: CapabilityInput) => {
  const query = ((input.query as string) ?? (input.q as string) ?? (input.task as string) ?? "").trim();
  if (!query) throw new Error("'query' is required.");

  const numResults = Math.min((input.num_results as number) ?? 10, 20);
  const language = ((input.language as string) ?? "").trim();
  const country = ((input.country as string) ?? "").trim();

  let searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${numResults}`;
  if (language) searchUrl += `&hl=${encodeURIComponent(language)}`;
  if (country) searchUrl += `&gl=${encodeURIComponent(country)}`;

  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.length < 100) throw new Error("Google search returned too little content.");

  // Use Claude to parse search results from the page text
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Parse Google search results from this page text. Return ONLY valid JSON.

{
  "results": [
    {
      "position": 1,
      "title": "Result title",
      "url": "https://...",
      "snippet": "Description text"
    }
  ],
  "total_results_estimate": "string or null (e.g. 'About 1,230,000 results')"
}

Extract up to ${numResults} results.

Page text:
${text.slice(0, 12000)}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse Google search results.");

  const output = JSON.parse(jsonMatch[0]);
  output.query = query;

  return {
    output,
    provenance: { source: "google.com", fetched_at: new Date().toISOString() },
  };
});
