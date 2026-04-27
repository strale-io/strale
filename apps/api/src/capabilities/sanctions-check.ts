import { registerCapability, type CapabilityInput } from "./index.js";
import { logError } from "../lib/log.js";
import { DILISENSE_SANCTIONS_LISTS_QUERIED } from "./lib/dilisense-sources.js";

/**
 * Sanctions screening via Dilisense consolidated database.
 *
 * Covers OFAC SDN, EU FSF, UN Security Council, UK OFSI, Swiss SECO, BIS,
 * World Bank, EBRD, ADB, plus 125+ national sanctions / debarment lists.
 * See lib/dilisense-sources.ts for the full attributed list.
 */

const DILISENSE_API = "https://api.dilisense.com/v1";

const COMPANY_SUFFIXES = /\b(AB|AS|Ltd|LLC|Inc|GmbH|SA|BV|NV|Oy|Oyj|PLC|Corp|AG|SE|SRL|Srl|KG|ApS|HB|KB|ANS|DA|ehf|hf|Tbk|Bhd|Pte|Pty|Co|SAS|SARL|SpA|EIRL|OÜ|SIA|UAB|d\.o\.o|s\.r\.o|a\.s)\b\.?/i;

function looksLikeCompany(name: string): boolean {
  return COMPANY_SUFFIXES.test(name);
}

registerCapability("sanctions-check", async (input: CapabilityInput) => {
  const name = ((input.name as string) ?? (input.entity as string) ?? (input.entity_name as string) ?? "").trim();
  if (!name) {
    throw new Error("'name' is required. Provide a person or company name to check.");
  }
  if (name.length < 2) {
    throw new Error("Name must be at least 2 characters for sanctions screening.");
  }

  const country = ((input.country as string) ?? "").trim().toUpperCase() || undefined;
  const entityType = (input.entity_type as string) ?? undefined;
  const isCompany = entityType === "company" || (entityType !== "person" && looksLikeCompany(name));
  const schema = isCompany ? "Company" : "Person";
  const birthDate = ((input.birth_date as string) ?? (input.date_of_birth as string) ?? "").trim() || undefined;

  const dilisenseKey = process.env.DILISENSE_API_KEY;
  if (!dilisenseKey) {
    throw new Error("Sanctions screening unavailable: DILISENSE_API_KEY not configured.");
  }

  try {
    const endpoint = isCompany ? "checkEntity" : "checkIndividual";
    const params = new URLSearchParams({ names: name, fuzzy_search: "1" });
    if (birthDate && !isCompany) {
      const parts = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (parts) params.set("dob", `${parts[3]}/${parts[2]}/${parts[1]}`);
    }
    const res = await fetch(`${DILISENSE_API}/${endpoint}?${params}`, {
      headers: { "x-api-key": dilisenseKey },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const status = res.status;
      if (status >= 400 && status < 500 && status !== 429) {
        throw new Error(`Dilisense validation error: HTTP ${status}`);
      }
      throw new Error(`Dilisense screening API unavailable: HTTP ${status}`);
    }

    const data = (await res.json()) as {
      found_records: Array<{
        name: string;
        source_id: string;
        source_type: string;
        sanction_details?: string[];
        citizenship?: string[];
        last_updated?: string;
      }>;
    };

    const sanctionRecords = data.found_records.filter((r) => r.source_type === "SANCTION");
    return {
      output: {
        query: name,
        schema,
        country_filter: country ?? null,
        birth_date_filter: birthDate ?? null,
        is_sanctioned: sanctionRecords.length > 0,
        match_count: sanctionRecords.length,
        total_results: sanctionRecords.length,
        matches: sanctionRecords.slice(0, 10).map((r) => ({
          name: r.name,
          entity_id: r.source_id,
          classification: "primary_sanction" as const,
          topics: ["sanction"],
          datasets: [r.source_id],
          countries: r.citizenship ?? [],
          sanction_details: r.sanction_details ?? [],
          last_updated_at: r.last_updated ?? null,
        })),
        lists_queried: DILISENSE_SANCTIONS_LISTS_QUERIED,
        source: "dilisense",
        queried_at: new Date().toISOString(),
      },
      provenance: { source: "dilisense.com", fetched_at: new Date().toISOString() },
    };
  } catch (err) {
    logError("sanctions-check-failed", err);
    throw err instanceof Error ? err : new Error(String(err));
  }
});
