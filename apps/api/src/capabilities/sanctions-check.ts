import { registerCapability, type CapabilityInput } from "./index.js";
import { logError } from "../lib/log.js";
import { getOpenSanctionsCatalog, type CatalogInfo } from "./lib/opensanctions-catalog.js";

/**
 * Sanctions screening via OpenSanctions API (real-time, production-grade).
 *
 * Checks against consolidated sanctions lists: OFAC SDN, EU FSF, UN,
 * UK FCDO, AU DFAT, CH SECO, CA DFATD, JP MOF, and 300+ more.
 *
 * Fallback: Dilisense API (if OpenSanctions is unavailable).
 * No LLM fallback — sanctions checks must always hit a real database.
 */

const OPENSANCTIONS_API = "https://api.opensanctions.org/match/default";
const DILISENSE_API = "https://api.dilisense.com/v1";

const COMPANY_SUFFIXES = /\b(AB|AS|Ltd|LLC|Inc|GmbH|SA|BV|NV|Oy|Oyj|PLC|Corp|AG|SE|SRL|Srl|KG|ApS|HB|KB|ANS|DA|ehf|hf|Tbk|Bhd|Pte|Pty|Co|SAS|SARL|SpA|EIRL|OÜ|SIA|UAB|d\.o\.o|s\.r\.o|a\.s)\b\.?/i;

function looksLikeCompany(name: string): boolean {
  return COMPANY_SUFFIXES.test(name);
}

const SANCTION_TOPICS = new Set([
  "sanction",
  "sanction.linked",
  "sanction.counter",
  "export.control",
  "debarment",
  "crime.fin",
]);

const DEFAULT_MIN_SCORE = 0.7;

type SanctionClassification =
  | "primary_sanction"
  | "sectoral_sanction"
  | "linked_to_sanctioned"
  | "debarment"
  | "financial_crime"
  | "other_risk";

function classifyTopics(topics: readonly string[]): SanctionClassification {
  if (topics.includes("sanction")) return "primary_sanction";
  if (topics.includes("export.control")) return "sectoral_sanction";
  if (topics.includes("debarment")) return "debarment";
  if (topics.includes("sanction.linked") || topics.includes("sanction.counter")) return "linked_to_sanctioned";
  if (topics.includes("crime.fin")) return "financial_crime";
  return "other_risk";
}

const DILISENSE_CATALOG: CatalogInfo = {
  collection: "dilisense/consolidated",
  list_count: null,
  version: null,
  last_updated_at: null,
};

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
      if (birthDate && schema === "Person") properties.birthDate = [birthDate];

      const resp = await fetch(OPENSANCTIONS_API, {
        method: "POST",
        headers: {
          "Authorization": `ApiKey ${osKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ queries: { q: { schema, properties } } }),
        signal: AbortSignal.timeout(15000),
      });

      if (resp.ok) {
        const data = (await resp.json()) as Record<string, unknown>;
        const responses = data.responses as Record<string, { results: Array<Record<string, unknown>> }>;
        const allResults = responses?.q?.results ?? [];

        const sanctioned = allResults.filter((r) => {
          const props = (r.properties ?? {}) as Record<string, unknown>;
          const topics = (props.topics ?? []) as string[];
          const score = typeof r.score === "number" ? r.score : 0;
          return score >= minScore && topics.some((t) => SANCTION_TOPICS.has(t));
        });

        const matches = sanctioned.slice(0, 10).map((r) => {
          const props = (r.properties ?? {}) as Record<string, unknown>;
          const topics = (props.topics ?? []) as string[];
          return {
            name: r.caption,
            entity_id: r.id,
            score: r.score,
            classification: classifyTopics(topics),
            topics,
            datasets: ((r.datasets ?? []) as string[]).slice(0, 10),
            countries: (props.country ?? props.citizenship ?? []) as string[],
            last_updated_at: (r.last_change as string) ?? null,
          };
        });

        const catalog = await getOpenSanctionsCatalog();

        return {
          output: {
            query: name,
            schema,
            country_filter: country ?? null,
            birth_date_filter: birthDate ?? null,
            score_threshold: minScore,
            is_sanctioned: sanctioned.length > 0,
            match_count: sanctioned.length,
            total_results: allResults.length,
            matches,
            lists_queried: catalog,
            source: "opensanctions",
            queried_at: new Date().toISOString(),
          },
          provenance: { source: "opensanctions.org", fetched_at: new Date().toISOString() },
        };
      }
      logError("sanctions-check-opensanctions-http", new Error(`OpenSanctions HTTP ${resp.status}`), { status: resp.status });
    } catch (err) {
      logError("sanctions-check-opensanctions-threw", err);
    }
  }

  // Fallback: Dilisense API
  const dilisenseKey = process.env.DILISENSE_API_KEY;
  if (dilisenseKey) {
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

      if (res.ok) {
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
            score_threshold: null,
            is_sanctioned: sanctionRecords.length > 0,
            match_count: sanctionRecords.length,
            total_results: sanctionRecords.length,
            matches: sanctionRecords.slice(0, 10).map((r) => ({
              name: r.name,
              entity_id: r.source_id,
              score: null,
              classification: "primary_sanction" as const,
              topics: ["sanction"],
              datasets: [r.source_id],
              countries: r.citizenship ?? [],
              sanction_details: r.sanction_details ?? [],
              last_updated_at: r.last_updated ?? null,
            })),
            lists_queried: DILISENSE_CATALOG,
            source: "dilisense",
            queried_at: new Date().toISOString(),
          },
          provenance: { source: "dilisense.com", fetched_at: new Date().toISOString() },
        };
      }
    } catch (err) {
      logError("sanctions-check-dilisense-failed", err);
    }
  }

  throw new Error("Sanctions screening unavailable: no working API connection. Configure OPENSANCTIONS_API_KEY or DILISENSE_API_KEY.");
});
