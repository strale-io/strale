import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * UK Council Tax band and estimated annual bill lookup.
 * Pure computation using reference data — no external API.
 * Average bills per band from DLUHC statistical release 2025-26.
 */

// Average council tax by band (England average 2025-26, Band D = £2,171)
// Ratios: A=6/9, B=7/9, C=8/9, D=9/9, E=11/9, F=13/9, G=15/9, H=18/9
const BAND_D_AVERAGE = 2171;
const BAND_RATIOS: Record<string, number> = {
  A: 6 / 9,
  B: 7 / 9,
  C: 8 / 9,
  D: 9 / 9,
  E: 11 / 9,
  F: 13 / 9,
  G: 15 / 9,
  H: 18 / 9,
};

// Property value ranges per band (England, based on April 1991 values)
const BAND_RANGES: Record<string, string> = {
  A: "Up to £40,000",
  B: "£40,001 – £52,000",
  C: "£52,001 – £68,000",
  D: "£68,001 – £88,000",
  E: "£88,001 – £120,000",
  F: "£120,001 – £160,000",
  G: "£160,001 – £320,000",
  H: "Over £320,000",
};

function estimateBandFromPrice(price: number): string {
  // These are 1991 values. For modern prices, apply rough deflator (~3.5x)
  const adjustedPrice = price / 3.5;
  if (adjustedPrice <= 40000) return "A";
  if (adjustedPrice <= 52000) return "B";
  if (adjustedPrice <= 68000) return "C";
  if (adjustedPrice <= 88000) return "D";
  if (adjustedPrice <= 120000) return "E";
  if (adjustedPrice <= 160000) return "F";
  if (adjustedPrice <= 320000) return "G";
  return "H";
}

registerCapability("council-tax-lookup", async (input: CapabilityInput) => {
  const band = ((input.band as string) ?? "").toUpperCase().trim();
  const price = Number(input.price ?? input.property_price ?? 0);

  if (!band && !price) {
    throw new Error("'band' (A-H) or 'price' (property value in GBP) is required.");
  }

  const resolvedBand = band && BAND_RATIOS[band] ? band : price > 0 ? estimateBandFromPrice(price) : null;

  if (!resolvedBand || !BAND_RATIOS[resolvedBand]) {
    throw new Error(`Invalid band '${band}'. Must be A-H.`);
  }

  const ratio = BAND_RATIOS[resolvedBand];
  const estimatedAnnualBill = Math.round(BAND_D_AVERAGE * ratio);
  const monthlyEstimate = Math.round(estimatedAnnualBill / 12);

  return {
    output: {
      band: resolvedBand,
      estimated_from_price: !band && price > 0,
      property_value_range_1991: BAND_RANGES[resolvedBand],
      estimated_annual_bill: estimatedAnnualBill,
      estimated_monthly_bill: monthlyEstimate,
      band_d_average: BAND_D_AVERAGE,
      ratio_to_band_d: ratio.toFixed(4),
      currency: "GBP",
      tax_year: "2025-26",
      note: "Estimate based on England average. Actual bills vary by local authority. Bills shown exclude any single person discount (25%).",
    },
    provenance: { source: "dluhc-council-tax-statistics", fetched_at: new Date().toISOString() },
  };
});
