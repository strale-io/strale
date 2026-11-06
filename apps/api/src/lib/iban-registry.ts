// IBAN length per country: the one source for iban-validate and iban-to-bank.
//
// Authority: the SWIFT IBAN Registry, published by SWIFT as the ISO 13616
// registration authority (swift.com/standards/data-standards/iban); the
// newest edition it lists is Release 103, September 2026. swift.com refused
// automated reads with HTTP 403 on 2026-11-06, so the table was checked on
// that date against two machine-readable copies generated from the registry
// text file, which agree on all 89 countries:
//   - schwifty 2026.10.1 (PyPI, 2026-10-25), iban_registry/generated.json,
//     "updated the IBAN registry to the latest SWIFT release";
//   - python-stdnum stdnum/iban.dat, "generated from iban-registry-v101.txt
//     downloaded from https://www.swift.com/node/11971".
// The Wikipedia IBAN article's table (citing Release 99, December 2024)
// carries the same 89 lengths.
//
// Territories the registry lists under a parent country (for example GF,
// GP, RE under FR; IM, JE, GG under GB; AX under FI) use the parent's prefix
// and are not separate entries here.
//
// Update on every IBAN Registry release (several a year) and move this date.
export const IBAN_REGISTRY_AS_OF = "2026-11-06";

export const IBAN_LENGTHS: Readonly<Record<string, number>> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22,
  BH: 22, BI: 27, BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24,
  DE: 22, DJ: 27, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18,
  FK: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27,
  GT: 28, HN: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26,
  IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20,
  LU: 20, LV: 21, LY: 25, MC: 27, MD: 24, ME: 22, MK: 19, MN: 20,
  MR: 27, MT: 31, MU: 30, NI: 28, NL: 18, NO: 15, OM: 23, PK: 24,
  PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, RU: 33, SA: 24,
  SC: 31, SD: 18, SE: 24, SI: 19, SK: 24, SM: 27, SO: 23, ST: 25,
  SV: 28, TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
  YE: 30,
};
