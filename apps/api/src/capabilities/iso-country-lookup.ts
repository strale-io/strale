import { registerCapability, type CapabilityInput } from "./index.js";
import { searchCountries } from "./lib/iso-3166.js";

registerCapability("iso-country-lookup", async (input: CapabilityInput) => {
  const raw = (
    (input.query as string) ??
    (input.country as string) ??
    (input.code as string) ??
    (input.task as string) ??
    ""
  ).trim();
  if (!raw) {
    throw new Error(
      "'query' or 'country' is required. Provide a country name, alpha-2/alpha-3 code, or numeric code.",
    );
  }

  const matches = searchCountries(raw);

  if (matches.length === 1) {
    return {
      output: {
        query: raw,
        match: matches[0],
      },
      provenance: {
        source: "algorithmic",
        fetched_at: new Date().toISOString(),
      },
    };
  }

  return {
    output: {
      query: raw,
      matches,
      total_matches: matches.length,
      ...(matches.length === 0
        ? { error: `No country found matching "${raw}".` }
        : {}),
    },
    provenance: {
      source: "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
