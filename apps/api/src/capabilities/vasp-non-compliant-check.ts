import { registerCapability, type CapabilityInput } from "./index.js";
import { getNonCompliantData, searchNonCompliant, getCASPCacheAge } from "./lib/vasp-data.js";

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

  const records = await getNonCompliantData();
  const now = new Date().toISOString();

  // Non-compliant list may not exist yet — handle gracefully
  if (records.length === 0) {
    return {
      output: {
        entity_name_searched: entityName,
        on_non_compliant_list: false,
        data_available: false,
        matches: [],
        register_last_updated: null,
        note: "ESMA's non-compliant CASP register is not currently available or may not yet be published. This does not confirm compliance.",
      },
      provenance: { source: "esma.europa.eu (MiCA non-compliant register)", fetched_at: now },
    };
  }

  const matches = searchNonCompliant(records, entityName, website);

  return {
    output: {
      entity_name_searched: entityName,
      on_non_compliant_list: matches.length > 0,
      data_available: true,
      matches: matches.map((m) => ({
        entity_name: m.entityName,
        commercial_name: m.commercialName,
        home_country: m.homeMemberState,
        website: m.website || null,
        infringement: m.infringement || null,
      })),
      register_entries: records.length,
      register_last_updated: getCASPCacheAge(),
    },
    provenance: { source: "esma.europa.eu (MiCA non-compliant register)", fetched_at: now },
  };
});
