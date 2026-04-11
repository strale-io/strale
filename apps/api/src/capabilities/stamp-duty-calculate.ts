import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * UK Stamp Duty Land Tax (SDLT) calculator.
 * Pure computation — no external API calls.
 * Covers: standard rates, first-time buyer relief, additional property surcharge,
 * non-UK resident surcharge, and Welsh/Scottish variations note.
 */

registerCapability("stamp-duty-calculate", async (input: CapabilityInput) => {
  const price = Number(input.price ?? input.property_price ?? input.amount ?? 0);
  if (!price || price <= 0) {
    throw new Error("'price' is required. Provide the property purchase price in GBP.");
  }

  const isFirstTimeBuyer = input.first_time_buyer === true || input.first_time_buyer === "true";
  const isAdditionalProperty = input.additional_property === true || input.additional_property === "true";
  const isNonUkResident = input.non_uk_resident === true || input.non_uk_resident === "true";

  // Standard SDLT bands (England & Northern Ireland, from April 2025)
  const standardBands = [
    { threshold: 250_000, rate: 0 },
    { threshold: 925_000, rate: 0.05 },
    { threshold: 1_500_000, rate: 0.10 },
    { threshold: Infinity, rate: 0.12 },
  ];

  // First-time buyer bands (properties up to £625,000)
  const ftbBands = [
    { threshold: 425_000, rate: 0 },
    { threshold: 625_000, rate: 0.05 },
  ];

  const ftbEligible = isFirstTimeBuyer && price <= 625_000;
  const bands = ftbEligible ? ftbBands : standardBands;

  let tax = 0;
  let prev = 0;
  const breakdown: Array<{ band: string; rate: string; amount: number }> = [];

  for (const band of bands) {
    const upper = Math.min(price, band.threshold);
    const taxable = Math.max(0, upper - prev);
    const amount = Math.round(taxable * band.rate);
    if (taxable > 0) {
      breakdown.push({
        band: `£${prev.toLocaleString()} – £${band.threshold === Infinity ? "∞" : band.threshold.toLocaleString()}`,
        rate: `${(band.rate * 100).toFixed(0)}%`,
        amount,
      });
    }
    tax += amount;
    prev = band.threshold;
    if (prev >= price) break;
  }

  // Additional property surcharge: 5% on entire price
  let additionalSurcharge = 0;
  if (isAdditionalProperty) {
    additionalSurcharge = Math.round(price * 0.05);
  }

  // Non-UK resident surcharge: 2% on entire price
  let nonResidentSurcharge = 0;
  if (isNonUkResident) {
    nonResidentSurcharge = Math.round(price * 0.02);
  }

  const totalTax = tax + additionalSurcharge + nonResidentSurcharge;
  const effectiveRate = price > 0 ? ((totalTax / price) * 100).toFixed(2) : "0.00";

  return {
    output: {
      property_price: price,
      stamp_duty: totalTax,
      base_sdlt: tax,
      additional_property_surcharge: additionalSurcharge,
      non_uk_resident_surcharge: nonResidentSurcharge,
      effective_rate: `${effectiveRate}%`,
      first_time_buyer_relief: ftbEligible,
      breakdown,
      applies_to: "England and Northern Ireland",
      note: price > 625_000 && isFirstTimeBuyer
        ? "First-time buyer relief not available for properties over £625,000. Standard rates applied."
        : null,
    },
    provenance: { source: "hmrc-sdlt-rates", fetched_at: new Date().toISOString() },
  };
});
