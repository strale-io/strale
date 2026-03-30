import { registerCapability, type CapabilityInput } from "./index.js";
import { getCASPData, searchCASP, getCASPCacheAge } from "./lib/vasp-data.js";

registerCapability("vasp-verify", async (input: CapabilityInput) => {
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
  const lei = ((input.lei as string) ?? "").trim() || undefined;

  const records = await getCASPData();
  const now = new Date().toISOString();

  if (records.length === 0) {
    return {
      output: {
        entity_name_searched: entityName,
        match_found: false,
        authorized: false,
        matches: [],
        register_last_updated: getCASPCacheAge(),
        note: "ESMA CASP register data is currently unavailable. This does not mean the entity is unauthorized — retry later.",
      },
      provenance: { source: "esma.europa.eu (MiCA CASP register)", fetched_at: now },
    };
  }

  const matches = searchCASP(records, entityName, website, lei);

  return {
    output: {
      entity_name_searched: entityName,
      match_found: matches.length > 0,
      authorized: matches.length > 0,
      matches: matches.map((m) => ({
        entity_name: m.entityName,
        commercial_name: m.commercialName,
        home_country: m.homeMemberState,
        lei: m.lei || null,
        website: m.website || null,
        authorization_date: m.authorizationDate || null,
        services: m.services,
        passporting_countries: m.passportingCountries,
        nca: m.nca,
      })),
      register_entries: records.length,
      register_last_updated: getCASPCacheAge(),
    },
    provenance: { source: "esma.europa.eu (MiCA CASP register)", fetched_at: now },
  };
});
