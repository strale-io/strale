import { registerCapability, type CapabilityInput } from "./index.js";

// Shipping cost estimate — algorithmic based on published rate guides
// Zone-based pricing for PostNord (Nordics), DHL, UPS

interface ShippingEstimate {
  carrier: string;
  service: string;
  price: number;
  currency: string;
  delivery_days: string;
}

type Zone = "domestic" | "nordic" | "eu" | "worldwide";

const NORDIC_COUNTRIES = new Set(["SE", "NO", "DK", "FI", "IS"]);
const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
]);

function getZone(origin: string, destination: string): Zone {
  if (origin === destination) return "domestic";
  if (NORDIC_COUNTRIES.has(origin) && NORDIC_COUNTRIES.has(destination)) return "nordic";
  if (EU_COUNTRIES.has(origin) && EU_COUNTRIES.has(destination)) return "eu";
  return "worldwide";
}

// Weight bracket multipliers (base price is for 0-1kg)
function getWeightMultiplier(weightKg: number): number {
  if (weightKg <= 1) return 1.0;
  if (weightKg <= 5) return 1.5 + (weightKg - 1) * 0.15;
  if (weightKg <= 10) return 2.1 + (weightKg - 5) * 0.12;
  if (weightKg <= 20) return 2.7 + (weightKg - 10) * 0.1;
  if (weightKg <= 30) return 3.7 + (weightKg - 20) * 0.08;
  return 4.5 + (weightKg - 30) * 0.06;
}

// Base rates by zone and service level (in EUR for 0-1kg)
const BASE_RATES: Record<string, Record<Zone, Record<string, { price: number; days: string }>>> = {
  PostNord: {
    domestic: {
      economy: { price: 4, days: "3-5" },
      standard: { price: 6, days: "2-3" },
      express: { price: 12, days: "1" },
    },
    nordic: {
      economy: { price: 8, days: "5-8" },
      standard: { price: 12, days: "3-5" },
      express: { price: 20, days: "1-2" },
    },
    eu: {
      economy: { price: 12, days: "7-12" },
      standard: { price: 18, days: "4-7" },
      express: { price: 30, days: "2-3" },
    },
    worldwide: {
      economy: { price: 18, days: "10-20" },
      standard: { price: 28, days: "7-12" },
      express: { price: 50, days: "3-5" },
    },
  },
  DHL: {
    domestic: {
      economy: { price: 5, days: "3-5" },
      standard: { price: 8, days: "2-3" },
      express: { price: 15, days: "1" },
    },
    nordic: {
      economy: { price: 10, days: "4-7" },
      standard: { price: 15, days: "3-5" },
      express: { price: 25, days: "1-2" },
    },
    eu: {
      economy: { price: 14, days: "5-10" },
      standard: { price: 22, days: "3-5" },
      express: { price: 38, days: "1-3" },
    },
    worldwide: {
      economy: { price: 25, days: "8-15" },
      standard: { price: 40, days: "5-10" },
      express: { price: 70, days: "2-4" },
    },
  },
  UPS: {
    domestic: {
      economy: { price: 6, days: "3-5" },
      standard: { price: 9, days: "2-3" },
      express: { price: 16, days: "1" },
    },
    nordic: {
      economy: { price: 11, days: "4-7" },
      standard: { price: 16, days: "3-5" },
      express: { price: 27, days: "1-2" },
    },
    eu: {
      economy: { price: 15, days: "5-10" },
      standard: { price: 24, days: "3-5" },
      express: { price: 42, days: "1-3" },
    },
    worldwide: {
      economy: { price: 28, days: "8-15" },
      standard: { price: 45, days: "5-10" },
      express: { price: 80, days: "2-4" },
    },
  },
};

// Only include PostNord for routes involving Nordic countries
function getApplicableCarriers(origin: string, destination: string): string[] {
  const carriers = ["DHL", "UPS"];
  if (NORDIC_COUNTRIES.has(origin) || NORDIC_COUNTRIES.has(destination)) {
    carriers.unshift("PostNord");
  }
  return carriers;
}

