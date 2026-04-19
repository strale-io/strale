import { registerCapability, type CapabilityInput } from "./index.js";
import { logError } from "../lib/log.js";

/**
 * PEP (Politically Exposed Person) screening via OpenSanctions API.
 *
 * Checks against PEP databases including government positions,
 * family members, and close associates (RCA).
 *
 * Fallback: Dilisense API. No LLM fallback.
 */

const OPENSANCTIONS_API = "https://api.opensanctions.org/match/default";
const DILISENSE_API = "https://api.dilisense.com/v1/checkIndividual";

const PEP_TOPICS = new Set(["role.pep", "role.pol", "role.rca"]);

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

  // Primary: OpenSanctions API
  const osKey = process.env.OPENSANCTIONS_API_KEY;
  if (osKey) {
    try {
      const properties: Record<string, unknown> = { name: [name] };
      if (country) properties.country = [country.toLowerCase()];
      if (birthDate) properties.birthDate = [birthDate];

      const resp = await fetch(OPENSANCTIONS_API, {
        method: "POST",
        headers: {
          "Authorization": `ApiKey ${osKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ queries: { q: { schema: "Person", properties } } }),
        signal: AbortSignal.timeout(15000),
      });

      if (resp.ok) {
        const data = (await resp.json()) as Record<string, unknown>;
        const responses = data.responses as Record<string, { results: Array<Record<string, unknown>> }>;
        const results = responses?.q?.results ?? [];

        const pepResults = results.filter((r) => {
          const topics = ((r.properties as Record<string, unknown>)?.topics ?? []) as string[];
          return topics.some((t) => PEP_TOPICS.has(t));
        });

        const matches = pepResults.slice(0, 10).map((r) => {
          const props = r.properties as Record<string, unknown>;
          return {
            name: r.caption,
            entity_id: r.id,
            score: r.score,
            pep_type: (props.topics as string[] ?? []).find((t) => PEP_TOPICS.has(t)) ?? "role.pep",
            positions: (props.position ?? []) as string[],
            countries: (props.country ?? props.citizenship ?? []) as string[],
            classification: (props.classification ?? []) as string[],
            datasets: ((r.datasets ?? []) as string[]).slice(0, 5),
          };
        });

        return {
          output: {
            query: name,
            country_filter: country ?? null,
            is_pep: pepResults.length > 0,
            match_count: pepResults.length,
            total_results: results.length,
            matches,
            source: "opensanctions",
            screened_at: new Date().toISOString(),
          },
          provenance: { source: "opensanctions.org", fetched_at: new Date().toISOString() },
        };
      }
      logError("pep-check-opensanctions-http", new Error(`OpenSanctions HTTP ${resp.status}`), { status: resp.status });
    } catch (err) {
      logError("pep-check-opensanctions-threw", err);
    }
  }

  // Fallback: Dilisense API
  const dilisenseKey = process.env.DILISENSE_API_KEY;
  if (dilisenseKey) {
    try {
      const params = new URLSearchParams({ names: name, fuzzy_search: "1" });
      if (birthDate) {
        const parts = birthDate.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (parts) params.set("dob", `${parts[3]}/${parts[2]}/${parts[1]}`);
      }

      const res = await fetch(`${DILISENSE_API}?${params}`, {
        headers: { "x-api-key": dilisenseKey },
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          found_records: Array<{
            name: string; source_type: string; source_id: string;
            pep_type?: string; positions?: string[]; citizenship?: string[];
          }>;
        };

        const pepRecords = data.found_records.filter((r) => r.source_type === "PEP");
        return {
          output: {
            query: name,
            country_filter: country ?? null,
            is_pep: pepRecords.length > 0,
            match_count: pepRecords.length,
            matches: pepRecords.slice(0, 10).map((r) => ({
              name: r.name, pep_type: r.pep_type ?? "UNKNOWN",
              positions: r.positions ?? [], countries: r.citizenship ?? [],
            })),
            source: "dilisense",
            screened_at: new Date().toISOString(),
          },
          provenance: { source: "dilisense.com", fetched_at: new Date().toISOString() },
        };
      }
    } catch (err) {
      logError("pep-check-dilisense-failed", err);
    }
  }

  throw new Error("PEP screening unavailable: no working API connection. Configure OPENSANCTIONS_API_KEY or DILISENSE_API_KEY.");
});
