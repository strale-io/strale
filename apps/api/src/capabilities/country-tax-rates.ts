import { registerCapability, type CapabilityInput } from "./index.js";

interface TaxData {
  country_name: string;
  corporate_tax_rate: number;
  vat_standard_rate: number;
  vat_reduced_rates: number[];
  personal_income_tax_top_rate: number;
  capital_gains_rate: number | string;
  withholding_tax: { dividend: number; interest: number; royalty: number };
  social_security: { employer: number; employee: number };
  currency: string;
  notes: string;
}

const TAX_DATA: Record<string, TaxData> = {
  SE: { country_name: "Sweden", corporate_tax_rate: 20.6, vat_standard_rate: 25, vat_reduced_rates: [12, 6], personal_income_tax_top_rate: 52, capital_gains_rate: 30, withholding_tax: { dividend: 30, interest: 0, royalty: 0 }, social_security: { employer: 31.42, employee: 7 }, currency: "SEK", notes: "Municipal tax ~32% + state tax 20% above SEK 598k" },
  NO: { country_name: "Norway", corporate_tax_rate: 22, vat_standard_rate: 25, vat_reduced_rates: [15, 12], personal_income_tax_top_rate: 47.4, capital_gains_rate: 22, withholding_tax: { dividend: 25, interest: 0, royalty: 0 }, social_security: { employer: 14.1, employee: 7.8 }, currency: "NOK", notes: "Bracket tax (trinnskatt) applies above NOK 208k" },
  DK: { country_name: "Denmark", corporate_tax_rate: 22, vat_standard_rate: 25, vat_reduced_rates: [], personal_income_tax_top_rate: 55.9, capital_gains_rate: 42, withholding_tax: { dividend: 27, interest: 22, royalty: 22 }, social_security: { employer: 0, employee: 8 }, currency: "DKK", notes: "AM-bidrag 8% labour market contribution; low employer social costs" },
  FI: { country_name: "Finland", corporate_tax_rate: 20, vat_standard_rate: 25.5, vat_reduced_rates: [14, 10], personal_income_tax_top_rate: 44, capital_gains_rate: 30, withholding_tax: { dividend: 20, interest: 0, royalty: 20 }, social_security: { employer: 20, employee: 10.5 }, currency: "EUR", notes: "Pension TyEL ~17.4% employer; health ~1.5%; unemployment ~1.5%" },
  DE: { country_name: "Germany", corporate_tax_rate: 29.9, vat_standard_rate: 19, vat_reduced_rates: [7], personal_income_tax_top_rate: 47.5, capital_gains_rate: 26.4, withholding_tax: { dividend: 26.4, interest: 26.4, royalty: 15.8 }, social_security: { employer: 20.8, employee: 20.3 }, currency: "EUR", notes: "Corp tax ~15% + 5.5% solidarity + ~14% trade tax. Effective ~30%" },
  GB: { country_name: "United Kingdom", corporate_tax_rate: 25, vat_standard_rate: 20, vat_reduced_rates: [5, 0], personal_income_tax_top_rate: 45, capital_gains_rate: 24, withholding_tax: { dividend: 0, interest: 20, royalty: 20 }, social_security: { employer: 13.8, employee: 8 }, currency: "GBP", notes: "Small profits rate 19% for profits under £50k. NI threshold £9,100" },
  US: { country_name: "United States", corporate_tax_rate: 21, vat_standard_rate: 0, vat_reduced_rates: [], personal_income_tax_top_rate: 37, capital_gains_rate: 20, withholding_tax: { dividend: 30, interest: 30, royalty: 30 }, social_security: { employer: 7.65, employee: 7.65 }, currency: "USD", notes: "No federal VAT; state sales tax 0-10.25%. State corp tax varies 0-11.5%" },
  FR: { country_name: "France", corporate_tax_rate: 25, vat_standard_rate: 20, vat_reduced_rates: [10, 5.5, 2.1], personal_income_tax_top_rate: 45, capital_gains_rate: 30, withholding_tax: { dividend: 25, interest: 0, royalty: 25 }, social_security: { employer: 45, employee: 11 }, currency: "EUR", notes: "Very high employer social charges ~45% of gross salary" },
  NL: { country_name: "Netherlands", corporate_tax_rate: 25.8, vat_standard_rate: 21, vat_reduced_rates: [9], personal_income_tax_top_rate: 49.5, capital_gains_rate: 33, withholding_tax: { dividend: 15, interest: 0, royalty: 0 }, social_security: { employer: 18, employee: 27.65 }, currency: "EUR", notes: "19% rate on first €200k profit. Box 3 capital gains from 2025" },
  ES: { country_name: "Spain", corporate_tax_rate: 25, vat_standard_rate: 21, vat_reduced_rates: [10, 4], personal_income_tax_top_rate: 47, capital_gains_rate: 28, withholding_tax: { dividend: 19, interest: 19, royalty: 24 }, social_security: { employer: 30.5, employee: 6.45 }, currency: "EUR", notes: "Reduced 15% rate for new companies first 2 years" },
  IT: { country_name: "Italy", corporate_tax_rate: 27.8, vat_standard_rate: 22, vat_reduced_rates: [10, 5, 4], personal_income_tax_top_rate: 43, capital_gains_rate: 26, withholding_tax: { dividend: 26, interest: 26, royalty: 30 }, social_security: { employer: 30, employee: 10 }, currency: "EUR", notes: "IRES 24% + IRAP 3.9% regional tax" },
  PT: { country_name: "Portugal", corporate_tax_rate: 21, vat_standard_rate: 23, vat_reduced_rates: [13, 6], personal_income_tax_top_rate: 48, capital_gains_rate: 28, withholding_tax: { dividend: 25, interest: 25, royalty: 25 }, social_security: { employer: 23.75, employee: 11 }, currency: "EUR", notes: "Derrama municipal surcharge up to 1.5%" },
  AT: { country_name: "Austria", corporate_tax_rate: 23, vat_standard_rate: 20, vat_reduced_rates: [13, 10], personal_income_tax_top_rate: 55, capital_gains_rate: 27.5, withholding_tax: { dividend: 27.5, interest: 0, royalty: 20 }, social_security: { employer: 21, employee: 18 }, currency: "EUR", notes: "55% top rate applies above €1M income" },
  BE: { country_name: "Belgium", corporate_tax_rate: 25, vat_standard_rate: 21, vat_reduced_rates: [12, 6], personal_income_tax_top_rate: 50, capital_gains_rate: 0, withholding_tax: { dividend: 30, interest: 30, royalty: 30 }, social_security: { employer: 25, employee: 13.07 }, currency: "EUR", notes: "SME rate 20% on first €100k. No capital gains tax on shares" },
  IE: { country_name: "Ireland", corporate_tax_rate: 15, vat_standard_rate: 23, vat_reduced_rates: [13.5, 9, 4.8], personal_income_tax_top_rate: 40, capital_gains_rate: 33, withholding_tax: { dividend: 25, interest: 20, royalty: 20 }, social_security: { employer: 11.05, employee: 4 }, currency: "EUR", notes: "15% Pillar Two rate from 2024. Knowledge Development Box 10%" },
  CH: { country_name: "Switzerland", corporate_tax_rate: 14.6, vat_standard_rate: 8.1, vat_reduced_rates: [3.8, 2.6], personal_income_tax_top_rate: 40, capital_gains_rate: 0, withholding_tax: { dividend: 35, interest: 35, royalty: 0 }, social_security: { employer: 6.4, employee: 6.4 }, currency: "CHF", notes: "Effective rate varies 12-22% by canton. No capital gains on private assets" },
  PL: { country_name: "Poland", corporate_tax_rate: 19, vat_standard_rate: 23, vat_reduced_rates: [8, 5], personal_income_tax_top_rate: 32, capital_gains_rate: 19, withholding_tax: { dividend: 19, interest: 20, royalty: 20 }, social_security: { employer: 20, employee: 14 }, currency: "PLN", notes: "9% CIT for small taxpayers (revenue <€2M)" },
  CZ: { country_name: "Czech Republic", corporate_tax_rate: 21, vat_standard_rate: 21, vat_reduced_rates: [12], personal_income_tax_top_rate: 23, capital_gains_rate: 15, withholding_tax: { dividend: 15, interest: 15, royalty: 15 }, social_security: { employer: 33.8, employee: 11 }, currency: "CZK", notes: "23% rate applies to income above CZK 1.935M" },
  HU: { country_name: "Hungary", corporate_tax_rate: 9, vat_standard_rate: 27, vat_reduced_rates: [18, 5], personal_income_tax_top_rate: 15, capital_gains_rate: 15, withholding_tax: { dividend: 15, interest: 15, royalty: 0 }, social_security: { employer: 13, employee: 18.5 }, currency: "HUF", notes: "Lowest EU corporate tax rate. Flat 15% personal income tax" },
  RO: { country_name: "Romania", corporate_tax_rate: 16, vat_standard_rate: 19, vat_reduced_rates: [9, 5], personal_income_tax_top_rate: 10, capital_gains_rate: 10, withholding_tax: { dividend: 8, interest: 16, royalty: 16 }, social_security: { employer: 2.25, employee: 35 }, currency: "RON", notes: "Flat 10% income tax. 1% turnover tax for micro-enterprises" },
  BG: { country_name: "Bulgaria", corporate_tax_rate: 10, vat_standard_rate: 20, vat_reduced_rates: [9], personal_income_tax_top_rate: 10, capital_gains_rate: 10, withholding_tax: { dividend: 5, interest: 10, royalty: 10 }, social_security: { employer: 19, employee: 14 }, currency: "BGN", notes: "Flat 10% corp and personal tax — lowest in EU" },
  HR: { country_name: "Croatia", corporate_tax_rate: 18, vat_standard_rate: 25, vat_reduced_rates: [13, 5], personal_income_tax_top_rate: 30, capital_gains_rate: 10, withholding_tax: { dividend: 10, interest: 10, royalty: 15 }, social_security: { employer: 16.5, employee: 20 }, currency: "EUR", notes: "10% rate for annual revenue under €1M" },
  SK: { country_name: "Slovakia", corporate_tax_rate: 21, vat_standard_rate: 23, vat_reduced_rates: [10, 5], personal_income_tax_top_rate: 25, capital_gains_rate: 19, withholding_tax: { dividend: 7, interest: 19, royalty: 19 }, social_security: { employer: 35.2, employee: 13.4 }, currency: "EUR", notes: "15% CIT for income up to €100k" },
  SI: { country_name: "Slovenia", corporate_tax_rate: 22, vat_standard_rate: 22, vat_reduced_rates: [9.5, 5], personal_income_tax_top_rate: 50, capital_gains_rate: 25, withholding_tax: { dividend: 15, interest: 15, royalty: 15 }, social_security: { employer: 16.1, employee: 22.1 }, currency: "EUR", notes: "Capital gains rate reduces with holding period (to 0% after 15yr)" },
  EE: { country_name: "Estonia", corporate_tax_rate: 20, vat_standard_rate: 22, vat_reduced_rates: [9], personal_income_tax_top_rate: 20, capital_gains_rate: 20, withholding_tax: { dividend: 0, interest: 0, royalty: 10 }, social_security: { employer: 33.8, employee: 1.6 }, currency: "EUR", notes: "0% on retained earnings — tax only on distributions. Unique system" },
  LV: { country_name: "Latvia", corporate_tax_rate: 20, vat_standard_rate: 21, vat_reduced_rates: [12, 5], personal_income_tax_top_rate: 31, capital_gains_rate: 20, withholding_tax: { dividend: 0, interest: 0, royalty: 0 }, social_security: { employer: 23.59, employee: 10.5 }, currency: "EUR", notes: "CIT on distributions only (like Estonia)" },
  LT: { country_name: "Lithuania", corporate_tax_rate: 15, vat_standard_rate: 21, vat_reduced_rates: [9, 5], personal_income_tax_top_rate: 32, capital_gains_rate: 15, withholding_tax: { dividend: 15, interest: 10, royalty: 10 }, social_security: { employer: 1.77, employee: 19.5 }, currency: "EUR", notes: "5% CIT for small companies with <10 employees" },
  LU: { country_name: "Luxembourg", corporate_tax_rate: 24.94, vat_standard_rate: 17, vat_reduced_rates: [14, 8, 3], personal_income_tax_top_rate: 42, capital_gains_rate: 0, withholding_tax: { dividend: 15, interest: 0, royalty: 0 }, social_security: { employer: 12.5, employee: 12.5 }, currency: "EUR", notes: "CIT 17% + solidarity surcharge 7% + municipal trade tax ~6.75%" },
  MT: { country_name: "Malta", corporate_tax_rate: 35, vat_standard_rate: 18, vat_reduced_rates: [7, 5], personal_income_tax_top_rate: 35, capital_gains_rate: 35, withholding_tax: { dividend: 0, interest: 0, royalty: 0 }, social_security: { employer: 10, employee: 10 }, currency: "EUR", notes: "Effective rate 5% via imputation system for non-resident shareholders" },
  CY: { country_name: "Cyprus", corporate_tax_rate: 12.5, vat_standard_rate: 19, vat_reduced_rates: [9, 5, 3], personal_income_tax_top_rate: 35, capital_gains_rate: 0, withholding_tax: { dividend: 0, interest: 0, royalty: 0 }, social_security: { employer: 12, employee: 8.8 }, currency: "EUR", notes: "15% Pillar Two minimum from 2024. No capital gains on securities" },
  JP: { country_name: "Japan", corporate_tax_rate: 30.62, vat_standard_rate: 10, vat_reduced_rates: [8], personal_income_tax_top_rate: 55.97, capital_gains_rate: 20.315, withholding_tax: { dividend: 20.42, interest: 20.42, royalty: 20.42 }, social_security: { employer: 16, employee: 16 }, currency: "JPY", notes: "National + local corporate taxes. Consumption tax (VAT) 10%/8%" },
  AU: { country_name: "Australia", corporate_tax_rate: 30, vat_standard_rate: 10, vat_reduced_rates: [], personal_income_tax_top_rate: 45, capital_gains_rate: 23.5, withholding_tax: { dividend: 0, interest: 10, royalty: 30 }, social_security: { employer: 11.5, employee: 0 }, currency: "AUD", notes: "25% rate for base rate entities (turnover <$50M). GST 10%. 50% CGT discount" },
  IN: { country_name: "India", corporate_tax_rate: 25.17, vat_standard_rate: 18, vat_reduced_rates: [12, 5, 0], personal_income_tax_top_rate: 42.74, capital_gains_rate: 20, withholding_tax: { dividend: 20, interest: 20, royalty: 10 }, social_security: { employer: 12, employee: 12 }, currency: "INR", notes: "GST rates vary 0-28%. 15% for new manufacturing companies" },
  SG: { country_name: "Singapore", corporate_tax_rate: 17, vat_standard_rate: 9, vat_reduced_rates: [], personal_income_tax_top_rate: 24, capital_gains_rate: 0, withholding_tax: { dividend: 0, interest: 15, royalty: 10 }, social_security: { employer: 17, employee: 20 }, currency: "SGD", notes: "No capital gains tax. Partial tax exemption for first SGD 200k" },
  HK: { country_name: "Hong Kong", corporate_tax_rate: 16.5, vat_standard_rate: 0, vat_reduced_rates: [], personal_income_tax_top_rate: 15, capital_gains_rate: 0, withholding_tax: { dividend: 0, interest: 0, royalty: 4.95 }, social_security: { employer: 5, employee: 5 }, currency: "HKD", notes: "No VAT/GST. 8.25% on first HKD 2M profit. Territorial taxation" },
  CA: { country_name: "Canada", corporate_tax_rate: 26.5, vat_standard_rate: 5, vat_reduced_rates: [], personal_income_tax_top_rate: 33, capital_gains_rate: 26.8, withholding_tax: { dividend: 25, interest: 25, royalty: 25 }, social_security: { employer: 5.95, employee: 5.95 }, currency: "CAD", notes: "Federal 15% + provincial ~11.5%. GST 5% + PST varies by province" },
  BR: { country_name: "Brazil", corporate_tax_rate: 34, vat_standard_rate: 17, vat_reduced_rates: [12, 7], personal_income_tax_top_rate: 27.5, capital_gains_rate: 22.5, withholding_tax: { dividend: 0, interest: 15, royalty: 15 }, social_security: { employer: 28.8, employee: 14 }, currency: "BRL", notes: "IRPJ 15% + CSLL 9% + 10% surtax above BRL 240k/yr. Simples Nacional available for SMEs" },
  MX: { country_name: "Mexico", corporate_tax_rate: 30, vat_standard_rate: 16, vat_reduced_rates: [0], personal_income_tax_top_rate: 35, capital_gains_rate: 10, withholding_tax: { dividend: 10, interest: 35, royalty: 25 }, social_security: { employer: 25, employee: 3 }, currency: "MXN", notes: "Border zone reduced VAT 8% and ISR incentives" },
  KR: { country_name: "South Korea", corporate_tax_rate: 24, vat_standard_rate: 10, vat_reduced_rates: [], personal_income_tax_top_rate: 49.5, capital_gains_rate: 22, withholding_tax: { dividend: 22, interest: 22, royalty: 22 }, social_security: { employer: 10, employee: 10 }, currency: "KRW", notes: "Progressive CIT 9%/19%/21%/24%. Local income tax 10% of national" },
  CN: { country_name: "China", corporate_tax_rate: 25, vat_standard_rate: 13, vat_reduced_rates: [9, 6], personal_income_tax_top_rate: 45, capital_gains_rate: 20, withholding_tax: { dividend: 10, interest: 10, royalty: 10 }, social_security: { employer: 30, employee: 10.5 }, currency: "CNY", notes: "15% for qualified high/new tech enterprises. Small profit enterprises 5%" },
  ZA: { country_name: "South Africa", corporate_tax_rate: 27, vat_standard_rate: 15, vat_reduced_rates: [0], personal_income_tax_top_rate: 45, capital_gains_rate: 18, withholding_tax: { dividend: 20, interest: 15, royalty: 15 }, social_security: { employer: 2, employee: 1 }, currency: "ZAR", notes: "Turnover tax regime for micro businesses <ZAR 1M" },
  AE: { country_name: "United Arab Emirates", corporate_tax_rate: 9, vat_standard_rate: 5, vat_reduced_rates: [0], personal_income_tax_top_rate: 0, capital_gains_rate: 0, withholding_tax: { dividend: 0, interest: 0, royalty: 0 }, social_security: { employer: 12.5, employee: 5 }, currency: "AED", notes: "9% CIT from June 2023 on profits >AED 375k. 0% personal income tax" },
  SA: { country_name: "Saudi Arabia", corporate_tax_rate: 20, vat_standard_rate: 15, vat_reduced_rates: [], personal_income_tax_top_rate: 0, capital_gains_rate: 20, withholding_tax: { dividend: 5, interest: 5, royalty: 15 }, social_security: { employer: 12, employee: 10 }, currency: "SAR", notes: "20% on foreign investors. 2.5% Zakat on Saudi/GCC entities" },
  IS: { country_name: "Iceland", corporate_tax_rate: 20, vat_standard_rate: 24, vat_reduced_rates: [11], personal_income_tax_top_rate: 46.25, capital_gains_rate: 22, withholding_tax: { dividend: 22, interest: 12, royalty: 20 }, social_security: { employer: 6.35, employee: 4 }, currency: "ISK", notes: "EEA member, not EU. 24% VAT is standard" },
  NZ: { country_name: "New Zealand", corporate_tax_rate: 28, vat_standard_rate: 15, vat_reduced_rates: [], personal_income_tax_top_rate: 39, capital_gains_rate: 0, withholding_tax: { dividend: 0, interest: 15, royalty: 15 }, social_security: { employer: 0, employee: 0 }, currency: "NZD", notes: "No general capital gains tax. KiwiSaver employer contrib 3%" },
  IL: { country_name: "Israel", corporate_tax_rate: 23, vat_standard_rate: 17, vat_reduced_rates: [0], personal_income_tax_top_rate: 50, capital_gains_rate: 25, withholding_tax: { dividend: 25, interest: 25, royalty: 25 }, social_security: { employer: 7.6, employee: 12 }, currency: "ILS", notes: "Preferred enterprise incentives can reduce rate to 7.5-16%" },
  MY: { country_name: "Malaysia", corporate_tax_rate: 24, vat_standard_rate: 8, vat_reduced_rates: [0], personal_income_tax_top_rate: 30, capital_gains_rate: 0, withholding_tax: { dividend: 0, interest: 15, royalty: 10 }, social_security: { employer: 13, employee: 11 }, currency: "MYR", notes: "SST (Sales & Service Tax) 8% replaced GST. 17% for first MYR 600k" },
  TH: { country_name: "Thailand", corporate_tax_rate: 20, vat_standard_rate: 7, vat_reduced_rates: [], personal_income_tax_top_rate: 35, capital_gains_rate: 20, withholding_tax: { dividend: 10, interest: 15, royalty: 15 }, social_security: { employer: 5, employee: 5 }, currency: "THB", notes: "SME rate 15% on first THB 300k net profit" },
};

