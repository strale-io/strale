import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
} from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

// EUR-Lex search via Browserless
const EURLEX_SEARCH = "https://eur-lex.europa.eu/search.html";

registerCapability("eu-regulation-search", async (input: CapabilityInput) => {
  const query = ((input.query as string) ?? (input.topic as string) ?? (input.task as string) ?? "").trim();
  if (!query) {
    throw new Error("'query' or 'topic' is required. Describe the regulation topic to search.");
  }

  const type = ((input.type as string) ?? "").trim(); // regulation, directive, decision
  const year = (input.year as string) ?? "";

  // Build EUR-Lex search URL
  let searchParams = `?text=${encodeURIComponent(query)}&scope=EURLEX&type=quick`;
  if (type) searchParams += `&qid=${Date.now()}`;

  const url = `${EURLEX_SEARCH}${searchParams}`;
  const html = await fetchRenderedHtml(url);
  const text = htmlToText(html);

  if (text.length < 200) {
    throw new Error(`No EU regulations found for "${query}".`);
  }

  // Use Claude to extract structured results from EUR-Lex search results
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Extract EU regulation search results from this EUR-Lex page. Return ONLY valid JSON.

Search query: "${query}"${type ? `\nType filter: ${type}` : ""}${year ? `\nYear filter: ${year}` : ""}

Page text:
${text.slice(0, 12000)}

Return:
{
  "query": "${query}",
  "result_count": number,
  "regulations": [
    {
      "title": "Full title of the regulation/directive",
      "celex_number": "CELEX number if found (e.g. 32016R0679)",
      "type": "Regulation/Directive/Decision/etc.",
      "date": "Date of the act",
      "in_force": true/false or null,
      "summary": "Brief summary (1-2 sentences)"
    }
  ]
}

Return up to 10 results. If you cannot find structured results, return what information is available.`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract regulation search results.");

  const output = JSON.parse(jsonMatch[0]);

  return {
    output,
    provenance: { source: "eur-lex.europa.eu", fetched_at: new Date().toISOString() },
  };
});
