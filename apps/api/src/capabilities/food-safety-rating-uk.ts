import { registerCapability, type CapabilityInput } from "./index.js";

// UK Food Standards Agency Ratings API — free, no key required
const API = "https://api.ratings.food.gov.uk";

registerCapability("food-safety-rating-uk", async (input: CapabilityInput) => {
  const name = ((input.name as string) ?? (input.business_name as string) ?? (input.task as string) ?? "").trim();
  if (!name) throw new Error("'name' (business name to search) is required.");

  const location = ((input.location as string) ?? (input.address as string) ?? "").trim();
  const maxResults = Math.min(Number(input.max_results ?? 10), 50);

  let url = `${API}/Establishments?name=${encodeURIComponent(name)}&pageSize=${maxResults}`;
  if (location) url += `&address=${encodeURIComponent(location)}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "x-api-version": "2",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) throw new Error(`FSA API returned HTTP ${response.status}`);

  const data = (await response.json()) as any;
  const establishments = data.establishments ?? [];

  if (establishments.length === 0) {
    throw new Error(`No food businesses found matching "${name}"${location ? ` in ${location}` : ""}.`);
  }

  const results = establishments.map((e: any) => ({
    business_name: e.BusinessName,
    business_type: e.BusinessType,
    rating_value: e.RatingValue,
    rating_date: e.RatingDate,
    address: [e.AddressLine1, e.AddressLine2, e.AddressLine3, e.AddressLine4, e.PostCode]
      .filter(Boolean).join(", "),
    local_authority: e.LocalAuthorityName,
    scores: e.scores ? {
      hygiene: e.scores.Hygiene,
      structural: e.scores.Structural,
      confidence_in_management: e.scores.ConfidenceInManagement,
    } : null,
    fhrs_id: e.FHRSID,
  }));

  // Rating distribution
  const ratings: Record<string, number> = {};
  for (const r of results) {
    ratings[r.rating_value] = (ratings[r.rating_value] ?? 0) + 1;
  }

  return {
    output: {
      search_term: name,
      location: location || null,
      total_results: data.meta?.totalCount ?? establishments.length,
      returned_count: results.length,
      rating_distribution: ratings,
      establishments: results,
    },
    provenance: { source: "api.ratings.food.gov.uk", fetched_at: new Date().toISOString() },
  };
});
