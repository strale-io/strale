import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("adverse-media-check", async (input: CapabilityInput) => {
  const name = ((input.name as string) ?? (input.task as string) ?? "").trim();
  if (!name) {
    throw new Error("'name' is required. Provide a person or company name to screen.");
  }

  const context = ((input.context as string) ?? "").trim();

  // Use Serper.dev for adverse media search
  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) {
    throw new Error("SERPER_API_KEY is required for adverse media search.");
  }

  const riskTerms = "fraud OR \"money laundering\" OR sanctions OR lawsuit OR \"regulatory action\" OR convicted OR indicted OR investigation OR bankruptcy OR \"tax evasion\"";
  const query = `"${name}" ${riskTerms}${context ? ` ${context}` : ""}`;

  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": serperKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 10 }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Serper API error: HTTP ${res.status} ${errText.slice(0, 200)}`);
  }

  const searchData = (await res.json()) as any;
  const organic = (searchData.organic as any[]) ?? [];

  if (organic.length === 0) {
    return {
      output: {
        query: name,
        context: context || null,
        risk_level: "none",
        total_findings: 0,
        findings: [],
        categories_found: [],
        screened_at: new Date().toISOString(),
      },
      provenance: { source: "google-serper+claude-haiku", fetched_at: new Date().toISOString() },
    };
  }

  // Use Claude Haiku to classify results
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });

  const snippets = organic.slice(0, 8).map((r, i) =>
    `[${i + 1}] ${r.title}\n${r.snippet}\nURL: ${r.link}`
  ).join("\n\n");

  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `Analyze these search results for adverse media about "${name}". Classify each as a risk finding if relevant.

${snippets}

Return ONLY valid JSON:
{
  "risk_level": "none|low|medium|high",
  "findings": [
    {
      "headline": "short title",
      "source": "publication name",
      "date": "date if available or null",
      "category": "fraud|money_laundering|sanctions|lawsuit|regulatory|criminal|bankruptcy|tax|other",
      "summary": "one sentence summary",
      "url": "source url",
      "relevance": "high|medium|low"
    }
  ],
  "categories_found": ["list of unique categories"]
}

Only include findings that genuinely relate to "${name}". Exclude results about different people/companies with similar names. If no results are relevant, return risk_level "none" with empty findings.`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      output: {
        query: name,
        context: context || null,
        risk_level: "low",
        total_findings: organic.length,
        findings: organic.slice(0, 5).map((r: any) => ({
          headline: r.title,
          source: new URL(r.link).hostname,
          date: r.date ?? null,
          category: "unclassified",
          summary: r.snippet,
          url: r.link,
        })),
        categories_found: ["unclassified"],
        screened_at: new Date().toISOString(),
        note: "AI classification failed — raw results returned",
      },
      provenance: { source: "google-serper", fetched_at: new Date().toISOString() },
    };
  }

  const classified = JSON.parse(jsonMatch[0]);

  return {
    output: {
      query: name,
      context: context || null,
      risk_level: classified.risk_level ?? "low",
      total_findings: (classified.findings ?? []).length,
      findings: (classified.findings ?? []).slice(0, 10),
      categories_found: classified.categories_found ?? [],
      screened_at: new Date().toISOString(),
    },
    provenance: { source: "google-serper+claude-haiku", fetched_at: new Date().toISOString() },
  };
});
