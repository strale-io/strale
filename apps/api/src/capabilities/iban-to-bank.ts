import { registerCapability, type CapabilityInput } from "./index.js";

// IBAN country lengths
const IBAN_LENGTHS: Record<string, number> = {
  AL: 28, AD: 28, AT: 20, AZ: 28, BH: 22, BY: 28, BE: 16, BA: 20,
  BR: 29, BG: 22, CR: 22, HR: 21, CY: 28, CZ: 24, DK: 18, DO: 28,
  TL: 23, EE: 20, FO: 18, FI: 18, FR: 27, GE: 22, DE: 22, GI: 23,
  GR: 27, GL: 18, GT: 28, HU: 28, IS: 26, IQ: 23, IE: 22, IL: 23,
  IT: 27, JO: 30, KZ: 20, XK: 20, KW: 30, LV: 21, LB: 28, LI: 21,
  LT: 20, LU: 20, MK: 19, MT: 31, MR: 27, MU: 30, MC: 27, MD: 24,
  ME: 22, NL: 18, NO: 15, PK: 24, PS: 29, PL: 28, PT: 25, QA: 29,
  RO: 24, LC: 32, SM: 27, SA: 24, RS: 22, SC: 31, SK: 24, SI: 19,
  ES: 24, SE: 24, CH: 21, TN: 24, TR: 26, UA: 29, AE: 23, GB: 22,
  VG: 24,
};

const COUNTRY_NAMES: Record<string, string> = {
  AT: "Austria", BE: "Belgium", BG: "Bulgaria", CH: "Switzerland",
  CY: "Cyprus", CZ: "Czech Republic", DE: "Germany", DK: "Denmark",
  EE: "Estonia", ES: "Spain", FI: "Finland", FR: "France",
  GB: "United Kingdom", GR: "Greece", HR: "Croatia", HU: "Hungary",
  IE: "Ireland", IS: "Iceland", IT: "Italy", LI: "Liechtenstein",
  LT: "Lithuania", LU: "Luxembourg", LV: "Latvia", MC: "Monaco",
  MT: "Malta", NL: "Netherlands", NO: "Norway", PL: "Poland",
  PT: "Portugal", RO: "Romania", SE: "Sweden", SI: "Slovenia",
  SK: "Slovakia", SM: "San Marino",
};

// Known bank codes (major banks only)
const BANK_CODES: Record<string, Record<string, { name: string; bic?: string }>> = {
  DE: {
    "37040044": { name: "Commerzbank", bic: "COBADEFFXXX" },
    "10010010": { name: "Postbank", bic: "PBNKDEFFXXX" },
    "10020500": { name: "Bank für Sozialwirtschaft", bic: "BFSWDE33BER" },
    "50010517": { name: "ING-DiBa", bic: "INGDDEFFXXX" },
    "70010080": { name: "Deutsche Bundesbank", bic: "MARKDEFF700" },
  },
  SE: {
    "500": { name: "Nordea", bic: "NDEASESSXXX" },
    "600": { name: "Handelsbanken", bic: "HANDSESSXXX" },
    "900": { name: "Swedbank", bic: "SWEDSESSXXX" },
    "800": { name: "Sparbanken", bic: "SWEDSESSXXX" },
    "300": { name: "Nordea Personkonto" },
  },
  GB: {
    "NWBK": { name: "NatWest", bic: "NWBKGB2L" },
    "LOYD": { name: "Lloyds Bank", bic: "LOYDGB2L" },
    "BARC": { name: "Barclays", bic: "BARCGB22" },
    "MIDL": { name: "HSBC", bic: "MIDLGB22" },
    "HBUK": { name: "HSBC UK", bic: "HBUKGB4B" },
  },
  NL: {
    "INGB": { name: "ING", bic: "INGBNL2A" },
    "ABNA": { name: "ABN AMRO", bic: "ABNANL2A" },
    "RABO": { name: "Rabobank", bic: "RABONL2U" },
  },
};

function mod97(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (let i = 0; i < numeric.length; i++) {
    remainder = (remainder * 10 + parseInt(numeric[i])) % 97;
  }
  return remainder === 1;
}

registerCapability("iban-to-bank", async (input: CapabilityInput) => {
  const raw = ((input.iban as string) ?? (input.task as string) ?? "").trim();
  if (!raw) throw new Error("'iban' is required.");

  const iban = raw.replace(/[\s-]/g, "").toUpperCase();
  const countryCode = iban.slice(0, 2);
  const expectedLength = IBAN_LENGTHS[countryCode];

  if (!expectedLength) {
    return {
      output: { valid_iban: false, iban: raw, country_code: countryCode, error: "Unknown country code" },
      provenance: { source: "strale-iban-bank-lookup", fetched_at: new Date().toISOString() },
    };
  }

  if (iban.length !== expectedLength) {
    return {
      output: { valid_iban: false, iban: raw, country_code: countryCode, error: `Expected ${expectedLength} chars, got ${iban.length}` },
      provenance: { source: "strale-iban-bank-lookup", fetched_at: new Date().toISOString() },
    };
  }

  const validChecksum = mod97(iban);

  // Extract bank code based on country structure
  let bankCode: string;
  if (countryCode === "GB") {
    bankCode = iban.slice(4, 8); // 4-char sort code identifier
  } else if (countryCode === "NL") {
    bankCode = iban.slice(4, 8);
  } else if (countryCode === "DE") {
    bankCode = iban.slice(4, 12); // 8-digit Bankleitzahl
  } else if (countryCode === "SE") {
    bankCode = iban.slice(4, 7); // 3-digit clearing number prefix
  } else {
    bankCode = iban.slice(4, 8);
  }

  // Lookup bank info
  const countryBanks = BANK_CODES[countryCode] ?? {};
  const bankInfo = countryBanks[bankCode];

  return {
    output: {
      valid_iban: validChecksum,
      iban: iban,
      country_code: countryCode,
      country_name: COUNTRY_NAMES[countryCode] ?? countryCode,
      bank_code: bankCode,
      bank_name: bankInfo?.name ?? null,
      bic: bankInfo?.bic ?? null,
      branch: null,
    },
    provenance: { source: "strale-iban-bank-lookup", fetched_at: new Date().toISOString() },
  };
});
