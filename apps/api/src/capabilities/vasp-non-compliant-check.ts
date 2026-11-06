import { registerCapability, type CapabilityInput } from "./index.js";
import { getNonCompliantRegister, searchNonCompliant } from "./lib/vasp-data.js";

// F-0-006 Bucket D: reads from a local CASP dataset (lib/vasp-data.ts);
// no outbound network call uses the user input as a destination.

registerCapability("vasp-non-compliant-check", async (input: CapabilityInput) => {
  const entityName = (
    (input.entity_name as string) ??
    (input.name as string) ??
    (input.company as string) ??
    (input.company_name as string) ??
    ""
  ).trim();
  if (!entityName) throw new Error("'entity_name' is required. Provide the name of a crypto-asset service provider.");
  if (entityName.length < 2) throw new Error("'entity_name' must be at least 2 characters.");

  const website = ((input.website as string) ?? "").trim() || undefined;

  // Throws UpstreamUnavailableError when the register cannot be read, or when
  // ESMA's file is so old it looks frozen: an outage is never sold as
  // `on_non_compliant_list: false`. An empty list here is ESMA's published
  // list having no entries, which is an answer.
  const register = await getNonCompliantRegister();
  const now = new Date();

  const matches = searchNonCompliant(register.records, entityName, website);

  return {
    output: {
      entity_name_searched: entityName,
      on_non_compliant_list: matches.length > 0,
      data_available: true,
      matches: matches.map((m) => ({
        entity_name: m.entityName,
        commercial_name: m.commercialName,
        home_country: m.homeMemberState,
        lei: m.lei || null,
        website: m.website || null,
        infringement: m.infringement || null,
        decision_date: m.decisionDate || null,
        nca: m.nca || null,
        record_last_updated: m.lastUpdate || null,
      })),
      register_entries: register.records.length,
      register_last_updated: register.registerLastUpdated,
      register_age_days: register.ageDays,
      register_stale: register.stale,
      register_fetched_at: register.fetchedAt,
      register_source_url: register.sourceUrl,
      ...(register.stale
        ? {
            note:
              register.ageDays === null
                ? "The age of ESMA's register file could not be established; treat the answer as possibly out of date."
                : `ESMA's register file was last published ${register.ageDays} days ago, longer than its weekly schedule; treat the answer as possibly out of date.`,
          }
        : {}),
    },
    provenance: { source: "esma.europa.eu (MiCA non-compliant register)", fetched_at: now.toISOString() },
  };
});
