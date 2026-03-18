import { registerCapability, type CapabilityInput } from "./index.js";

// OpenOwnership Register (BODS) — free, no key needed
const OPENOWNERSHIP_API = "https://register.openownership.org/api/v0.4";

registerCapability("beneficial-ownership-lookup", async (input: CapabilityInput) => {
  const companyName = ((input.company_name as string) ?? (input.name as string) ?? (input.task as string) ?? "").trim();
  if (!companyName) {
    throw new Error("'company_name' is required.");
  }

  const jurisdiction = ((input.jurisdiction as string) ?? (input.country_code as string) ?? "").trim().toUpperCase() || undefined;
  const companyNumber = ((input.company_number as string) ?? "").trim() || undefined;

  // Try OpenOwnership BODS API
  const searchQuery = companyNumber || companyName;
  const url = `${OPENOWNERSHIP_API}/entities?q=${encodeURIComponent(searchQuery)}&page=1&per_page=5`;

  let ownershipData: any[] = [];
  let dataSource = "openownership.org";
  let companyMatch: any = null;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      const data = (await res.json()) as any;
      const entities = data?.data ?? data ?? [];

      // Find the best company match
      const companies = (Array.isArray(entities) ? entities : []).filter(
        (e: any) => e.type === "registeredEntity" || e.entity_type === "registeredEntity",
      );

      if (companies.length > 0) {
        companyMatch = companies[0];

        // Fetch ownership statements for this entity
        const entityId = companyMatch.id ?? companyMatch._id;
        if (entityId) {
          const statementsUrl = `${OPENOWNERSHIP_API}/statements?subject=${encodeURIComponent(entityId)}&statementType=ownershipOrControlStatement&per_page=20`;
          const stmtRes = await fetch(statementsUrl, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(10000),
          });

          if (stmtRes.ok) {
            const stmtData = (await stmtRes.json()) as any;
            ownershipData = stmtData?.data ?? stmtData ?? [];
          }
        }
      }
    }
  } catch (err) {
    console.error("[beneficial-ownership] OpenOwnership error:", err instanceof Error ? err.message : err);
  }

  // If OpenOwnership didn't return data and it's a UK company, try Companies House PSC
  if (ownershipData.length === 0 && (jurisdiction === "GB" || jurisdiction === "UK") && companyNumber) {
    const chKey = process.env.COMPANIES_HOUSE_API_KEY;
    if (chKey) {
      try {
        const chUrl = `https://api.company-information.service.gov.uk/company/${encodeURIComponent(companyNumber)}/persons-with-significant-control`;
        const chRes = await fetch(chUrl, {
          headers: {
            Authorization: `Basic ${Buffer.from(chKey + ":").toString("base64")}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(10000),
        });

        if (chRes.ok) {
          const chData = (await chRes.json()) as any;
          const pscs = chData?.items ?? [];
          ownershipData = pscs.map((psc: any) => ({
            name: psc.name ?? psc.name_elements?.forename + " " + psc.name_elements?.surname,
            ownership_percentage: parseOwnershipNature(psc.natures_of_control ?? []),
            control_type: psc.kind ?? "person-with-significant-control",
            nationality: psc.nationality ?? null,
            date_from: psc.notified_on ?? null,
            country_of_residence: psc.country_of_residence ?? null,
          }));
          dataSource = "companies-house-uk";
        }
      } catch (err) {
        console.error("[beneficial-ownership] Companies House error:", err instanceof Error ? err.message : err);
      }
    }
  }

  // Format results
  const beneficialOwners = ownershipData.length > 0 && dataSource === "companies-house-uk"
    ? ownershipData
    : (Array.isArray(ownershipData) ? ownershipData : []).map((stmt: any) => {
        const interested = stmt.interestedParty ?? stmt.interested_party ?? {};
        return {
          name: interested.name ?? interested.unspecifiedEntityDetails?.name ?? "Unknown",
          ownership_percentage: stmt.interests?.[0]?.share?.exact ?? stmt.interests?.[0]?.share?.minimum ?? null,
          control_type: stmt.interests?.[0]?.type ?? "ownership",
          nationality: interested.nationalities?.[0]?.code ?? null,
          date_from: stmt.statementDate ?? null,
        };
      });

  return {
    output: {
      query: companyName,
      company_number: companyNumber ?? null,
      jurisdiction: jurisdiction ?? null,
      beneficial_owners: beneficialOwners.slice(0, 20),
      total_owners: beneficialOwners.length,
      company_match: companyMatch
        ? { name: companyMatch.name ?? companyMatch.company_name, identifier: companyMatch.identifiers?.[0]?.id ?? null }
        : null,
      data_source: dataSource,
      lookup_date: new Date().toISOString(),
      coverage_note: ownershipData.length === 0
        ? "No beneficial ownership data found. Coverage varies by jurisdiction — UK and some EU countries have the best public registers."
        : null,
    },
    provenance: { source: dataSource, fetched_at: new Date().toISOString() },
  };
});

function parseOwnershipNature(natures: string[]): string | null {
  for (const n of natures) {
    if (n.includes("75-to-100")) return "75-100%";
    if (n.includes("50-to-75")) return "50-75%";
    if (n.includes("25-to-50")) return "25-50%";
  }
  return natures.length > 0 ? natures[0] : null;
}
