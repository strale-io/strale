import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

// Google Patents search via Browserless + Claude extraction
registerCapability("patent-search", async (input: CapabilityInput) => {
  const query = ((input.query as string) ?? (input.keyword as string) ?? (input.task as string) ?? "").trim();
  if (!query) throw new Error("'query' (patent search term, keyword, or patent number) is required.");

  const maxResults = Math.min(Number(input.max_results ?? 10), 25);

  // Check if input looks like a patent number
  const isPatentNumber = /^(US|EP|WO|GB|DE|FR|JP|CN|KR)?\d{5,12}[A-Z]?\d?$/i.test(query.replace(/[\s,/-]/g, ""));

  let searchUrl: string;
  if (isPatentNumber) {
    const cleaned = query.replace(/[\s,/-]/g, "").toUpperCase();
    searchUrl = `https://patents.google.com/patent/${cleaned}`;
  } else {
    searchUrl = `https://patents.google.com/?q=${encodeURIComponent(query)}&num=${maxResults}`;
  }

  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.length < 200) {
    throw new Error("Could not load Google Patents search results.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 2000,
    prompt: `Extract patent search results from this Google Patents page. The search was for: "${query}".

Return ONLY valid JSON:
{
  "total_found": <number or null>,
  "patents": [
    {
      "patent_number": "e.g. US10123456B2",
      "title": "patent title",
      "date": "filing or publication date",
      "abstract": "short abstract (first 200 chars)",
      "inventors": ["inventor names"],
      "assignees": ["assignee organizations"],
      "url": "https://patents.google.com/patent/..."
    }
  ]
}

Page text:
${text.slice(0, 12000)}`,
    truncationGuidance: "Reduce max_results so fewer patents are returned per call.",
    parseFailureError: () => new Error("Failed to extract patent results."),
  });
  output.query = query;
  output.returned_count = (output.patents as unknown[] | undefined)?.length ?? 0;
  output.source_url = searchUrl;

  return {
    output,
    provenance: { source: "patents.google.com", fetched_at: new Date().toISOString() },
  };
});
