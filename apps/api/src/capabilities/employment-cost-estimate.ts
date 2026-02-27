import { registerCapability, type CapabilityInput } from "./index.js";

// ─── Employment cost estimation — pure algorithmic with 2024/2025 tax tables ──

interface CountryTaxProfile {
  name: string;
  currency: string;
  employer_social_percent: number;
  employer_pension_percent: number;
  employer_other_percent: number;
  // Simplified income tax brackets: [threshold, rate][]
  // Each bracket applies to income above the threshold, up to the next threshold
  income_tax_brackets: Array<{ up_to: number; rate: number }>;
  notes: string[];
}

const COUNTRY_PROFILES: Record<string, CountryTaxProfile> = {
  SE: {
    name: "Sweden",
    currency: "SEK",
    employer_social_percent: 31.42,
    employer_pension_percent: 0, // Included in social contributions
    employer_other_percent: 0,
    income_tax_brackets: [
      { up_to: 24_300, rate: 0 }, // Basic deduction (approx)
      { up_to: 614_000, rate: 0.32 }, // Municipal tax ~32%
      { up_to: Infinity, rate: 0.52 }, // + state tax 20% on income above ~SEK 614k
    ],
    notes: [
      "Employer contributions (arbetsgivaravgifter) 31.42% cover pension, health, parental insurance, etc.",
      "Municipal tax varies 29-35%; 32% used as average.",
      "State income tax 20% applies above SEK 614,000 (2024).",
      "Reduced employer contributions for young employees (<23) and seniors (>65).",
    ],
  },
  NO: {
    name: "Norway",
    currency: "NOK",
    employer_social_percent: 14.1,
    employer_pension_percent: 2.0, // OTP minimum
    employer_other_percent: 0,
    income_tax_brackets: [
      { up_to: 108_300, rate: 0 }, // Personal allowance
      { up_to: 208_050, rate: 0.22 }, // Base rate 22%
      { up_to: 292_850, rate: 0.239 }, // +bracket surtax step 1 (1.7%)
      { up_to: 670_000, rate: 0.262 }, // +bracket surtax step 2 (4.0%)
      { up_to: 937_900, rate: 0.335 }, // +step 3 (13.6%)
      { up_to: 1_350_000, rate: 0.386 }, // +step 4 (16.6%)
      { up_to: Infinity, rate: 0.436 }, // +step 5 (17.6%)
    ],
    notes: [
      "Employer social contributions (arbeidsgiveravgift) 14.1% (zone 1, most of Norway).",
      "Lower rates in northern/rural zones (10.6-0%).",
      "OTP (mandatory occupational pension) minimum 2% of salary.",
      "Income tax: flat 22% + bracket surtax (trinnskatt) in progressive steps.",
    ],
  },
  DK: {
    name: "Denmark",
    currency: "DKK",
    employer_social_percent: 0,
    employer_pension_percent: 8.0, // Typical company pension contribution
    employer_other_percent: 2.0, // ATP, AES, financial contributions
    income_tax_brackets: [
      { up_to: 49_700, rate: 0.08 }, // AM-bidrag only (8%) on personal deduction
      { up_to: 588_900, rate: 0.378 }, // AM-bidrag 8% + municipal ~24.97% + bottom state tax 12.09% - deduction
      { up_to: Infinity, rate: 0.523 }, // +top tax 15% (effective max ~52.07%)
    ],
    notes: [
      "Denmark has virtually no employer social contributions (unique in Europe).",
      "Employer typically contributes 8-12% to pension (not mandatory by law but standard in collective agreements).",
      "AM-bidrag (labor market contribution) 8% paid by employee before tax.",
      "Effective marginal tax rate capped at ~52.07% (skattloft).",
      "ATP contribution ~DKK 2,272/year (small, split employer/employee).",
    ],
  },
  FI: {
    name: "Finland",
    currency: "EUR",
    employer_social_percent: 18.36, // TyEL + health + unemployment
    employer_pension_percent: 0, // Included in social (TyEL ~17.35%)
    employer_other_percent: 0.7, // Group life, accident insurance (typical)
    income_tax_brackets: [
      { up_to: 20_500, rate: 0 }, // Approximate deduction/zero bracket
      { up_to: 30_500, rate: 0.26 }, // Municipal ~20% + church ~1% + health ins
      { up_to: 50_400, rate: 0.30 },
      { up_to: 88_200, rate: 0.34 },
      { up_to: 150_000, rate: 0.42 },
      { up_to: Infinity, rate: 0.44 },
    ],
    notes: [
      "Employer pension (TyEL) ~17.35% for employees aged 17-52 (2024).",
      "Employer health insurance ~1.16%, unemployment insurance ~0.52% (up to salary cap).",
      "Municipal tax varies 17-24% (used ~20% average).",
      "Progressive state income tax starts at higher income levels.",
    ],
  },
  DE: {
    name: "Germany",
    currency: "EUR",
    employer_social_percent: 20.325, // pension 9.3 + health 7.3 + unemployment 1.3 + care 1.7 + accident ~0.725
    employer_pension_percent: 0, // Included in social
    employer_other_percent: 0,
    income_tax_brackets: [
      { up_to: 11_604, rate: 0 }, // Grundfreibetrag 2024
      { up_to: 17_006, rate: 0.14 }, // Progressive zone 1 (14-24%)
      { up_to: 66_761, rate: 0.30 }, // Progressive zone 2 (average ~30%)
      { up_to: 277_826, rate: 0.42 },
      { up_to: Infinity, rate: 0.45 }, // Reichensteuer
    ],
    notes: [
      "Employer social: pension 9.3%, health 7.3%, unemployment 1.3%, long-term care ~1.7%, accident ~0.725%.",
      "Social contributions have income ceilings (Beitragsbemessungsgrenze).",
      "Solidarity surcharge (5.5% of income tax) applies for high earners.",
      "Church tax (~8-9% of income tax) if member of a church.",
    ],
  },
  GB: {
    name: "United Kingdom",
    currency: "GBP",
    employer_social_percent: 13.8, // Employer NI
    employer_pension_percent: 3.0, // Auto-enrolment minimum employer contribution
    employer_other_percent: 0,
    income_tax_brackets: [
      { up_to: 12_570, rate: 0 }, // Personal allowance
      { up_to: 50_270, rate: 0.20 },
      { up_to: 125_140, rate: 0.40 },
      { up_to: Infinity, rate: 0.45 },
    ],
    notes: [
      "Employer NI 13.8% on earnings above GBP 9,100/year (Secondary Threshold).",
      "Auto-enrolment pension: employer min 3%, employee min 5%.",
      "Personal allowance tapered for income above GBP 100,000.",
      "Scotland has different income tax rates (19%, 20%, 21%, 42%, 47%).",
    ],
  },
  NL: {
    name: "Netherlands",
    currency: "EUR",
    employer_social_percent: 18.5, // ZVW, WW, WAO/WIA
    employer_pension_percent: 0, // Varies widely, often 5-15% but not standardized
    employer_other_percent: 0,
    income_tax_brackets: [
      { up_to: 75_518, rate: 0.3693 }, // Box 1, bracket 1 (2024)
      { up_to: Infinity, rate: 0.495 }, // Box 1, bracket 2
    ],
    notes: [
      "Employer social ~18-20% (health ZVW ~6.68%, unemployment WW ~2.64%, disability WAO/WIA ~7.11%, other levies).",
      "First bracket 36.93% includes premiums for national insurance (AOW, Anw, Wlz).",
      "30% ruling may apply for qualifying expatriate employees (up to 5 years).",
      "Pension contributions vary significantly by industry/CLA.",
    ],
  },
  FR: {
    name: "France",
    currency: "EUR",
    employer_social_percent: 45.0, // Very high: health, pension, unemployment, family, etc.
    employer_pension_percent: 0, // Included in social
    employer_other_percent: 0,
    income_tax_brackets: [
      { up_to: 11_294, rate: 0 },
      { up_to: 28_797, rate: 0.11 },
      { up_to: 82_341, rate: 0.30 },
      { up_to: 177_106, rate: 0.41 },
      { up_to: Infinity, rate: 0.45 },
    ],
    notes: [
      "France has among the highest employer social contributions in Europe at ~45%.",
      "Includes: health ~13%, pension (base + complementary) ~16%, unemployment ~4%, family ~5.25%, CSG/CRDS, transport, etc.",
      "Income tax is household-based (quotient familial system).",
      "Various reductions exist (Fillon reduction for lower salaries).",
    ],
  },
  US: {
    name: "United States",
    currency: "USD",
    employer_social_percent: 7.65, // Social Security 6.2% + Medicare 1.45%
    employer_pension_percent: 0, // 401k match varies, not mandatory
    employer_other_percent: 1.0, // FUTA, state unemployment (varies)
    income_tax_brackets: [
      { up_to: 11_600, rate: 0.10 },
      { up_to: 47_150, rate: 0.12 },
      { up_to: 100_525, rate: 0.22 },
      { up_to: 191_950, rate: 0.24 },
      { up_to: 243_725, rate: 0.32 },
      { up_to: 609_350, rate: 0.35 },
      { up_to: Infinity, rate: 0.37 },
    ],
    notes: [
      "Employer FICA: Social Security 6.2% (up to $168,600 wage base) + Medicare 1.45% (no cap).",
      "Federal unemployment (FUTA) 6% on first $7,000 (effectively 0.6% with state credit).",
      "State income tax varies 0-13.3% (not included in estimate).",
      "State unemployment insurance varies by state and employer history.",
      "No mandatory employer pension; 401k match is common but voluntary.",
    ],
  },
  CA: {
    name: "Canada",
    currency: "CAD",
    employer_social_percent: 7.7, // CPP 5.95% + EI 1.66% (approx)
    employer_pension_percent: 0, // Included in CPP
    employer_other_percent: 1.0, // Workers comp, health tax (varies by province)
    income_tax_brackets: [
      { up_to: 15_705, rate: 0 }, // Basic personal amount
      { up_to: 55_867, rate: 0.15 },
      { up_to: 111_733, rate: 0.205 },
      { up_to: 154_906, rate: 0.26 },
      { up_to: 220_000, rate: 0.29 },
      { up_to: Infinity, rate: 0.33 },
    ],
    notes: [
      "CPP contributions ~5.95% employer + 5.95% employee (2024, on earnings $3,500-$68,500).",
      "CPP2 on earnings $68,500-$73,200 at 4%.",
      "EI premiums: employer 1.66x employee rate.",
      "Provincial income tax adds 4-21% depending on province (not included).",
      "Provincial health taxes vary (e.g., Ontario EHT 0.98-1.95%).",
    ],
  },
  AU: {
    name: "Australia",
    currency: "AUD",
    employer_social_percent: 11.5, // Superannuation Guarantee 2024-25
    employer_pension_percent: 0, // Super is the pension, included above
    employer_other_percent: 1.0, // Workers comp, payroll tax (varies by state)
    income_tax_brackets: [
      { up_to: 18_200, rate: 0 },
      { up_to: 45_000, rate: 0.16 }, // Stage 3 tax cuts from 2024-25
      { up_to: 135_000, rate: 0.30 },
      { up_to: 190_000, rate: 0.37 },
      { up_to: Infinity, rate: 0.45 },
    ],
    notes: [
      "Superannuation Guarantee 11.5% (2024-25), rising to 12% from 2025-26.",
      "Medicare levy 2% on taxable income (not included in brackets above).",
      "Payroll tax varies by state (3.75-6.85%, threshold varies).",
      "No separate social security contributions beyond super.",
    ],
  },
  IE: {
    name: "Ireland",
    currency: "EUR",
    employer_social_percent: 11.05, // Employer PRSI (Class A)
    employer_pension_percent: 0, // Auto-enrolment coming 2025
    employer_other_percent: 0,
    income_tax_brackets: [
      { up_to: 5_000, rate: 0 }, // Approximate after credits
      { up_to: 42_000, rate: 0.20 },
      { up_to: Infinity, rate: 0.40 },
    ],
    notes: [
      "Employer PRSI 11.05% (Class A, most employees). 8.8% if weekly pay < EUR 441.",
      "USC (Universal Social Charge) 0.5-8% paid by employee.",
      "Employee PRSI 4%.",
      "Tax credits reduce effective tax significantly at lower incomes.",
    ],
  },
  CH: {
    name: "Switzerland",
    currency: "CHF",
    employer_social_percent: 6.4, // AHV/IV/EO
    employer_pension_percent: 7.0, // BVG/LPP occupational pension (varies, ~7% average)
    employer_other_percent: 2.0, // ALV (unemployment), accident insurance
    income_tax_brackets: [
      { up_to: 17_800, rate: 0 },
      { up_to: 31_600, rate: 0.0077 },
      { up_to: 41_400, rate: 0.0088 },
      { up_to: 55_200, rate: 0.026 },
      { up_to: 72_500, rate: 0.03 },
      { up_to: 78_100, rate: 0.034 },
      { up_to: 103_600, rate: 0.036 },
      { up_to: 134_600, rate: 0.04 },
      { up_to: 176_000, rate: 0.08 },
      { up_to: 755_200, rate: 0.115 },
      { up_to: Infinity, rate: 0.135 },
    ],
    notes: [
      "AHV/IV/EO (social security) 5.3% employer + 5.3% employee (shown as 6.4% total employer including other small levies).",
      "BVG occupational pension varies greatly (7% average employer share).",
      "ALV unemployment insurance 1.1% each (employer + employee).",
      "Federal tax rates shown; cantonal/communal taxes add significantly (total effective rate 20-40%).",
      "Tax rates vary enormously by canton (e.g., Zug vs. Geneva).",
    ],
  },
  ES: {
    name: "Spain",
    currency: "EUR",
    employer_social_percent: 29.9, // Social Security + unemployment + FOGASA + training
    employer_pension_percent: 0, // Included in social
    employer_other_percent: 0,
    income_tax_brackets: [
      { up_to: 12_450, rate: 0.19 },
      { up_to: 20_200, rate: 0.24 },
      { up_to: 35_200, rate: 0.30 },
      { up_to: 60_000, rate: 0.37 },
      { up_to: 300_000, rate: 0.45 },
      { up_to: Infinity, rate: 0.47 },
    ],
    notes: [
      "Employer social: common contingencies ~23.6%, unemployment ~5.5%, FOGASA 0.2%, professional training 0.6%.",
      "Employee social ~6.35%.",
      "Regional surcharges may apply depending on autonomous community.",
    ],
  },
  IT: {
    name: "Italy",
    currency: "EUR",
    employer_social_percent: 30.0, // INPS + INAIL (approximate)
    employer_pension_percent: 0, // Included in INPS
    employer_other_percent: 0,
    income_tax_brackets: [
      { up_to: 28_000, rate: 0.23 },
      { up_to: 50_000, rate: 0.35 },
      { up_to: Infinity, rate: 0.43 },
    ],
    notes: [
      "Employer INPS contributions ~30% (pension ~23%, other social ~7%).",
      "INAIL (accident insurance) varies by industry (0.4-12%).",
      "TFR (severance fund) ~7.4% of gross salary accrued annually.",
      "Regional and municipal surcharges 0.7-3.7% on income tax.",
    ],
  },
  AT: {
    name: "Austria",
    currency: "EUR",
    employer_social_percent: 21.23, // Pension, health, unemployment, accident, other levies
    employer_pension_percent: 0, // Included in social
    employer_other_percent: 0,
    income_tax_brackets: [
      { up_to: 12_816, rate: 0 },
      { up_to: 20_818, rate: 0.20 },
      { up_to: 34_513, rate: 0.30 },
      { up_to: 66_612, rate: 0.40 },
      { up_to: 99_266, rate: 0.48 },
      { up_to: 1_000_000, rate: 0.50 },
      { up_to: Infinity, rate: 0.55 },
    ],
    notes: [
      "Employer social: pension 12.55%, health 3.78%, unemployment 3%, accident 1.1%, other levies ~0.8%.",
      "13th and 14th month salary (Weihnachts-/Urlaubsgeld) taxed at flat 6%.",
      "Municipal tax (Kommunalsteuer) 3% is an additional employer cost.",
    ],
  },
  PL: {
    name: "Poland",
    currency: "PLN",
    employer_social_percent: 20.48, // Pension, disability, accident, FP, FGSP
    employer_pension_percent: 0, // Included in social
    employer_other_percent: 0,
    income_tax_brackets: [
      { up_to: 30_000, rate: 0 }, // Tax-free amount
      { up_to: 120_000, rate: 0.12 },
      { up_to: Infinity, rate: 0.32 },
    ],
    notes: [
      "Employer social: pension 9.76%, disability 6.5%, accident ~1.67%, Labor Fund (FP) 2.45%, FGSP 0.1%.",
      "Employee social: pension 9.76%, disability 1.5%, health 9%.",
      "PPK (Employee Capital Plans) employer 1.5% minimum.",
    ],
  },
  PT: {
    name: "Portugal",
    currency: "EUR",
    employer_social_percent: 23.75, // Social Security (TSU)
    employer_pension_percent: 0, // Included in social
    employer_other_percent: 0,
    income_tax_brackets: [
      { up_to: 7_703, rate: 0.1325 },
      { up_to: 11_623, rate: 0.18 },
      { up_to: 16_472, rate: 0.23 },
      { up_to: 21_321, rate: 0.26 },
      { up_to: 27_146, rate: 0.3275 },
      { up_to: 39_791, rate: 0.37 },
      { up_to: 51_997, rate: 0.435 },
      { up_to: 81_199, rate: 0.45 },
      { up_to: Infinity, rate: 0.48 },
    ],
    notes: [
      "Employer TSU (Taxa Social Unica) 23.75%.",
      "Employee TSU 11%.",
      "NHR (Non-Habitual Resident) regime: 20% flat rate for qualifying foreign income (being phased out).",
    ],
  },
};

