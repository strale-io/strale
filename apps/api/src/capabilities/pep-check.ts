import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

const DILISENSE_API = "https://api.dilisense.com/v1/checkIndividual";
const DILISENSE_FALLBACK_KEY = "eKYn3FpyoYQaQvRWd83Q2P3XzNi0n7ifblts8kHK";

registerCapability("pep-check", async (input: CapabilityInput) => {
  const name = ((input.name as string) ?? (input.full_name as string) ?? "").trim();
  if (!name) {
    throw new Error("'name' is required. Provide a person's full name to screen.");
  }
  if (name.length < 2) {
    throw new Error("Name must be at least 2 characters for PEP screening.");
  }

  const birthDate = ((input.date_of_birth as string) ?? (input.birth_date as string) ?? "").trim() || undefined;
  const country = ((input.country as string) ?? "").trim().toUpperCase() || undefined;

  const apiKey = process.env.DILISENSE_API_KEY || DILISENSE_FALLBACK_KEY;

  // Try Dilisense API first
  try {
    const params = new URLSearchParams({ names: name, fuzzy_search: "1" });

    if (birthDate) {
      const parts = birthDate.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (parts) {
        params.set("dob", `${parts[3]}/${parts[2]}/${parts[1]}`);
      }
    }

    const res = await fetch(`${DILISENSE_API}?${params.toString()}`, {
      method: "GET",
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        timestamp: string;
        total_hits: number;
        found_records: Array<{
          id: string;
          entity_type: string;
          name: string;
          source_type: string;
          source_id: string;
          pep_type?: string;
          positions?: string[];
          political_parties?: string[];
          citizenship?: string[];
          description?: string[];
          alias_names?: string[];
          date_of_birth?: string[];
        }>;
      };

      // Filter to PEP records only (SANCTION handled by sanctions-check)
      let pepRecords = data.found_records.filter(
        (r) => r.source_type === "PEP",
      );

      // Post-filter by country if provided
      if (country && pepRecords.length > 0) {
        const countryFiltered = pepRecords.filter(
          (r) => r.citizenship?.some((c) => c.toUpperCase() === country),
        );
        if (countryFiltered.length > 0) {
          pepRecords = countryFiltered;
        }
      }

      const matches = pepRecords.slice(0, 10).map((r) => ({
        name: r.name,
        pep_type: r.pep_type ?? "UNKNOWN",
        positions: r.positions ?? [],
        political_parties: r.political_parties ?? [],
        countries: r.citizenship ?? [],
        description: r.description ?? [],
        source_id: r.source_id,
      }));

      const now = new Date().toISOString();
      return {
        output: {
          query: name,
          is_pep: pepRecords.length > 0,
          match_count: pepRecords.length,
          matches,
          screened_at: now,
        },
        provenance: { source: "dilisense.com", fetched_at: now },
      };
    }

    console.error(`[pep-check] dilisense: HTTP ${res.status} ${res.statusText}`);
  } catch (err) {
    console.error("[pep-check] dilisense:", err instanceof Error ? err.message : err);
  }

  // Fallback: use Claude to do a knowledge-based check
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey: anthropicKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: `Check if this person is a Politically Exposed Person (PEP) — a current or former senior political figure, their family member, or close associate. Return ONLY valid JSON.

Person: "${name}"${country ? `\nCountry: ${country}` : ""}

Return:
{
  "query": "${name}",
  "is_pep": true/false,
  "confidence": "high/medium/low",
  "reason": "brief explanation",
  "positions": ["known positions if PEP"],
  "note": "This is a knowledge-based check, not a real-time database query."
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to perform PEP check.");

  const output = JSON.parse(jsonMatch[0]);

  return {
    output,
    provenance: { source: "llm-knowledge", fetched_at: new Date().toISOString() },
  };
});
