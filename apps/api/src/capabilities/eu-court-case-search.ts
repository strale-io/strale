import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
} from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

// EU court case search — CJEU (Court of Justice of the EU) and ECHR (European Court of Human Rights)

registerCapability("eu-court-case-search", async (input: CapabilityInput) => {
  const query = ((input.query as string) ?? (input.task as string) ?? "").trim();
  if (!query) {
    throw new Error("'query' is required. Describe the legal topic or case to search for.");
  }

  const court = ((input.court as string) ?? "cjeu").trim().toLowerCase();
  if (court !== "cjeu" && court !== "echr") {
    throw new Error("'court' must be 'cjeu' or 'echr'. Defaults to 'cjeu'.");
  }

  let url: string;
  let sourceDomain: string;

  if (court === "cjeu") {
    url = `https://curia.europa.eu/juris/liste.jsf?language=en&td=ALL&jur=C&text=${encodeURIComponent(query)}`;
    sourceDomain = "curia.europa.eu";
  } else {
    url = `https://hudoc.echr.coe.int/eng#{"fulltext":["${encodeURIComponent(query)}"]}`;
    sourceDomain = "hudoc.echr.coe.int";
  }

  const html = await fetchRenderedHtml(url);
  const text = htmlToText(html);

  if (text.length < 200) {
    throw new Error(`No court cases found for "${query}" on ${sourceDomain}.`);
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
        content: `Extract court cases from this ${court === "cjeu" ? "CJEU (Court of Justice of the EU)" : "ECHR (European Court of Human Rights)"} search results page.

Search query: "${query}"

Page text:
${text.slice(0, 12000)}

Return ONLY valid JSON:
{
  "cases": [
    {
      "case_number": "Case number (e.g. C-131/12 or Application no. 5493/72)",
      "title": "Title or name of the case",
      "date": "Date of judgment or decision",
      "court": "${court === "cjeu" ? "CJEU" : "ECHR"}",
      "parties": "Parties involved",
      "summary": "Brief summary (1-2 sentences)",
      "url": "URL to the case if available, or null"
    }
  ],
  "total_results": "number of results found or estimated"
}

Return up to 10 cases. Use null for missing fields.`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract court case data.");

  const output = JSON.parse(jsonMatch[0]);

  return {
    output,
    provenance: { source: sourceDomain, fetched_at: new Date().toISOString() },
  };
});
