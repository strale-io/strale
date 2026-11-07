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

// ─── Source and date ────────────────────────────────────────────────────────
//
// EU27: the European Commission's Taxes in Europe Database (TEDB), which the
// member states maintain themselves. Queried on 2026-11-06 for that date
// through the VAT search behind
// https://ec.europa.eu/taxation_customs/tedb/ (REST endpoint rest-api/vatSearch);
// the latest situation dates it returned were 2026-01-01 and 2026-07-01.
// Where TEDB lagged a national change, the national source is named on the
// row. UK: gov.uk "VAT rates" and "Rates of VAT on different goods and
// services" (updated 10 July 2026). NO: skatteetaten.no "Value added tax"
// rates. CH: estv.admin.ch "VAT rates Switzerland". IS: skatturinn.is
// "Skattskylda og skattprósentur".
//
// The category model is coarse: one rate per category, while real schedules
// split categories by product. Where a category spans several rates, the row
// carries the rate for the general case and a comment says what differs.
// A rate or category assignment that could not be confirmed against an
// authority is marked "unverified as of 2026-11-06".
//
// Known changes within six months of the as-of date: Norway's electric-vehicle
// relief threshold falls from NOK 300,000 to NOK 150,000 on 1 January 2027
// (see NO below). Sweden's 6% food rate runs to 31 December 2027.
//
// Re-check on 1 January and 1 July each year, and on any national budget
// change. Move this date when the table is re-verified.
export const VAT_RATES_AS_OF = "2026-11-06";