registerCapability("country-tax-rates", async (input: CapabilityInput) => {
  const raw = ((input.country_code as string) ?? (input.country as string) ?? (input.task as string) ?? "").trim().toUpperCase();
  if (!raw) throw new Error("'country_code' (ISO 2-letter code) is required.");

  // Try direct code match first, then name match
  let code = raw.length === 2 ? raw : null;
  if (!code) {
    const lower = raw.toLowerCase();
    for (const [c, data] of Object.entries(TAX_DATA)) {
      if (data.country_name.toLowerCase() === lower) { code = c; break; }
    }
  }
  if (!code || !TAX_DATA[code]) {
    throw new Error(`Tax data not available for '${raw}'. Supported: ${Object.keys(TAX_DATA).join(", ")}`);
  }

  const d = TAX_DATA[code];
  return {
    output: {
      country_code: code,
      country_name: d.country_name,
      corporate_tax_rate: d.corporate_tax_rate,
      vat_standard_rate: d.vat_standard_rate,
      vat_reduced_rates: d.vat_reduced_rates,
      personal_income_tax_top_rate: d.personal_income_tax_top_rate,
      capital_gains_rate: d.capital_gains_rate,
      withholding_tax: d.withholding_tax,
      social_security: d.social_security,
      currency: d.currency,
      tax_year: "2024/2025",
      last_updated: "2025-01",
      notes: d.notes,
    },
    provenance: { source: "published-tax-data", fetched_at: new Date().toISOString() },
  };
});
