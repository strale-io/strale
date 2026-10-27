import { registerCapability, type CapabilityInput } from "./index.js";
import { CapabilityRefusalError } from "../lib/capability-refusal.js";
import { fetchNtaCorporations, mapNtaCorporation, ntaError, NTA_ATTRIBUTION, NTA_SOURCE, validCorporateNumber } from "../lib/nta-corporate.js";

registerCapability("japanese-company-data", async (input: CapabilityInput) => {
  // corporate_number historically also accepted a company name. Keep that
  // contract and the company_name/task aliases without LLM name resolution.
  const raw = input.corporate_number ?? input.company_name ?? input.task;
  if (typeof raw !== "string" || [...raw.trim()].length < 2) {
    throw Object.assign(new CapabilityRefusalError("'corporate_number' or 'company_name' must be a corporate number or a name of at least 2 characters."), { error_code: "invalid_request" });
  }
  const query = raw.normalize("NFKC").trim();
  const numbers = [...new Set(query.match(/(?<!\d)\d{13}(?!\d)/g) ?? [])];
  if (numbers.length > 1) {
    throw Object.assign(new CapabilityRefusalError("Ambiguous corporate numbers: provide a single 13-digit corporate number."), { error_code: "invalid_request" });
  }
  const compact = numbers[0] ?? query.replace(/^T(?=\d{13}$)/i, "").replace(/[\s.-]/g, "");
  const byNumber = /^\d+$/.test(compact);
  if (byNumber && !validCorporateNumber(compact)) {
    throw Object.assign(new CapabilityRefusalError("'corporate_number' must be 13 digits with a valid NTA check digit."), { error_code: "invalid_request" });
  }
  if (!byNumber && [...query].length > 150) {
    throw Object.assign(new CapabilityRefusalError("'company_name' must be at most 150 characters."), { error_code: "invalid_request" });
  }
  const result = await fetchNtaCorporations(byNumber ? compact : query, byNumber);
  if (result.count === 0) throw ntaError("not_found", "No Japanese company found. Check the number or use the registered Japanese or English name.");
  const record = byNumber ? result.records[0] : pickByName(result.records, query, result.count);
  if (byNumber && record.corporateNumber !== compact) throw ntaError("execution_failed", "NTA returned a different corporate number. Contact Strale support.");
  return {
    output: mapNtaCorporation(record),
    provenance: {
      source: NTA_SOURCE,
      fetched_at: new Date().toISOString(),
      acquisition_method: "direct_api",
      data_access_lane: "preferred",
      upstream_vendor: "nta-houjin",
      api_version: "4",
      register_last_updated: result.lastUpdateDate,
      attribution: NTA_ATTRIBUTION,
    },
  };
});

// A name search resolves only to an exact, open, current match that is the
// only one; anything else is refused with candidates to choose from.
function pickByName(records: Record<string, string>[], query: string, count: number): Record<string, string> {
  const norm = (s: string | undefined) => (s ?? "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  const q = norm(query);
  const open = (r: Record<string, string>) => r.latest === "1" && mapNtaCorporation(r).status === "active";
  const exact = records.filter((r) => open(r) && (norm(r.name) === q || norm(r.enName) === q));
  if (count === records.length && exact.length === 1) return exact[0];
  const candidates = records.slice(0, 5).map((r) => `${r.name} (${r.corporateNumber})`).join("; ");
  throw Object.assign(
    new CapabilityRefusalError(`Ambiguous Japanese company name: no unique exact, open, current match in a complete result set. Provide the 13-digit corporate number, for example one of: ${candidates}.`),
    { error_code: "invalid_request" },
  );
}
