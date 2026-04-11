import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * UK Energy Performance Certificate (EPC) rating lookup.
 * Uses the Open Data Communities EPC API (free, requires registration).
 * Falls back to typical band estimation if API key not available.
 */

registerCapability("uk-epc-rating", async (input: CapabilityInput) => {
  const postcode = ((input.postcode as string) ?? "").trim().toUpperCase();
  const address = ((input.address as string) ?? "").trim();

  if (!postcode) {
    throw new Error("'postcode' is required. Optionally provide 'address' to filter results.");
  }

  const apiKey = process.env.EPC_API_KEY;

  if (apiKey) {
    return fetchFromEpcApi(postcode, address, apiKey);
  }

  // Fallback: return general EPC info for the postcode area
  return estimateEpc(postcode);
});

async function fetchFromEpcApi(
  postcode: string,
  address: string,
  apiKey: string,
): Promise<{ output: Record<string, unknown>; provenance: { source: string; fetched_at: string } }> {
  const encoded = Buffer.from(`${apiKey}:`).toString("base64");
  const url = `https://epc.opendatacommunities.org/api/v1/domestic/search?postcode=${encodeURIComponent(postcode)}&size=10`;

  const resp = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${encoded}`,
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) {
    throw new Error(`EPC API returned HTTP ${resp.status}.`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  const rows = (data.rows ?? []) as Array<Record<string, unknown>>;

  if (rows.length === 0) {
    throw new Error(`No EPC records found for postcode '${postcode}'.`);
  }

  // Filter by address if provided
  let matches = rows;
  if (address) {
    const lowerAddr = address.toLowerCase();
    const filtered = rows.filter((r) =>
      String(r.address ?? "").toLowerCase().includes(lowerAddr),
    );
    if (filtered.length > 0) matches = filtered;
  }

  // Take most recent certificate
  matches.sort((a, b) => {
    const dateA = String(a["lodgement-date"] ?? "");
    const dateB = String(b["lodgement-date"] ?? "");
    return dateB.localeCompare(dateA);
  });

  const cert = matches[0];

  return {
    output: {
      address: cert.address,
      postcode: cert.postcode,
      current_rating: cert["current-energy-rating"],
      current_efficiency: Number(cert["current-energy-efficiency"] ?? 0),
      potential_rating: cert["potential-energy-rating"],
      potential_efficiency: Number(cert["potential-energy-efficiency"] ?? 0),
      property_type: cert["property-type"],
      built_form: cert["built-form"],
      floor_area: cert["total-floor-area"] ? Number(cert["total-floor-area"]) : null,
      inspection_date: cert["inspection-date"],
      lodgement_date: cert["lodgement-date"],
      transaction_type: cert["transaction-type"],
      heating_cost_current: cert["heating-cost-current"] ? Number(cert["heating-cost-current"]) : null,
      heating_cost_potential: cert["heating-cost-potential"] ? Number(cert["heating-cost-potential"]) : null,
      total_results: rows.length,
    },
    provenance: { source: "epc.opendatacommunities.org", fetched_at: new Date().toISOString() },
  };
}

async function estimateEpc(
  postcode: string,
): Promise<{ output: Record<string, unknown>; provenance: { source: string; fetched_at: string } }> {
  // Without API key, provide EPC band distribution context
  // Based on DLUHC EPC statistics: England average is band D (60-69)
  return {
    output: {
      postcode,
      note: "EPC_API_KEY not configured. Register free at https://epc.opendatacommunities.org to get per-property EPC data.",
      england_average_rating: "D",
      england_average_efficiency: 64,
      band_scale: {
        A: "92-100 (most efficient)",
        B: "81-91",
        C: "69-80",
        D: "55-68 (average)",
        E: "39-54",
        F: "21-38",
        G: "1-20 (least efficient)",
      },
    },
    provenance: { source: "dluhc-epc-statistics", fetched_at: new Date().toISOString() },
  };
}
