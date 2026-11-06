import { registerCapability, type CapabilityInput } from "./index.js";
import { getCASPRegister, hasUnreadableEndDate, isAuthorisationActive, searchCASP } from "./lib/vasp-data.js";

// F-0-006 Bucket D: reads from a local CASP dataset (lib/vasp-data.ts);
// no outbound network call uses the user input as a destination.

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

  // Throws UpstreamUnavailableError when the register cannot be read, or when
  // ESMA's file is so old it looks frozen: an outage is never sold as
  // `authorized: false` (it used to be, with a note).
  const register = await getCASPRegister();
  const now = new Date();

  const matches = searchCASP(register.records, entityName, website, lei, now);
  // ESMA keeps a withdrawn authorisation in the file with its end date, so a
  // listed row is not always an authorisation in force.
  const authorized = matches.some((m) => isAuthorisationActive(m, now));

  const notes: string[] = [];
  if (matches.length > 0 && !authorized) {
    notes.push(
      matches.some(hasUnreadableEndDate)
        ? "ESMA lists this entity, but a matching record's authorisation end-date cell does not hold a readable date, so no authorisation can be confirmed as in force."
        : "ESMA lists this entity, but every matching record carries a withdrawal date: no authorisation is in force.",
    );
  }
  if (register.stale) {
    notes.push(
      register.ageDays === null
        ? "The age of ESMA's register file could not be established; treat the answer as possibly out of date."
        : `ESMA's register file was last published ${register.ageDays} days ago, longer than its weekly schedule; treat the answer as possibly out of date.`,
    );
  }

  return {
    output: {
      entity_name_searched: entityName,
      match_found: matches.length > 0,
      authorized,
      matches: matches.map((m) => ({
        entity_name: m.entityName,
        commercial_name: m.commercialName,
        home_country: m.homeMemberState,
        lei: m.lei || null,
        website: m.website || null,
        authorization_date: m.authorizationDate || null,
        authorization_end_date: m.authorizationEndDate || null,
        authorization_in_force: isAuthorisationActive(m, now),
        legal_basis: m.legalBasis || null,
        services: m.services,
        passporting_countries: m.passportingCountries,
        nca: m.nca,
        record_last_updated: m.lastUpdate || null,
      })),
      register_entries: register.records.length,
      register_last_updated: register.registerLastUpdated,
      register_age_days: register.ageDays,
      register_stale: register.stale,
      register_fetched_at: register.fetchedAt,
      register_source_url: register.sourceUrl,
      ...(notes.length > 0 ? { note: notes.join(" ") } : {}),
    },
    provenance: { source: "esma.europa.eu (MiCA CASP register)", fetched_at: now.toISOString() },
  };
});
