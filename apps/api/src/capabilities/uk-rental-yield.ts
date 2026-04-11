import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * UK gross rental yield estimate.
 * Combines Land Registry sold prices with ONS rental data
 * to compute an approximate yield for a postcode.
 * Uses free APIs — no key required.
 */

// ONS median monthly rents by region (2024-25 data, private rental market)
// Source: ONS Private Rental Market Statistics
const REGIONAL_RENTS: Record<string, number> = {
  "london": 1850,
  "south east": 1200,
  "east of england": 1100,
  "south west": 950,
  "west midlands": 850,
  "east midlands": 800,
  "north west": 800,
  "yorkshire and the humber": 750,
  "north east": 650,
  "wales": 700,
  "scotland": 800,
  "northern ireland": 700,
  "england": 950, // national average fallback
};

registerCapability("uk-rental-yield", async (input: CapabilityInput) => {
  const postcode = ((input.postcode as string) ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!postcode) {
    throw new Error("'postcode' is required. Provide a UK postcode (e.g. 'E1 6AN').");
  }

  const customRent = Number(input.monthly_rent ?? 0);
  const customPrice = Number(input.purchase_price ?? 0);

  // 1. Get postcode region via postcodes.io
  const geoResp = await fetch(
    `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!geoResp.ok) throw new Error(`Invalid postcode '${postcode}'.`);
  const geoData = (await geoResp.json()) as Record<string, unknown>;
  const result = geoData.result as Record<string, unknown> | null;
  if (!result) throw new Error(`Could not resolve postcode '${postcode}'.`);

  const region = (result.region as string) ?? "england";
  const lowerRegion = region.toLowerCase();

  // 2. Get average sold price from Land Registry (last 10 transactions)
  let avgSoldPrice = customPrice;
  let priceSource = "user-provided";

  if (!customPrice) {
    const lrUrl = `https://landregistry.data.gov.uk/data/ppi/transaction-record.json?_pageSize=10&_sort=-transactionDate&propertyAddress.postcode=${encodeURIComponent(postcode)}`;
    const lrResp = await fetch(lrUrl, {
      signal: AbortSignal.timeout(15000),
      headers: { Accept: "application/json" },
    });

    if (lrResp.ok) {
      const lrData = (await lrResp.json()) as Record<string, unknown>;
      const items = ((lrData.result as Record<string, unknown>)?.items ?? []) as Array<Record<string, unknown>>;
      const prices = items
        .map((i) => Number(i.pricePaid ?? 0))
        .filter((p) => p > 0);

      if (prices.length > 0) {
        avgSoldPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
        priceSource = "land-registry-average";
      }
    }

    if (!avgSoldPrice) {
      throw new Error(`No sold price data found for postcode '${postcode}'. Provide 'purchase_price' manually.`);
    }
  }

  // 3. Estimate monthly rent from ONS regional data
  let monthlyRent = customRent;
  let rentSource = "user-provided";

  if (!customRent) {
    monthlyRent = REGIONAL_RENTS[lowerRegion] ?? REGIONAL_RENTS["england"];
    rentSource = `ons-regional-median (${region})`;
  }

  // 4. Compute gross yield
  const annualRent = monthlyRent * 12;
  const grossYield = avgSoldPrice > 0 ? ((annualRent / avgSoldPrice) * 100) : 0;

  const yieldLabel =
    grossYield >= 8 ? "excellent" :
    grossYield >= 6 ? "good" :
    grossYield >= 4 ? "average" :
    grossYield >= 2 ? "below average" :
    "poor";

  return {
    output: {
      postcode,
      region,
      gross_yield_percent: Math.round(grossYield * 100) / 100,
      yield_label: yieldLabel,
      estimated_monthly_rent: monthlyRent,
      rent_source: rentSource,
      average_property_price: avgSoldPrice,
      price_source: priceSource,
      annual_rent: annualRent,
      currency: "GBP",
    },
    provenance: { source: "landregistry.data.gov.uk + ons-rental-statistics", fetched_at: new Date().toISOString() },
  };
});
