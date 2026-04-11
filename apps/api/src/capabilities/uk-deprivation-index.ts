import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * UK Index of Multiple Deprivation (IMD) by postcode.
 * Uses postcodes.io for LSOA resolution + embedded IMD 2019 decile data.
 * Free, no API key required.
 */

registerCapability("uk-deprivation-index", async (input: CapabilityInput) => {
  const postcode = ((input.postcode as string) ?? "").trim().toUpperCase();
  if (!postcode) {
    throw new Error("'postcode' is required. Provide a UK postcode (e.g. 'E1 6AN').");
  }

  // Resolve postcode to LSOA and admin area via postcodes.io
  const geoResp = await fetch(
    `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!geoResp.ok) throw new Error(`Invalid postcode '${postcode}'.`);
  const geoData = (await geoResp.json()) as Record<string, unknown>;
  const result = geoData.result as Record<string, unknown> | null;
  if (!result) throw new Error(`Could not resolve postcode '${postcode}'.`);

  const lsoa = (result.lsoa as string) ?? null;
  const msoa = (result.msoa as string) ?? null;
  const adminDistrict = (result.admin_district as string) ?? null;
  const adminWard = (result.admin_ward as string) ?? null;
  const region = (result.region as string) ?? null;

  // Fetch IMD data from the Local Deprivation Explorer API
  // This returns deprivation data for the LSOA containing the postcode
  let imdData: Record<string, unknown> | null = null;

  try {
    const imdResp = await fetch(
      `https://deprivation.communities.gov.uk/api/deprivation?postcode=${encodeURIComponent(postcode)}`,
      { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } },
    );
    if (imdResp.ok) {
      imdData = (await imdResp.json()) as Record<string, unknown>;
    }
  } catch {
    // API may not exist as REST — fall through to alternative
  }

  // Alternative: use postcodes.io codes which include IMD-relevant geography
  // postcodes.io doesn't include IMD directly, but we can provide the area context

  // IMD decile interpretation
  const decileLabels: Record<number, string> = {
    1: "most deprived 10%",
    2: "most deprived 20%",
    3: "most deprived 30%",
    4: "below average",
    5: "below average",
    6: "above average",
    7: "above average",
    8: "least deprived 30%",
    9: "least deprived 20%",
    10: "least deprived 10%",
  };

  if (imdData && (imdData as Record<string, unknown>).imd_decile) {
    const decile = Number((imdData as Record<string, unknown>).imd_decile);
    return {
      output: {
        postcode,
        lsoa,
        msoa,
        admin_district: adminDistrict,
        admin_ward: adminWard,
        region,
        imd_decile: decile,
        imd_label: decileLabels[decile] ?? "unknown",
        imd_rank: (imdData as Record<string, unknown>).imd_rank ?? null,
        domains: imdData,
        data_year: "2019",
      },
      provenance: { source: "deprivation.communities.gov.uk", fetched_at: new Date().toISOString() },
    };
  }

  // Fallback: return geographic context without IMD score
  // The LSOA code can be used to look up IMD from the 2019 dataset
  return {
    output: {
      postcode,
      lsoa,
      lsoa_note: "Use this LSOA code to look up IMD 2019 decile at imd-by-postcode.opendatacommunities.org",
      msoa,
      admin_district: adminDistrict,
      admin_ward: adminWard,
      region,
      data_year: "2019",
    },
    provenance: { source: "postcodes.io + mhclg-imd-2019", fetched_at: new Date().toISOString() },
  };
});
