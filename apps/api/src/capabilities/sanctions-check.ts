import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

// OpenSanctions API — free tier available
const OPENSANCTIONS_API = "https://api.opensanctions.org/match/default";

registerCapability("sanctions-check", async (input: CapabilityInput) => {
  const name = ((input.name as string) ?? (input.entity as string) ?? (input.task as string) ?? "").trim();
  if (!name) {
    throw new Error("'name' is required. Provide a person or company name to check.");
  }

  const country = ((input.country as string) ?? "").trim().toUpperCase() || undefined;

  // Try OpenSanctions API first
  try {
    const body: Record<string, unknown> = {
      queries: {
        q1: {
          schema: "Thing",
          properties: {
            name: [name],
          },
        },
      },
    };

    if (country) {
      (body.queries as any).q1.properties.country = [country];
    }

    const res = await fetch(OPENSANCTIONS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      const data = (await res.json()) as any;
      const results = data?.responses?.q1?.results ?? [];

      const matches = results.map((r: any) => ({
        name: r.properties?.name?.[0] ?? r.caption ?? "Unknown",
        score: r.score ?? 0,
        schema: r.schema ?? null,
        datasets: r.datasets ?? [],
        countries: r.properties?.country ?? [],
        topics: r.properties?.topics ?? [],
        first_seen: r.first_seen ?? null,
        last_seen: r.last_seen ?? null,
      }));

      // Filter to matches above 0.5 score
      const relevantMatches = matches.filter((m: any) => m.score > 0.5);

      return {
        output: {
          query: name,
          country_filter: country ?? null,
          is_sanctioned: relevantMatches.length > 0,
          match_count: relevantMatches.length,
          matches: relevantMatches.slice(0, 10),
          checked_lists: ["OpenSanctions (consolidated: EU, US OFAC, UN, UK, etc.)"],
        },
        provenance: { source: "opensanctions.org", fetched_at: new Date().toISOString() },
      };
    }
  } catch {
    // Fall through to LLM-based analysis
  }

  // Fallback: use Claude to do a knowledge-based check
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: `Check if this entity is on any known sanctions lists (EU, US OFAC, UN, UK). Return ONLY valid JSON.

Entity: "${name}"${country ? `\nCountry: ${country}` : ""}

Return:
{
  "query": "${name}",
  "is_sanctioned": true/false,
  "confidence": "high/medium/low",
  "reason": "brief explanation",
  "likely_lists": ["list names if sanctioned"],
  "note": "This is a knowledge-based check, not a real-time database query. For definitive results, check official sources directly."
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to perform sanctions check.");

  const output = JSON.parse(jsonMatch[0]);

  return {
    output,
    provenance: { source: "llm-knowledge", fetched_at: new Date().toISOString() },
  };
});
