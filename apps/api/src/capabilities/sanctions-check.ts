import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

const DILISENSE_API = "https://api.dilisense.com/v1";
const DILISENSE_FALLBACK_KEY = "eKYn3FpyoYQaQvRWd83Q2P3XzNi0n7ifblts8kHK";

const COMPANY_SUFFIXES = /\b(AB|AS|Ltd|LLC|Inc|GmbH|SA|BV|NV|Oy|Oyj|PLC|Corp|AG|SE|SRL|Srl|KG|ApS|HB|KB|ANS|DA|ehf|hf|Tbk|Bhd|Pte|Pty|Co|SAS|SARL|SpA|EIRL|OÜ|SIA|UAB|d\.o\.o|s\.r\.o|a\.s)\b\.?/i;

function looksLikeCompany(name: string): boolean {
  return COMPANY_SUFFIXES.test(name);
}

registerCapability("sanctions-check", async (input: CapabilityInput) => {
  const name = ((input.name as string) ?? (input.entity as string) ?? (input.task as string) ?? "").trim();
  if (!name) {
    throw new Error("'name' is required. Provide a person or company name to check.");
  }

  const country = ((input.country as string) ?? "").trim().toUpperCase() || undefined;
  const birthDate = (input.birth_date as string) ?? undefined;
  const entityTypeOverride = (input.entity_type as string) ?? undefined;

  const apiKey = process.env.DILISENSE_API_KEY || DILISENSE_FALLBACK_KEY;

  // Determine endpoint: person or entity
  const isCompany = entityTypeOverride === "company" ||
    (entityTypeOverride !== "person" && looksLikeCompany(name));
  const endpoint = isCompany ? "checkEntity" : "checkIndividual";

  // Try Dilisense API first
  try {
    const params = new URLSearchParams({ names: name, fuzzy_search: "1" });

    // Add date of birth for individual checks
    if (!isCompany && birthDate) {
      // Convert YYYY-MM-DD or similar to dd/mm/yyyy
      const parts = birthDate.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (parts) {
        params.set("dob", `${parts[3]}/${parts[2]}/${parts[1]}`);
      }
    }

    const url = `${DILISENSE_API}/${endpoint}?${params.toString()}`;
    const res = await fetch(url, {
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
          alias_names?: string[];
          citizenship?: string[];
          sanction_details?: string[];
          description?: string[];
          positions?: string[];
          date_of_birth?: string[];
          pep_type?: string;
        }>;
      };

      // Filter to SANCTION records only (PEP handled by pep-check capability)
      let sanctionRecords = data.found_records.filter(
        (r) => r.source_type === "SANCTION",
      );

      // Post-filter by country if provided
      if (country && sanctionRecords.length > 0) {
        const countryFiltered = sanctionRecords.filter(
          (r) => r.citizenship?.some((c) => c.toUpperCase() === country),
        );
        // Only apply country filter if it doesn't eliminate all results
        if (countryFiltered.length > 0) {
          sanctionRecords = countryFiltered;
        }
      }

      const matches = sanctionRecords.slice(0, 10).map((r) => ({
        name: r.name,
        source_id: r.source_id,
        sanction_details: r.sanction_details ?? [],
        countries: r.citizenship ?? [],
        description: r.description ?? [],
      }));

      return {
        output: {
          query: name,
          country_filter: country ?? null,
          is_sanctioned: sanctionRecords.length > 0,
          match_count: sanctionRecords.length,
          matches,
          checked_lists: ["dilisense (consolidated: OFAC, EU, UN, UK OFSI, etc.)"],
        },
        provenance: { source: "dilisense.com", fetched_at: new Date().toISOString() },
      };
    }

    console.error(`[sanctions-check] dilisense: HTTP ${res.status} ${res.statusText}`);
  } catch (err) {
    console.error("[sanctions-check] dilisense:", err instanceof Error ? err.message : err);
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