function normalizeCountryCode(input: string): string {
  const map: Record<string, string> = {
    SWEDEN: "SE", NORWAY: "NO", DENMARK: "DK", FINLAND: "FI", ICELAND: "IS",
    GERMANY: "DE", FRANCE: "FR", SPAIN: "ES", ITALY: "IT", UK: "GB",
    "UNITED KINGDOM": "GB", USA: "US", "UNITED STATES": "US", NETHERLANDS: "NL",
    BELGIUM: "BE", AUSTRIA: "AT", SWITZERLAND: "CH", POLAND: "PL", PORTUGAL: "PT",
    IRELAND: "IE", GREECE: "GR", CZECH: "CZ", "CZECH REPUBLIC": "CZ",
    HUNGARY: "HU", ROMANIA: "RO", BULGARIA: "BG", CROATIA: "HR",
    ESTONIA: "EE", LATVIA: "LV", LITHUANIA: "LT", SLOVAKIA: "SK", SLOVENIA: "SI",
    LUXEMBOURG: "LU", MALTA: "MT", CYPRUS: "CY", CANADA: "CA", AUSTRALIA: "AU",
    JAPAN: "JP", CHINA: "CN", INDIA: "IN", BRAZIL: "BR",
  };
  const upper = input.trim().toUpperCase();
  return map[upper] ?? upper.slice(0, 2);
}

registerCapability("shipping-cost-estimate", async (input: CapabilityInput) => {
  const originRaw =
    ((input.origin_country as string) ?? (input.from as string) ?? "").trim();
  const destRaw =
    ((input.destination_country as string) ?? (input.to as string) ?? "").trim();
  const weightRaw = (input.weight_kg as number) ?? (input.weight as number) ?? 1;
  const serviceFilter = ((input.service as string) ?? "").trim().toLowerCase();

  if (!originRaw || !destRaw) {
    throw new Error(
      "'origin_country'/'from' and 'destination_country'/'to' are required. Provide country codes or names.",
    );
  }

  const origin = normalizeCountryCode(originRaw);
  const destination = normalizeCountryCode(destRaw);
  const weightKg = Math.max(0.1, Math.min(Number(weightRaw) || 1, 50));
  const weightMult = getWeightMultiplier(weightKg);
  const zone = getZone(origin, destination);
  const carriers = getApplicableCarriers(origin, destination);

  const services = serviceFilter
    ? [serviceFilter]
    : ["economy", "standard", "express"];

  const estimates: ShippingEstimate[] = [];

  for (const carrier of carriers) {
    const carrierRates = BASE_RATES[carrier];
    if (!carrierRates) continue;
    const zoneRates = carrierRates[zone];
    if (!zoneRates) continue;

    for (const service of services) {
      const rate = zoneRates[service];
      if (!rate) continue;
      const price = Math.round(rate.price * weightMult * 100) / 100;
      estimates.push({
        carrier,
        service,
        price,
        currency: "EUR",
        delivery_days: rate.days,
      });
    }
  }

  if (estimates.length === 0) {
    throw new Error(
      `No shipping estimates available for ${origin} to ${destination}. Try standard service.`,
    );
  }

  // Find cheapest and fastest
  const cheapest = estimates.reduce((min, e) => (e.price < min.price ? e : min));
  const fastest = estimates.reduce((fast, e) => {
    const fastDays = parseInt(fast.delivery_days);
    const eDays = parseInt(e.delivery_days);
    return eDays < fastDays ? e : fast;
  });

  const dimensions = input.dimensions as { l?: number; w?: number; h?: number } | undefined;

  return {
    output: {
      origin,
      destination,
      zone,
      weight_kg: weightKg,
      ...(dimensions ? { dimensions } : {}),
      estimates,
      cheapest: { carrier: cheapest.carrier, service: cheapest.service, price: cheapest.price },
      fastest: { carrier: fastest.carrier, service: fastest.service, delivery_days: fastest.delivery_days },
      notes: "Estimates based on published rate guides. Get exact quotes from carrier websites. Prices in EUR, actual currency may vary by carrier and route.",
    },
    provenance: {
      source: "published-rate-guides",
      fetched_at: new Date().toISOString(),
    },
  };
});
