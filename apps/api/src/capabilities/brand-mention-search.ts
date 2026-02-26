import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

// Uses Serper.dev API for search (avoids CAPTCHA issues from direct Google scraping)
registerCapability("brand-mention-search", async (input: CapabilityInput) => {
  const brandName = ((input.brand_name as string) ?? (input.brand as string) ?? (input.task as string) ?? "").trim();
  if (!brandName) throw new Error("'brand_name' is required.");

  const excludeOwnDomain = (input.exclude_own_domain as string)?.trim();
  const maxResults = Math.min((input.max_results as number) ?? 10, 20);

  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) {
    throw new Error("SERPER_API_KEY is required. Sign up at https://serper.dev (free tier: 2,500 queries/month).");
  }

  // Build search query
  let query = `"${brandName}"`;
  if (excludeOwnDomain) query += ` -site:${excludeOwnDomain}`;

  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": serperKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: maxResults }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Serper API error: HTTP ${res.status} ${errText.slice(0, 200)}`);
  }

  const data = await res.json() as Record<string, unknown>;
  const organic = (data.organic as Array<Record<string, unknown>>) ?? [];

  if (organic.length === 0) {
    return {
      output: {
        brand_name: brandName,
        query,
        mentions: [],
        total_results_found: 0,
        summary: "No mentions found for this brand.",
      },
      provenance: { source: "google-serper", fetched_at: new Date().toISOString() },
    };
  }

  // Build context from search results for Claude analysis
  const resultsText = organic.map((r, i) =>
    `${i + 1}. ${r.title}\n   URL: ${r.link}\n   ${r.snippet ?? ""}`
  ).join("\n\n");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Analyze these search results for brand mentions. Return ONLY valid JSON.

Brand name: "${brandName}"
Search query: ${query}

Search results:
${resultsText}

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
    provenance: { source: "google-serper", fetched_at: new Date().toISOString() },
  };
});
