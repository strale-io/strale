import { registerCapability, type CapabilityInput } from "./index.js";
import { logError } from "../lib/log.js";

/**
 * Sanctions screening via OpenSanctions API (real-time, production-grade).
 *
 * Checks against consolidated sanctions lists: OFAC SDN, EU FSF, UN,
 * UK FCDO, AU DFAT, CH SECO, CA DFATD, JP MOF, and 20+ more.
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

const SANCTION_TOPICS = new Set(["sanction", "sanction.linked", "debarment", "export.control", "crime.fin"]);

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

  // Primary: OpenSanctions API
  const osKey = process.env.OPENSANCTIONS_API_KEY;
  if (osKey) {
    try {
      const query: Record<string, unknown> = {
        schema,
        properties: {
          name: [name],
          ...(country ? { country: [country.toLowerCase()] } : {}),
        },
      };

      const resp = await fetch(OPENSANCTIONS_API, {
        method: "POST",
        headers: {
          "Authorization": `ApiKey ${osKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ queries: { q: query } }),
        signal: AbortSignal.timeout(15000),
      });

      if (resp.ok) {
        const data = (await resp.json()) as Record<string, unknown>;
        const responses = data.responses as Record<string, { results: Array<Record<string, unknown>> }>;
        const results = responses?.q?.results ?? [];

        const sanctioned = results.filter((r) => {
          const topics = ((r.properties as Record<string, unknown>)?.topics ?? []) as string[];
          return topics.some((t) => SANCTION_TOPICS.has(t));
        });

        const matches = sanctioned.slice(0, 10).map((r) => {
          const props = r.properties as Record<string, unknown>;
          return {
            name: r.caption,
            entity_id: r.id,
            score: r.score,
            topics: (props.topics ?? []) as string[],
            datasets: ((r.datasets ?? []) as string[]).slice(0, 10),
            countries: (props.country ?? props.citizenship ?? []) as string[],
          };
        });

        const listsChecked = new Set<string>();
        for (const m of matches) for (const d of m.datasets) listsChecked.add(d);

        return {
          output: {
            query: name,
            schema,
            country_filter: country ?? null,
            is_sanctioned: sanctioned.length > 0,
            match_count: sanctioned.length,
            total_results: results.length,
            matches,
            lists_checked: listsChecked.size > 0
              ? [...listsChecked]
              : ["OFAC SDN", "EU FSF", "UN Security Council", "UK FCDO", "AU DFAT", "CH SECO"],
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
      const res = await fetch(`${DILISENSE_API}/${endpoint}?${params}`, {
        headers: { "x-api-key": dilisenseKey },
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          found_records: Array<{
            name: string; source_id: string; source_type: string;
            sanction_details?: string[]; citizenship?: string[];
          }>;
        };

        const sanctionRecords = data.found_records.filter((r) => r.source_type === "SANCTION");
        return {
          output: {
            query: name,
            schema,
            country_filter: country ?? null,
            is_sanctioned: sanctionRecords.length > 0,
            match_count: sanctionRecords.length,
            matches: sanctionRecords.slice(0, 10).map((r) => ({
              name: r.name, entity_id: r.source_id,
              sanction_details: r.sanction_details ?? [], countries: r.citizenship ?? [],
            })),
            lists_checked: ["dilisense (consolidated: OFAC, EU, UN, UK OFSI)"],
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