function calculateIncomeTax(
  grossSalary: number,
  brackets: Array<{ up_to: number; rate: number }>,
): number {
  let tax = 0;
  let previousThreshold = 0;

  for (const bracket of brackets) {
    if (grossSalary <= previousThreshold) break;

    const taxableInBracket =
      Math.min(grossSalary, bracket.up_to) - previousThreshold;
    if (taxableInBracket > 0) {
      tax += taxableInBracket * bracket.rate;
    }
    previousThreshold = bracket.up_to;
  }

  return Math.round(tax * 100) / 100;
}

registerCapability("employment-cost-estimate", async (input: CapabilityInput) => {
  const grossRaw = input.gross_salary ?? input.salary ?? input.amount;
  if (grossRaw == null || (typeof grossRaw !== "number" && typeof grossRaw !== "string")) {
    throw new Error(
      "'gross_salary' is required. Provide a number (e.g. 600000 for SEK 600,000).",
    );
  }

  const grossSalary =
    typeof grossRaw === "number" ? grossRaw : parseFloat(String(grossRaw));
  if (isNaN(grossSalary) || grossSalary <= 0) {
    throw new Error("'gross_salary' must be a positive number.");
  }

  const countryRaw =
    (input.country_code as string) ?? (input.country as string) ?? "";
  if (!countryRaw.trim()) {
    throw new Error(
      "'country_code' is required. Provide a 2-letter country code (e.g. 'SE', 'DE', 'US').",
    );
  }

  let countryCode = countryRaw.trim().toUpperCase();
  if (countryCode === "UK") countryCode = "GB";

  const profile = COUNTRY_PROFILES[countryCode];
  if (!profile) {
    const supported = Object.keys(COUNTRY_PROFILES).sort().join(", ");
    throw new Error(
      `Country '${countryCode}' is not supported. Supported: ${supported}.`,
    );
  }

  const isAnnual = input.annual !== false && input.annual !== "false";
  const annualGross = isAnnual ? grossSalary : grossSalary * 12;
  const period = isAnnual ? "annual" : "monthly";

  const currency = (input.currency as string) ?? profile.currency;

  // Employer contributions
  const socialPercent = profile.employer_social_percent;
  const pensionPercent = profile.employer_pension_percent;
  const otherPercent = profile.employer_other_percent;
  const totalEmployerPercent = socialPercent + pensionPercent + otherPercent;
  const totalEmployerAmount =
    Math.round(annualGross * (totalEmployerPercent / 100) * 100) / 100;
  const totalEmployerCost =
    Math.round((annualGross + totalEmployerAmount) * 100) / 100;

  // Estimate net salary (simplified — after income tax)
  const estimatedIncomeTax = calculateIncomeTax(
    annualGross,
    profile.income_tax_brackets,
  );
  const netSalaryEstimate =
    Math.round((annualGross - estimatedIncomeTax) * 100) / 100;
  const effectiveTaxRate =
    annualGross > 0
      ? Math.round((estimatedIncomeTax / annualGross) * 10000) / 100
      : 0;

  // If monthly input, show monthly output values
  const displayGross = isAnnual ? grossSalary : grossSalary;
  const displayEmployerAmount = isAnnual
    ? totalEmployerAmount
    : Math.round((totalEmployerAmount / 12) * 100) / 100;
  const displayTotalCost = isAnnual
    ? totalEmployerCost
    : Math.round((totalEmployerCost / 12) * 100) / 100;
  const displayNet = isAnnual
    ? netSalaryEstimate
    : Math.round((netSalaryEstimate / 12) * 100) / 100;

  return {
    output: {
      gross_salary: displayGross,
      currency,
      country_code: countryCode,
      country_name: profile.name,
      period,
      employer_contributions: {
        social_security_percent: socialPercent,
        pension_percent: pensionPercent,
        other_percent: otherPercent,
        total_percent: Math.round(totalEmployerPercent * 100) / 100,
        total_amount: displayEmployerAmount,
      },
      total_employer_cost: displayTotalCost,
      net_salary_estimate: displayNet,
      effective_tax_rate: effectiveTaxRate,
      breakdown_notes: profile.notes,
    },
    provenance: {
      source: "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
