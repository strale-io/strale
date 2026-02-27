import { registerCapability, type CapabilityInput } from "./index.js";

// EU VAT rate lookup — pure algorithmic
// Complete VAT rates for all 27 EU member states + UK, NO, CH, IS

interface ReducedRate {
  rate: number;
  categories: string[];
}

interface VatCountry {
  name: string;
  standard_rate: number;
  reduced_rates: ReducedRate[];
  super_reduced_rate: number | null;
  zero_rated_categories: string[];
  parking_rate: number | null;
  currency: string;
}

const VAT_RATES: Record<string, VatCountry> = {
  AT: {
    name: "Austria",
    standard_rate: 20,
    reduced_rates: [
      { rate: 10, categories: ["food", "books", "medicine", "transport", "cultural_events"] },
      { rate: 13, categories: ["accommodation", "wine", "live_plants"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: 13,
    currency: "EUR",
  },
  BE: {
    name: "Belgium",
    standard_rate: 21,
    reduced_rates: [
      { rate: 6, categories: ["food", "books", "medicine", "water", "social_housing"] },
      { rate: 12, categories: ["restaurant_food", "social_housing_renovation", "tyres"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: ["newspapers"],
    parking_rate: 12,
    currency: "EUR",
  },
  BG: {
    name: "Bulgaria",
    standard_rate: 20,
    reduced_rates: [
      { rate: 9, categories: ["accommodation", "restaurant_food", "books", "baby_food"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: ["international_transport"],
    parking_rate: null,
    currency: "BGN",
  },
  HR: {
    name: "Croatia",
    standard_rate: 25,
    reduced_rates: [
      { rate: 5, categories: ["books", "medicine", "medical_equipment", "cultural_events"] },
      { rate: 13, categories: ["food", "accommodation", "restaurant_food", "newspapers", "water"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  CY: {
    name: "Cyprus",
    standard_rate: 19,
    reduced_rates: [
      { rate: 5, categories: ["food", "books", "medicine", "transport"] },
      { rate: 9, categories: ["accommodation", "restaurant_food"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  CZ: {
    name: "Czech Republic",
    standard_rate: 21,
    reduced_rates: [
      { rate: 12, categories: ["food", "books", "medicine", "transport", "accommodation", "restaurant_food"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "CZK",
  },
  DK: {
    name: "Denmark",
    standard_rate: 25,
    reduced_rates: [],
    super_reduced_rate: null,
    zero_rated_categories: ["newspapers", "international_transport"],
    parking_rate: null,
    currency: "DKK",
  },
  EE: {
    name: "Estonia",
    standard_rate: 22,
    reduced_rates: [
      { rate: 9, categories: ["books", "accommodation", "medicine", "periodicals"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  FI: {
    name: "Finland",
    standard_rate: 25.5,
    reduced_rates: [
      { rate: 10, categories: ["books", "medicine", "transport", "accommodation", "cultural_events"] },
      { rate: 14, categories: ["food", "restaurant_food"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  FR: {
    name: "France",
    standard_rate: 20,
    reduced_rates: [
      { rate: 5.5, categories: ["food", "books", "cultural_events", "energy"] },
      { rate: 10, categories: ["restaurant_food", "accommodation", "transport", "medicine"] },
    ],
    super_reduced_rate: 2.1,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  DE: {
    name: "Germany",
    standard_rate: 19,
    reduced_rates: [
      { rate: 7, categories: ["food", "books", "transport", "cultural_events", "accommodation"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  GR: {
    name: "Greece",
    standard_rate: 24,
    reduced_rates: [
      { rate: 6, categories: ["medicine", "books", "cultural_events"] },
      { rate: 13, categories: ["food", "accommodation", "restaurant_food", "energy"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  HU: {
    name: "Hungary",
    standard_rate: 27,
    reduced_rates: [
      { rate: 5, categories: ["books", "medicine", "accommodation", "cultural_events"] },
      { rate: 18, categories: ["food", "restaurant_food"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "HUF",
  },
  IE: {
    name: "Ireland",
    standard_rate: 23,
    reduced_rates: [
      { rate: 9, categories: ["newspapers", "cultural_events", "sports_facilities"] },
      { rate: 13.5, categories: ["accommodation", "restaurant_food", "energy", "construction"] },
    ],
    super_reduced_rate: 4.8,
    zero_rated_categories: ["food", "books", "childrens_clothing", "medicine"],
    parking_rate: 13.5,
    currency: "EUR",
  },
  IT: {
    name: "Italy",
    standard_rate: 22,
    reduced_rates: [
      { rate: 4, categories: ["food", "books", "medical_equipment"] },
      { rate: 5, categories: ["social_services", "cultural_events"] },
      { rate: 10, categories: ["accommodation", "restaurant_food", "medicine", "transport", "energy"] },
    ],
    super_reduced_rate: 4,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  LV: {
    name: "Latvia",
    standard_rate: 21,
    reduced_rates: [
      { rate: 5, categories: ["food", "medicine", "books", "baby_food"] },
      { rate: 12, categories: ["accommodation", "transport", "cultural_events"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  LT: {
    name: "Lithuania",
    standard_rate: 21,
    reduced_rates: [
      { rate: 5, categories: ["medicine", "medical_equipment"] },
      { rate: 9, categories: ["books", "accommodation", "transport", "cultural_events"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  LU: {
    name: "Luxembourg",
    standard_rate: 17,
    reduced_rates: [
      { rate: 3, categories: ["food", "books", "medicine", "childrens_clothing"] },
      { rate: 8, categories: ["accommodation", "restaurant_food", "energy"] },
    ],
    super_reduced_rate: 3,
    zero_rated_categories: [],
    parking_rate: 14,
    currency: "EUR",
  },
  MT: {
    name: "Malta",
    standard_rate: 18,
    reduced_rates: [
      { rate: 5, categories: ["food", "books", "medicine", "accommodation"] },
      { rate: 7, categories: ["accommodation", "cultural_events"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: ["international_transport"],
    parking_rate: null,
    currency: "EUR",
  },
  NL: {
    name: "Netherlands",
    standard_rate: 21,
    reduced_rates: [
      { rate: 9, categories: ["food", "books", "medicine", "accommodation", "transport", "cultural_events"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  PL: {
    name: "Poland",
    standard_rate: 23,
    reduced_rates: [
      { rate: 5, categories: ["food", "books", "medicine"] },
      { rate: 8, categories: ["accommodation", "restaurant_food", "transport", "cultural_events"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "PLN",
  },
  PT: {
    name: "Portugal",
    standard_rate: 23,
    reduced_rates: [
      { rate: 6, categories: ["food", "books", "medicine", "transport"] },
      { rate: 13, categories: ["accommodation", "restaurant_food", "energy"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: 13,
    currency: "EUR",
  },
  RO: {
    name: "Romania",
    standard_rate: 19,
    reduced_rates: [
      { rate: 5, categories: ["food", "books", "medicine", "accommodation"] },
      { rate: 9, categories: ["restaurant_food", "cultural_events"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "RON",
  },
  SK: {
    name: "Slovakia",
    standard_rate: 23,
    reduced_rates: [
      { rate: 10, categories: ["food", "books", "medicine", "accommodation"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  SI: {
    name: "Slovenia",
    standard_rate: 22,
    reduced_rates: [
      { rate: 5, categories: ["food", "books", "medicine"] },
      { rate: 9.5, categories: ["accommodation", "restaurant_food", "cultural_events", "transport"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  ES: {
    name: "Spain",
    standard_rate: 21,
    reduced_rates: [
      { rate: 4, categories: ["food", "books", "medicine", "medical_equipment"] },
      { rate: 10, categories: ["accommodation", "restaurant_food", "transport", "cultural_events"] },
    ],
    super_reduced_rate: 4,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  SE: {
    name: "Sweden",
    standard_rate: 25,
    reduced_rates: [
      { rate: 6, categories: ["books", "cultural_events", "transport"] },
      { rate: 12, categories: ["food", "restaurant_food", "accommodation"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "SEK",
  },
  GB: {
    name: "United Kingdom",
    standard_rate: 20,
    reduced_rates: [
      { rate: 5, categories: ["energy", "childrens_car_seats"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: ["food", "books", "childrens_clothing", "medicine", "transport"],
    parking_rate: null,
    currency: "GBP",
  },
  NO: {
    name: "Norway",
    standard_rate: 25,
    reduced_rates: [
      { rate: 12, categories: ["food", "transport"] },
      { rate: 15, categories: ["accommodation", "cultural_events"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: ["books", "newspapers", "electric_vehicles"],
    parking_rate: null,
    currency: "NOK",
  },
  CH: {
    name: "Switzerland",
    standard_rate: 8.1,
    reduced_rates: [
      { rate: 2.6, categories: ["food", "books", "medicine", "newspapers"] },
      { rate: 3.8, categories: ["accommodation"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "CHF",
  },
  IS: {
    name: "Iceland",
    standard_rate: 24,
    reduced_rates: [
      { rate: 11, categories: ["food", "books", "accommodation", "cultural_events"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "ISK",
  },
};

// Category name normalization map
const CATEGORY_ALIASES: Record<string, string> = {
  standard: "standard",
  food: "food",
  groceries: "food",
  books: "books",
  medicine: "medicine",
  medical: "medicine",
  pharmaceuticals: "medicine",
  transport: "transport",
  transportation: "transport",
  digital: "digital",
  digital_services: "digital",
  childrens_clothing: "childrens_clothing",
  children: "childrens_clothing",
  kids_clothing: "childrens_clothing",
  accommodation: "accommodation",
  hotels: "accommodation",
  lodging: "accommodation",
  restaurant_food: "restaurant_food",
  restaurant: "restaurant_food",
  dining: "restaurant_food",
  energy: "energy",
  electricity: "energy",
  cultural_events: "cultural_events",
  culture: "cultural_events",
  entertainment: "cultural_events",
};

function findApplicableRate(country: VatCountry, category: string): { rate: number; note: string } {
  const normalizedCategory = CATEGORY_ALIASES[category.toLowerCase()] ?? category.toLowerCase();

  if (normalizedCategory === "standard") {
    return { rate: country.standard_rate, note: "Standard rate" };
  }

  // Check zero-rated categories
  if (country.zero_rated_categories.includes(normalizedCategory)) {
    return { rate: 0, note: `Zero-rated for ${normalizedCategory}` };
  }

  // Check reduced rates (prefer lowest applicable rate)
  for (const reduced of country.reduced_rates) {
    if (reduced.categories.includes(normalizedCategory)) {
      return { rate: reduced.rate, note: `Reduced rate for ${normalizedCategory}` };
    }
  }

  // Default to standard rate if no specific rate found
  return { rate: country.standard_rate, note: `Standard rate (no specific rate for ${normalizedCategory})` };
}

registerCapability("vat-rate-lookup", async (input: CapabilityInput) => {
  const rawCode =
    ((input.country_code as string) ?? (input.country as string) ?? (input.task as string) ?? "").trim().toUpperCase();
  if (!rawCode) {
    throw new Error(
      "'country_code' is required. Provide a 2-letter country code (e.g. 'SE', 'DE', 'FR').",
    );
  }

  // Allow common country name inputs
  const countryNameMap: Record<string, string> = {
    AUSTRIA: "AT", BELGIUM: "BE", BULGARIA: "BG", CROATIA: "HR", CYPRUS: "CY",
    "CZECH REPUBLIC": "CZ", CZECHIA: "CZ", DENMARK: "DK", ESTONIA: "EE",
    FINLAND: "FI", FRANCE: "FR", GERMANY: "DE", GREECE: "GR", HUNGARY: "HU",
    IRELAND: "IE", ITALY: "IT", LATVIA: "LV", LITHUANIA: "LT", LUXEMBOURG: "LU",
    MALTA: "MT", NETHERLANDS: "NL", POLAND: "PL", PORTUGAL: "PT", ROMANIA: "RO",
    SLOVAKIA: "SK", SLOVENIA: "SI", SPAIN: "ES", SWEDEN: "SE",
    "UNITED KINGDOM": "GB", UK: "GB", NORWAY: "NO", SWITZERLAND: "CH", ICELAND: "IS",
  };

  const code = countryNameMap[rawCode] ?? rawCode;
  const country = VAT_RATES[code];

  if (!country) {
    const supported = Object.entries(VAT_RATES)
      .map(([k, v]) => `${k} (${v.name})`)
      .join(", ");
    throw new Error(
      `Unsupported country code "${code}". Supported: ${supported}`,
    );
  }

  const category = ((input.category as string) ?? "").trim().toLowerCase();

  const result: Record<string, unknown> = {
    country_code: code,
    country_name: country.name,
    standard_rate: country.standard_rate,
    reduced_rates: country.reduced_rates,
    super_reduced_rate: country.super_reduced_rate,
    zero_rated_categories: country.zero_rated_categories,
    parking_rate: country.parking_rate,
    currency: country.currency,
  };

  if (category) {
    const applicable = findApplicableRate(country, category);
    result.applicable_rate = applicable.rate;
    result.category_applied = category;
    result.rate_note = applicable.note;
  }

  return {
    output: result,
    provenance: {
      source: "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
