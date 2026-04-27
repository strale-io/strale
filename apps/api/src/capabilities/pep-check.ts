import { registerCapability, type CapabilityInput } from "./index.js";
import { logError } from "../lib/log.js";
import { DILISENSE_PEP_LISTS_QUERIED } from "./lib/dilisense-sources.js";

/**
 * PEP (Politically Exposed Person) screening via Dilisense.
 *
 * Covers 230+ geopolitical territories aligned with EU C/2023/724 PEP
 * function definitions. Includes RCAs (Relatives and Close Associates).
 * See lib/dilisense-sources.ts for the full attributed list.
 */

const DILISENSE_API = "https://api.dilisense.com/v1/checkIndividual";

registerCapability("pep-check", async (input: CapabilityInput) => {
  const name = ((input.name as string) ?? (input.full_name as string) ?? "").trim();
  if (!name) {
    throw new Error("'name' is required. Provide a person's full name to screen.");
  }
  if (name.length < 2) {
    throw new Error("Name must be at least 2 characters for PEP screening.");
  }

  const country = ((input.country as string) ?? "").trim().toUpperCase() || undefined;
  const birthDate = ((input.date_of_birth as string) ?? (input.birth_date as string) ?? "").trim() || undefined;

  const dilisenseKey = process.env.DILISENSE_API_KEY;
  if (!dilisenseKey) {
    throw new Error("PEP screening unavailable: DILISENSE_API_KEY not configured.");
  }

  try {
    const params = new URLSearchParams({ names: name, fuzzy_search: "1" });
    if (birthDate) {
      const parts = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (parts) params.set("dob", `${parts[3]}/${parts[2]}/${parts[1]}`);
    }

    const res = await fetch(`${DILISENSE_API}?${params}`, {
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
        source_type: string;
        source_id: string;
        pep_type?: string;
        positions?: string[];
        citizenship?: string[];
        last_updated?: string;
      }>;
    };

    const pepRecords = data.found_records.filter((r) => r.source_type === "PEP");
    return {
      output: {
        query: name,
        country_filter: country ?? null,
        birth_date_filter: birthDate ?? null,
        is_pep: pepRecords.length > 0,
        match_count: pepRecords.length,
        total_results: pepRecords.length,
        matches: pepRecords.slice(0, 10).map((r) => ({
          name: r.name,
          entity_id: r.source_id,
          classification: "pep" as const,
          topics: ["role.pep"],
          positions: r.positions ?? [],
          countries: r.citizenship ?? [],
          datasets: [r.source_id],
          last_updated_at: r.last_updated ?? null,
        })),
        lists_queried: DILISENSE_PEP_LISTS_QUERIED,
        source: "dilisense",
        screened_at: new Date().toISOString(),
      },
      provenance: { source: "dilisense.com", fetched_at: new Date().toISOString() },
    };
  } catch (err) {
    logError("pep-check-failed", err);
    throw err instanceof Error ? err : new Error(String(err));
  }
});
