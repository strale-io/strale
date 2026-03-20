import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

const DISCLAIMER =
  "This adverse media check is based on automated web search results assessed by AI. It may not capture all relevant information and could include false positives. Results should be verified through direct investigation. This is not legal advice.";

async function serperSearch(query: string, serperKey: string): Promise<any[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": serperKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 5 }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Serper API error: HTTP ${res.status} ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as any;
  return (data.organic as any[]) ?? [];
}

function deduplicateByUrl(results: any[]): any[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.link)) return false;
    seen.add(r.link);
    return true;
  });
}

function deriveRiskLevel(
  findings: Array<{ risk_category: string; relevance_score: number }>,
): "none" | "low" | "medium" | "high" | "critical" {
  const relevant = findings.filter((f) => f.relevance_score > 0.5);
  if (relevant.length === 0) return "none";

  const categories = relevant.map((f) => f.risk_category);
  const hasFraud = categories.includes("fraud");
  const hasSanctions = categories.includes("sanctions");
  const hasLitigation = categories.includes("litigation");
  const hasRegulatory = categories.includes("regulatory");

  const severeCount = relevant.filter(
    (f) => f.risk_category === "fraud" || f.risk_category === "sanctions",
  ).length;

  if (severeCount >= 2) return "critical";
  if (hasFraud || hasSanctions) return "high";
  if (hasLitigation || hasRegulatory) return "medium";
  return "low";
}

registerCapability("adverse-media-check", async (input: CapabilityInput) => {
  const entityName = (
    (input.entity_name as string) ??
    (input.name as string) ??
    (input.task as string) ??
    ""
  ).trim();
  if (!entityName) {
    throw new Error("'entity_name' is required. Provide a person or company name to screen.");
  }

  const country = ((input.country as string) ?? "").trim() || undefined;

  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) {
    throw new Error("SERPER_API_KEY is required for adverse media search.");
  }

  // Step 1: Multi-search with Serper (2-3 targeted queries)
  const searches = [
    `"${entityName}" fraud OR scam OR lawsuit OR sanction`,
    `"${entityName}" regulatory action OR fine OR penalty`,
  ];
  if (country) {
    searches.push(`"${entityName}" ${country} news`);
  }

  let allResults: any[] = [];
  for (const q of searches) {
    try {
      const results = await serperSearch(q, serperKey);
      allResults.push(...results);
    } catch (err) {
      console.error(`[adverse-media-check] Search failed for query: ${q}`, err);
    }
  }

  if (allResults.length === 0) {
    return {
      output: {
        query: { entity_name: entityName, country: country ?? null },
        risk_detected: false,
        risk_level: "none",
        findings: [],
        searches_performed: searches,
        disclaimer: DISCLAIMER,
      },
      provenance: { source: "google-serper+claude-haiku", fetched_at: new Date().toISOString() },
    };
  }

  allResults = deduplicateByUrl(allResults);

  // Step 2: Claude Haiku assessment
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const snippets = allResults
    .slice(0, 10)
    .map(
      (r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\nURL: ${r.link}`,
    )
    .join("\n\n");

  let findings: Array<{
    headline: string;
    source: string;
    date: string | null;
    risk_category: string;
    relevance_score: number;
  }> = [];
  let aiAssessmentAvailable = true;

  try {
    const client = new Anthropic({ apiKey });
    const r = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `You are assessing search results for adverse media about a business entity. For each result, determine if it represents a genuine risk finding. Classify the risk category and assign a relevance score (0-1). Respond only in JSON format.

Entity: "${entityName}"${country ? `\nCountry: ${country}` : ""}

Search results:
${snippets}

Return ONLY valid JSON:
{
  "findings": [
    {
      "headline": "short title",
      "source": "publication name",
      "date": "date if available or null",
      "risk_category": "fraud|litigation|regulatory|sanctions|bankruptcy|other",
      "relevance_score": 0.0-1.0
    }
  ]
}

Only include findings that genuinely relate to "${entityName}". Exclude results about different entities with similar names.`,
        },
      ],
    });

    const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      findings = (parsed.findings ?? []).slice(0, 10);
    } else {
      aiAssessmentAvailable = false;
    }
  } catch (err) {
    console.error("[adverse-media-check] Haiku assessment failed:", err);
    aiAssessmentAvailable = false;
  }

  // Fallback: raw results if AI assessment unavailable
  if (!aiAssessmentAvailable) {
    findings = allResults.slice(0, 5).map((r: any) => ({
      headline: r.title,
      source: new URL(r.link).hostname,
      date: r.date ?? null,
      risk_category: "other" as const,
      relevance_score: 0.5,
    }));
  }

  // Step 3: Aggregate risk
  const riskLevel = deriveRiskLevel(findings);
  const riskDetected = findings.some((f) => f.relevance_score > 0.5);

  const output: Record<string, unknown> = {
    query: { entity_name: entityName, country: country ?? null },
    risk_detected: riskDetected,
    risk_level: riskLevel,
    findings,
    searches_performed: searches,
    disclaimer: DISCLAIMER,
  };

  if (!aiAssessmentAvailable) {
    output.note = "AI classification unavailable — raw search results returned";
  }

  return {
    output,
    provenance: { source: "google-serper+claude-haiku", fetched_at: new Date().toISOString() },
  };
});
