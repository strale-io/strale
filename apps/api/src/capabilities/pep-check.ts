import { registerCapability, type CapabilityInput } from "./index.js";
import { logError } from "../lib/log.js";
import { getOpenSanctionsCatalog, type CatalogInfo } from "./lib/opensanctions-catalog.js";

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

const DEFAULT_MIN_SCORE = 0.7;

type PepClassification =
  | "pep"
  | "political_role"
  | "relative_or_associate"
  | "other_political";

function classifyTopics(topics: readonly string[]): PepClassification {
  if (topics.includes("role.rca")) return "relative_or_associate";
  if (topics.includes("role.pep")) return "pep";
  if (topics.includes("role.pol")) return "political_role";
  return "other_political";
}

const DILISENSE_CATALOG: CatalogInfo = {
  collection: "dilisense/consolidated",
  list_count: null,
  version: null,
  last_updated_at: null,
};

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

  const rawMinScore = input.min_score;
  const minScore = typeof rawMinScore === "number" && rawMinScore >= 0 && rawMinScore <= 1
    ? rawMinScore
    : DEFAULT_MIN_SCORE;

  // Primary: OpenSanctions API
  const osKey = process.env.OPENSANCTIONS_API_KEY;
  if (osKey) {
    try {
      const properties: Record<string, string[]> = { name: [name] };
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
        const allResults = responses?.q?.results ?? [];

        const pepResults = allResults.filter((r) => {
          const props = (r.properties ?? {}) as Record<string, unknown>;
          const topics = (props.topics ?? []) as string[];
          const score = typeof r.score === "number" ? r.score : 0;
          return score >= minScore && topics.some((t) => PEP_TOPICS.has(t));
        });

        const matches = pepResults.slice(0, 10).map((r) => {
          const props = (r.properties ?? {}) as Record<string, unknown>;
          const topics = (props.topics ?? []) as string[];
          return {
            name: r.caption,
            entity_id: r.id,
            score: r.score,
            classification: classifyTopics(topics),
            topics,
            positions: (props.position ?? []) as string[],
            countries: (props.country ?? props.citizenship ?? []) as string[],
            datasets: ((r.datasets ?? []) as string[]).slice(0, 10),
            last_updated_at: (r.last_change as string) ?? null,
          };
        });

        const catalog = await getOpenSanctionsCatalog();

        return {
          output: {
            query: name,
            country_filter: country ?? null,
            birth_date_filter: birthDate ?? null,
            score_threshold: minScore,
            is_pep: pepResults.length > 0,
            match_count: pepResults.length,
            total_results: allResults.length,
            matches,
            lists_queried: catalog,
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
        const parts = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (parts) params.set("dob", `${parts[3]}/${parts[2]}/${parts[1]}`);
      }

      const res = await fetch(`${DILISENSE_API}?${params}`, {
        headers: { "x-api-key": dilisenseKey },
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
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
            score_threshold: null,
            is_pep: pepRecords.length > 0,
            match_count: pepRecords.length,
            total_results: pepRecords.length,
            matches: pepRecords.slice(0, 10).map((r) => ({
              name: r.name,
              entity_id: r.source_id,
              score: null,
              classification: "pep" as const,
              topics: ["role.pep"],
              positions: r.positions ?? [],
              countries: r.citizenship ?? [],
              datasets: [r.source_id],
              last_updated_at: r.last_updated ?? null,
            })),
            lists_queried: DILISENSE_CATALOG,
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