export const VAT_RATES: Record<string, VatCountry> = {
  AT: {
    // 4.9% on the basic foods in Annex 3 UStG from 1 July 2026 (TEDB; WKO
    // "Ermäßigte Umsatzsteuersätze"); other food stays at 10%. Medicines,
    // passenger transport, accommodation and restaurant meals are 10%
    // (WKO; TEDB does not tag medicines or ground transport at 10%).
    // Cultural admissions and live plants are 13% (TEDB, WKO).
    name: "Austria",
    standard_rate: 20,
    reduced_rates: [
      { rate: 4.9, categories: ["basic_food"] },
      { rate: 10, categories: ["food", "books", "newspapers", "medicine", "transport", "accommodation", "restaurant_food", "water"] },
      { rate: 13, categories: ["cultural_events", "wine", "live_plants"] },
    ],
    super_reduced_rate: 4.9,
    zero_rated_categories: [],
    // Parking rate 13% (farm wine): unverified as of 2026-11-06; TEDB does
    // not tag it as a parking rate.
    parking_rate: 13,
    currency: "EUR",
  },
  BE: {
    // Accommodation and restaurant meals 12% (TEDB, Royal Decree 20 Table B).
    // Residential electricity 6% (TEDB). Daily newspapers 0%.
    name: "Belgium",
    standard_rate: 21,
    reduced_rates: [
      { rate: 6, categories: ["food", "books", "medicine", "water", "energy", "transport", "cultural_events", "social_housing"] },
      // "tyres" at 12%: unverified as of 2026-11-06.
      { rate: 12, categories: ["restaurant_food", "accommodation", "social_housing_renovation", "tyres"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: ["newspapers"],
    parking_rate: 12,
    currency: "EUR",
  },
  BG: {
    // 9% covers accommodation, books and baby food (TEDB). The 9% restaurant
    // rate has lapsed; restaurant meals are standard-rated. Bulgaria adopted
    // the euro on 1 January 2026 (Council decision of 8 July 2025, ECB
    // press release 8 July 2025).
    name: "Bulgaria",
    standard_rate: 20,
    reduced_rates: [
      { rate: 9, categories: ["accommodation", "books", "baby_food"] },
    ],
    super_reduced_rate: null,
    // Unverified as of 2026-11-06 (international transport is exempt with
    // credit under the Directive; TEDB lists no zero rate for BG).
    zero_rated_categories: ["international_transport"],
    parking_rate: null,
    currency: "EUR",
  },
  HR: {
    // 5% covers bread, milk, meat, fish, eggs, oils, fruit, vegetables and
    // baby food (TEDB); electricity is 13% (TEDB).
    name: "Croatia",
    standard_rate: 25,
    reduced_rates: [
      { rate: 5, categories: ["food", "books", "medicine", "medical_equipment", "cultural_events"] },
      { rate: 13, categories: ["accommodation", "restaurant_food", "newspapers", "water", "energy"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  CY: {
    // 3% on books, newspapers and periodicals (TEDB).
    name: "Cyprus",
    standard_rate: 19,
    reduced_rates: [
      { rate: 3, categories: ["books", "newspapers", "periodicals"] },
      { rate: 5, categories: ["food", "medicine", "transport", "water", "cultural_events"] },
      { rate: 9, categories: ["accommodation", "restaurant_food"] },
    ],
    super_reduced_rate: 3,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  CZ: {
    // Books are zero-rated (TEDB).
    name: "Czech Republic",
    standard_rate: 21,
    reduced_rates: [
      { rate: 12, categories: ["food", "medicine", "transport", "accommodation", "restaurant_food", "cultural_events", "water"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: ["books"],
    parking_rate: null,
    currency: "CZK",
  },
  DK: {
    name: "Denmark",
    standard_rate: 25,
    reduced_rates: [],
    super_reduced_rate: null,
    // Passenger transport 0% (TEDB). Newspapers 0%: unverified as of
    // 2026-11-06 (not tagged in TEDB).
    zero_rated_categories: ["newspapers", "international_transport"],
    parking_rate: null,
    currency: "DKK",
  },
  EE: {
    // Standard 24% since 1 July 2025 (TEDB; EMTA). Accommodation 13% (TEDB).
    name: "Estonia",
    standard_rate: 24,
    reduced_rates: [
      { rate: 9, categories: ["books", "newspapers", "periodicals", "medicine", "medical_equipment"] },
      { rate: 13, categories: ["accommodation"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  FI: {
    // 13.5% since 1 January 2026; 10% now only newspapers and periodicals
    // (TEDB; vero.fi "Rates of VAT").
    name: "Finland",
    standard_rate: 25.5,
    reduced_rates: [
      { rate: 10, categories: ["newspapers", "periodicals"] },
      { rate: 13.5, categories: ["food", "restaurant_food", "books", "medicine", "transport", "accommodation", "cultural_events"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  FR: {
    // 2.1% on press and reimbursable medicines (TEDB). Electricity and gas
    // supply is no longer at 5.5% (TEDB tags only district heating there), so
    // energy falls to the standard rate.
    name: "France",
    standard_rate: 20,
    reduced_rates: [
      { rate: 2.1, categories: ["newspapers", "reimbursable_medicine"] },
      { rate: 5.5, categories: ["food", "books", "cultural_events"] },
      { rate: 10, categories: ["restaurant_food", "accommodation", "transport", "medicine"] },
    ],
    super_reduced_rate: 2.1,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  DE: {
    // Restaurant meals (not drinks) 7% from 1 January 2026, made permanent by
    // the Steueränderungsgesetz 2025. TEDB does not show it yet; source is the
    // IHK chambers (e.g. IHK Darmstadt), BMF page not reached.
    name: "Germany",
    standard_rate: 19,
    reduced_rates: [
      { rate: 7, categories: ["food", "books", "newspapers", "transport", "cultural_events", "accommodation", "restaurant_food"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  GR: {
    // Electricity and gas 6% (TEDB).
    name: "Greece",
    standard_rate: 24,
    reduced_rates: [
      { rate: 6, categories: ["medicine", "books", "newspapers", "cultural_events", "energy"] },
      { rate: 13, categories: ["food", "accommodation", "restaurant_food", "transport"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  HU: {
    // 5% covers meat, fish, milk, eggs, accommodation and restaurant meals;
    // 18% covers other dairy and cereal products and open-air festival
    // admission; daily newspapers 0% (TEDB).
    name: "Hungary",
    standard_rate: 27,
    reduced_rates: [
      { rate: 5, categories: ["food", "books", "medicine", "accommodation", "restaurant_food"] },
      { rate: 18, categories: ["cultural_events"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: ["newspapers"],
    parking_rate: null,
    currency: "HUF",
  },
  IE: {
    // Restaurant and catering 9% from 1 July 2026 (TEDB). Cultural admissions
    // back at 13.5% since 1 September 2023 (TEDB). Newspapers and books 0%
    // (TEDB). Electricity and gas 9% until 31 December 2030 (Finance Act 2025,
    // per KPMG Ireland Budget 2026; revenue.ie rate pages returned 404).
    name: "Ireland",
    standard_rate: 23,
    reduced_rates: [
      // "sports_facilities" at 9%: unverified as of 2026-11-06.
      { rate: 9, categories: ["restaurant_food", "periodicals", "energy", "sports_facilities"] },
      { rate: 13.5, categories: ["accommodation", "cultural_events", "construction"] },
    ],
    // Livestock rate 4.8%: unverified as of 2026-11-06 (not in TEDB results).
    super_reduced_rate: 4.8,
    zero_rated_categories: ["food", "books", "newspapers", "childrens_clothing", "medicine"],
    // Parking rate 13.5%: unverified as of 2026-11-06.
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
    // 12% covers medicines, baby food and certain fresh bread, milk, poultry,
    // eggs, fruit and vegetables; 5% covers books and the press. Cultural
    // admissions are exempt, so no rate is listed for them (TEDB).
    name: "Latvia",
    standard_rate: 21,
    reduced_rates: [
      { rate: 5, categories: ["books", "newspapers", "periodicals"] },
      { rate: 12, categories: ["food", "baby_food", "medicine", "accommodation", "transport"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  LT: {
    // 9% became 12% on 1 January 2026; books and the press are 5% (TEDB).
    name: "Lithuania",
    standard_rate: 21,
    reduced_rates: [
      { rate: 5, categories: ["medicine", "medical_equipment", "books", "newspapers", "periodicals"] },
      { rate: 12, categories: ["accommodation", "transport", "cultural_events"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  LU: {
    // Accommodation and restaurant meals (not alcohol) are 3% (TEDB).
    name: "Luxembourg",
    standard_rate: 17,
    reduced_rates: [
      { rate: 3, categories: ["food", "books", "medicine", "childrens_clothing", "accommodation", "restaurant_food", "transport", "water"] },
      { rate: 8, categories: ["energy"] },
    ],
    super_reduced_rate: 3,
    zero_rated_categories: [],
    parking_rate: 14,
    currency: "EUR",
  },
  MT: {
    // Food, medicines, passenger transport and water are 0%; books and the
    // press 5%; accommodation 7%; 12% on short-term hire and certain
    // financial-management services (TEDB). Restaurant meals are standard.
    name: "Malta",
    standard_rate: 18,
    reduced_rates: [
      { rate: 5, categories: ["books", "newspapers", "cultural_events", "medical_equipment"] },
      { rate: 7, categories: ["accommodation"] },
      { rate: 12, categories: ["short_term_hire"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: ["food", "medicine", "transport", "water", "international_transport"],
    parking_rate: null,
    currency: "EUR",
  },
  NL: {
    // Hotel accommodation moved from 9% to 21% on 1 January 2026
    // (Belastingdienst "Btw-tarief logies"); camping stays at 9%.
    name: "Netherlands",
    standard_rate: 21,
    reduced_rates: [
      { rate: 9, categories: ["food", "books", "medicine", "transport", "cultural_events", "camping"] },
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
    // Mainland rates. Accommodation 6% (TEDB). Electricity is 6% only for
    // small residential contracts, so energy falls to the standard rate.
    name: "Portugal",
    standard_rate: 23,
    reduced_rates: [
      { rate: 6, categories: ["food", "books", "medicine", "transport", "accommodation"] },
      { rate: 13, categories: ["restaurant_food"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: 13,
    currency: "EUR",
  },
  RO: {
    // 21% and a single 11% reduced rate since 1 August 2025 (Law 141/2025;
    // TEDB).
    name: "Romania",
    standard_rate: 21,
    reduced_rates: [
      { rate: 11, categories: ["food", "books", "medicine", "accommodation", "restaurant_food", "cultural_events"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "RON",
  },
  SK: {
    // 19% and 5% since 1 January 2025. 5% covers basic food, books, the
    // press, medicines, accommodation, restaurant food and cultural
    // admissions; 19% covers other food and electricity (TEDB).
    name: "Slovakia",
    standard_rate: 23,
    reduced_rates: [
      { rate: 5, categories: ["food", "books", "newspapers", "medicine", "accommodation", "restaurant_food", "cultural_events"] },
      { rate: 19, categories: ["energy"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  SI: {
    // 5% covers books and the press; food and medicines are 9.5% (TEDB).
    name: "Slovenia",
    standard_rate: 22,
    reduced_rates: [
      { rate: 5, categories: ["books", "newspapers"] },
      { rate: 9.5, categories: ["food", "medicine", "accommodation", "restaurant_food", "cultural_events", "transport"] },
    ],
    super_reduced_rate: null,
    zero_rated_categories: [],
    parking_rate: null,
    currency: "EUR",
  },
  ES: {
    // 4% covers basic food (bread, milk, cheese, eggs, fruit, vegetables),
    // books and medicines; other food is 10%. TEDB lists the 4% rate without
    // itemising it, so the 4% category assignment is unverified as of
    // 2026-11-06.
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
    // Food 6% from 1 April 2026 to 31 December 2027; restaurant service and
    // accommodation stay at 12% (TEDB; Skatteverket "Moms").
    name: "Sweden",
    standard_rate: 25,
    reduced_rates: [
      { rate: 6, categories: ["food", "books", "cultural_events", "transport"] },
      { rate: 12, categories: ["restaurant_food", "accommodation"] },
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
    // Medicine: only dispensed prescriptions are zero-rated (gov.uk).
    zero_rated_categories: ["food", "books", "newspapers", "childrens_clothing", "medicine", "transport"],
    parking_rate: null,
    currency: "GBP",
  },
  NO: {
    // Food 15%; passenger transport, accommodation, cinema and sporting
    // events 12% (skatteetaten.no). Concerts and theatre are exempt, not 12%.
    // Books are zero-rated (Skatteetaten merverdiavgiftshåndbok 6-4).
    // Newspapers 0%: unverified as of 2026-11-06 (secondary source only).
    // Electric vehicles are zero-rated only up to NOK 300,000 in 2026; the
    // threshold falls to NOK 150,000 on 1 January 2027 and to 0 in 2028
    // (2026 budget, Stortinget; per Sticos, subject to ESA approval).
    name: "Norway",
    standard_rate: 25,
    reduced_rates: [
      { rate: 12, categories: ["transport", "accommodation", "cultural_events"] },
      { rate: 15, categories: ["food"] },
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
    // Restaurant meals are 24%; cultural activity is exempt, so no rate is
    // listed for it (skatturinn.is).
    name: "Iceland",
    standard_rate: 24,
    reduced_rates: [
      { rate: 11, categories: ["food", "books", "newspapers", "accommodation"] },
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
