/**
 * Seed 60 new solutions (KYB Essentials, KYB Complete, Invoice Verify)
 * across 20 countries, and deprecate 5 old solutions.
 *
 * Usage: npx tsx scripts/seed-kyb-solutions.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

config({ path: resolve(import.meta.dirname, "../../../.env") });

// UTF-16 fallback for .env
if (!process.env.DATABASE_URL) {
  const buf = readFileSync(resolve(import.meta.dirname, "../../../.env"));
  const text = buf.toString("utf16le");
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  for (const line of clean.split(/\r?\n/)) {
    if (line.startsWith("DATABASE_URL=")) {
      process.env.DATABASE_URL = line.substring("DATABASE_URL=".length);
      break;
    }
  }
}

import { getDb } from "../src/db/index.js";
import { capabilities, solutions, solutionSteps } from "../src/db/schema.js";
import { eq, inArray } from "drizzle-orm";
import { validateSolution, enforceGates } from "../src/lib/onboarding-gates.js";

// ─── Country definitions ───────────────────────────────────────────────────

interface Country {
  code: string;
  name: string;
  companyDataSlug: string;
  isEU: boolean;
  geography: string;
  inputField: string;
  inputLabel: string;
  exampleId: string;
}

const COUNTRIES: Country[] = [
  { code: "se", name: "Sweden", companyDataSlug: "swedish-company-data", isEU: true, geography: "nordic", inputField: "org_number", inputLabel: "Swedish organization number", exampleId: "556703-7485" },
  { code: "no", name: "Norway", companyDataSlug: "norwegian-company-data", isEU: true, geography: "nordic", inputField: "org_number", inputLabel: "Norwegian org number (9 digits)", exampleId: "984851006" },
  { code: "dk", name: "Denmark", companyDataSlug: "danish-company-data", isEU: true, geography: "nordic", inputField: "cvr_number", inputLabel: "Danish CVR number", exampleId: "10150817" },
  { code: "fi", name: "Finland", companyDataSlug: "finnish-company-data", isEU: true, geography: "nordic", inputField: "business_id", inputLabel: "Finnish business ID", exampleId: "0112038-9" },
  { code: "uk", name: "United Kingdom", companyDataSlug: "uk-company-data", isEU: true, geography: "eu", inputField: "company_number", inputLabel: "UK Companies House number", exampleId: "00445790" },
  { code: "de", name: "Germany", companyDataSlug: "german-company-data", isEU: true, geography: "eu", inputField: "company_name", inputLabel: "German company name or registration number", exampleId: "Siemens AG" },
  { code: "fr", name: "France", companyDataSlug: "french-company-data", isEU: true, geography: "eu", inputField: "siren", inputLabel: "French SIREN/SIRET number", exampleId: "542051180" },
  { code: "nl", name: "Netherlands", companyDataSlug: "dutch-company-data", isEU: true, geography: "eu", inputField: "kvk_number", inputLabel: "Dutch KVK number", exampleId: "34186284" },
  { code: "be", name: "Belgium", companyDataSlug: "belgian-company-data", isEU: true, geography: "eu", inputField: "enterprise_number", inputLabel: "Belgian enterprise number", exampleId: "0403.170.701" },
  { code: "at", name: "Austria", companyDataSlug: "austrian-company-data", isEU: true, geography: "eu", inputField: "company_name", inputLabel: "Austrian company name or register number", exampleId: "Red Bull GmbH" },
  { code: "ie", name: "Ireland", companyDataSlug: "irish-company-data", isEU: true, geography: "eu", inputField: "company_name", inputLabel: "Irish company name or CRO number", exampleId: "Ryanair Holdings plc" },
  { code: "es", name: "Spain", companyDataSlug: "spanish-company-data", isEU: true, geography: "eu", inputField: "company_name", inputLabel: "Spanish company name or CIF", exampleId: "Banco Santander" },
  { code: "it", name: "Italy", companyDataSlug: "italian-company-data", isEU: true, geography: "eu", inputField: "company_name", inputLabel: "Italian company name or codice fiscale", exampleId: "Ferrari" },
  { code: "ch", name: "Switzerland", companyDataSlug: "swiss-company-data", isEU: true, geography: "eu", inputField: "company_name", inputLabel: "Swiss company name or UID", exampleId: "Nestlé SA" },
  { code: "pl", name: "Poland", companyDataSlug: "polish-company-data", isEU: true, geography: "eu", inputField: "krs_number", inputLabel: "Polish KRS number", exampleId: "0000019193" },
  { code: "pt", name: "Portugal", companyDataSlug: "portuguese-company-data", isEU: true, geography: "eu", inputField: "company_name", inputLabel: "Portuguese company name or NIPC", exampleId: "EDP" },
  { code: "us", name: "United States", companyDataSlug: "us-company-data", isEU: false, geography: "us", inputField: "company_name", inputLabel: "US company name or EIN", exampleId: "Apple Inc" },
  { code: "ca", name: "Canada", companyDataSlug: "canadian-company-data", isEU: false, geography: "us", inputField: "company_name", inputLabel: "Canadian company name or corporation number", exampleId: "Shopify Inc" },
  { code: "au", name: "Australia", companyDataSlug: "au-company-data", isEU: false, geography: "us-global", inputField: "abn", inputLabel: "Australian Business Number (11 digits)", exampleId: "51824753556" },
  // Singapore retired 2026-04-21 (DEC-20260421-I). Country count now 19.
  // See audit-reports/2026-04-21-singapore-kyb-investigation.md.
];

// ─── Disclaimer (reused across solutions) ──────────────────────────────────

const DISCLAIMER = {
  text: "This report is based on automated checks against public registries and screening databases. It does not constitute legal advice, compliance advice, or a risk decision.",
  not_a_substitute_for: [
    "Legal advice from a qualified attorney",
    "Compliance officer review",
    "Direct registry verification",
    "Ongoing monitoring",
  ],
  limitations: [
    "OpenSanctions data may not include all global sanctions lists",
    "AI-generated assessments may contain errors",
    "Registry data may have filing lag of days to weeks",
  ],
};

// ─── Solution builders ─────────────────────────────────────────────────────

interface SolutionStep {
  capabilitySlug: string;
  stepOrder: number;
  canParallel: boolean;
  parallelGroup: number | null;
  inputMap: Record<string, string>;
}

interface SolutionDef {
  slug: string;
  name: string;
  marketingName: string;
  description: string;
  longDescription: string;
  agentDescription: string;
  category: string;
  priceCents: number;
  componentSumCents: number;
  valueTier: string;
  maintenanceLevel: string;
  geography: string;
  targetAudience: string;
  transparencyTag: string | null;
  extendsWith: string[];
  inputSchema: Record<string, unknown>;
  exampleInput: Record<string, unknown>;
  exampleOutput: Record<string, unknown>;
  steps: SolutionStep[];
}

function buildKybEssentials(c: Country): SolutionDef {
  const steps: SolutionStep[] = [
    {
      capabilitySlug: c.companyDataSlug,
      stepOrder: 1,
      canParallel: false,
      parallelGroup: null,
      inputMap: { [c.inputField]: `$input.${c.inputField}` },
    },
  ];

  let stepOrder = 2;
  const group2: SolutionStep[] = [];

  if (c.isEU) {
    group2.push({
      capabilitySlug: "vat-validate",
      stepOrder: stepOrder++,
      canParallel: true,
      parallelGroup: 1,
      inputMap: { vat_number: "$steps[0].vat_number" },
    });
  }
  group2.push({
    capabilitySlug: "sanctions-check",
    stepOrder: stepOrder++,
    canParallel: true,
    parallelGroup: 1,
    inputMap: { name: "$steps[0].company_name" },
  });
  group2.push({
    capabilitySlug: "lei-lookup",
    stepOrder: stepOrder++,
    canParallel: true,
    parallelGroup: 1,
    inputMap: { company_name: "$steps[0].company_name" },
  });

  steps.push(...group2);

  const checkCount = c.isEU ? 4 : 3;

  return {
    slug: `kyb-essentials-${c.code}`,
    name: `KYB Essentials — ${c.name}`,
    marketingName: `KYB Essentials — ${c.name}`,
    description: `Quick company verification for ${c.name}. Confirms the company exists in the official registry, ${c.isEU ? "validates VAT registration, " : ""}screens against international sanctions lists, and checks LEI status.`,
    longDescription: `Performs ${checkCount} automated checks for ${c.name} companies: official registry lookup via ${c.companyDataSlug}, ${c.isEU ? "EU VAT validation via VIES, " : ""}sanctions screening against OFAC/EU/UN lists, and LEI (Legal Entity Identifier) lookup. Returns structured check results with a disclaimer.`,
    agentDescription: `verify ${c.name.toLowerCase()} company, kyb ${c.code}, check ${c.name.toLowerCase()} business, ${c.code} company verification, onboard ${c.name.toLowerCase()} customer`,
    category: "compliance-verification",
    priceCents: 150,
    componentSumCents: c.isEU ? 120 : 100,
    valueTier: "verification",
    maintenanceLevel: "very-low",
    geography: c.geography,
    targetAudience: "Developers building onboarding flows, KYB checks, or compliance automation",
    transparencyTag: "mixed",
    extendsWith: [],
    inputSchema: {
      type: "object",
      properties: {
        [c.inputField]: { type: "string", description: c.inputLabel },
      },
      required: [c.inputField],
    },
    exampleInput: { [c.inputField]: c.exampleId },
    exampleOutput: {
      checks: { company_exists: true, sanctions_clear: true, lei_found: false },
      disclaimer: DISCLAIMER,
    },
    steps,
  };
}

function buildKybComplete(c: Country): SolutionDef {
  const steps: SolutionStep[] = [];
  let stepOrder = 1;

  // Group 1: Company data (sequential)
  steps.push({
    capabilitySlug: c.companyDataSlug,
    stepOrder: stepOrder++,
    canParallel: false,
    parallelGroup: null,
    inputMap: { [c.inputField]: `$input.${c.inputField}` },
  });

  // Group 2: VAT + LEI (parallel)
  if (c.isEU) {
    steps.push({
      capabilitySlug: "vat-validate",
      stepOrder: stepOrder++,
      canParallel: true,
      parallelGroup: 1,
      inputMap: { vat_number: "$steps[0].vat_number" },
    });
  }
  steps.push({
    capabilitySlug: "lei-lookup",
    stepOrder: stepOrder++,
    canParallel: true,
    parallelGroup: 1,
    inputMap: { company_name: "$steps[0].company_name" },
  });

  // Group 3: Sanctions + PEP + Adverse media (parallel)
  steps.push({
    capabilitySlug: "sanctions-check",
    stepOrder: stepOrder++,
    canParallel: true,
    parallelGroup: 2,
    inputMap: { name: "$steps[0].company_name" },
  });
  steps.push({
    capabilitySlug: "pep-check",
    stepOrder: stepOrder++,
    canParallel: true,
    parallelGroup: 2,
    inputMap: { name: "$input.contact_name" },
  });
  steps.push({
    capabilitySlug: "adverse-media-check",
    stepOrder: stepOrder++,
    canParallel: true,
    parallelGroup: 2,
    inputMap: { entity_name: "$steps[0].company_name" },
  });

  // Group 4: Digital presence (parallel)
  steps.push({
    capabilitySlug: "domain-reputation",
    stepOrder: stepOrder++,
    canParallel: true,
    parallelGroup: 3,
    inputMap: { domain: "$input.domain" },
  });
  steps.push({
    capabilitySlug: "whois-lookup",
    stepOrder: stepOrder++,
    canParallel: true,
    parallelGroup: 3,
    inputMap: { domain: "$input.domain" },
  });
  steps.push({
    capabilitySlug: "ssl-check",
    stepOrder: stepOrder++,
    canParallel: true,
    parallelGroup: 3,
    inputMap: { domain: "$input.domain" },
  });
  steps.push({
    capabilitySlug: "dns-lookup",
    stepOrder: stepOrder++,
    canParallel: true,
    parallelGroup: 3,
    inputMap: { domain: "$input.domain" },
  });
  steps.push({
    capabilitySlug: "email-validate",
    stepOrder: stepOrder++,
    canParallel: true,
    parallelGroup: 3,
    inputMap: { email: "$input.contact_email" },
  });

  // Sweden bonus: Group 4b
  if (c.code === "se") {
    steps.push({
      capabilitySlug: "credit-report-summary",
      stepOrder: stepOrder++,
      canParallel: true,
      parallelGroup: 4,
      inputMap: { org_number: "$input.org_number" },
    });
    steps.push({
      capabilitySlug: "annual-report-extract",
      stepOrder: stepOrder++,
      canParallel: true,
      parallelGroup: 4,
      inputMap: { org_number: "$input.org_number" },
    });
  }

  // Group 5: Risk narrative (sequential, final)
  steps.push({
    capabilitySlug: "risk-narrative-generate",
    stepOrder: stepOrder++,
    canParallel: false,
    parallelGroup: null,
    inputMap: { check_results: "$all_results", context: "kyb" },
  });

  const checkCount = steps.length - 1; // exclude narrative step

  return {
    slug: `kyb-complete-${c.code}`,
    name: `KYB Complete — ${c.name}`,
    marketingName: `KYB Complete — ${c.name}`,
    description: `Comprehensive company verification for ${c.name}. Full compliance check including registry verification, sanctions screening, PEP screening, adverse media search, digital presence analysis, and a plain-language risk narrative.`,
    longDescription: `Performs ${checkCount} automated checks for ${c.name} companies: official registry lookup, ${c.isEU ? "VAT validation, " : ""}LEI check, sanctions screening, PEP screening, adverse media search, domain reputation, WHOIS, SSL, DNS, and email validation${c.code === "se" ? " plus credit report and annual report extraction" : ""}. Produces a dual-output response with structured checks and a human-readable risk narrative.`,
    agentDescription: `comprehensive ${c.name.toLowerCase()} company check, full kyb ${c.code}, deep ${c.name.toLowerCase()} verification, compliance check ${c.code}, due diligence ${c.name.toLowerCase()}`,
    category: "compliance-verification",
    priceCents: 250,
    componentSumCents: c.isEU ? 170 : 150,
    valueTier: "compliance",
    maintenanceLevel: "low",
    geography: c.geography,
    targetAudience: "Compliance teams, fintech platforms, and AI agents performing KYB due diligence",
    transparencyTag: "mixed",
    extendsWith: c.code === "se" ? [] : ["credit-report-summary", "annual-report-extract"],
    inputSchema: {
      type: "object",
      properties: {
        [c.inputField]: { type: "string", description: c.inputLabel },
        vat_number: { type: "string", description: "EU VAT number with country prefix (e.g. DE811128135). Auto-derived from registry data when possible." },
        domain: { type: "string", description: "Company website domain (e.g., example.com)" },
        contact_name: { type: "string", description: "Name of contact person for PEP screening" },
        contact_email: { type: "string", description: "Contact email for validation" },
      },
      required: [c.inputField],
    },
    exampleInput: { [c.inputField]: c.exampleId, vat_number: "SE556059030801", domain: "example.com", contact_name: "John Doe", contact_email: "john@example.com" },
    exampleOutput: {
      checks: { company_exists: true, sanctions_clear: true, pep_clear: true, adverse_media_clear: true },
      narrative: { risk_level: "low", summary: "No risk indicators found in the sources consulted." },
      disclaimer: DISCLAIMER,
    },
    steps,
  };
}

function buildInvoiceVerify(c: Country): SolutionDef {
  const steps: SolutionStep[] = [];
  let stepOrder = 1;

  // Group 1: Company data (sequential)
  steps.push({
    capabilitySlug: c.companyDataSlug,
    stepOrder: stepOrder++,
    canParallel: false,
    parallelGroup: null,
    inputMap: { [c.inputField]: `$input.${c.inputField}` },
  });

  // Group 2: Payment validation (parallel)
  if (c.isEU) {
    steps.push({
      capabilitySlug: "vat-validate",
      stepOrder: stepOrder++,
      canParallel: true,
      parallelGroup: 1,
      inputMap: { vat_number: "$input.vat_number" },
    });
    steps.push({
      capabilitySlug: "vat-format-validate",
      stepOrder: stepOrder++,
      canParallel: true,
      parallelGroup: 1,
      inputMap: { vat_number: "$input.vat_number" },
    });
  }
  steps.push({
    capabilitySlug: "iban-validate",
    stepOrder: stepOrder++,
    canParallel: true,
    parallelGroup: 1,
    inputMap: { iban: "$input.iban" },
  });
  steps.push({
    capabilitySlug: "bank-bic-lookup",
    stepOrder: stepOrder++,
    canParallel: true,
    parallelGroup: 1,
    inputMap: { bic: "$input.bic" },
  });

  // Group 3: Risk screening (parallel)
  steps.push({
    capabilitySlug: "sanctions-check",
    stepOrder: stepOrder++,
    canParallel: true,
    parallelGroup: 2,
    inputMap: { name: "$steps[0].company_name" },
  });
  steps.push({
    capabilitySlug: "adverse-media-check",
    stepOrder: stepOrder++,
    canParallel: true,
    parallelGroup: 2,
    inputMap: { entity_name: "$steps[0].company_name" },
  });
  steps.push({
    capabilitySlug: "invoice-validate",
    stepOrder: stepOrder++,
    canParallel: true,
    parallelGroup: 2,
    inputMap: { invoice_data: "$input.invoice_data" },
  });

  // Group 4: Sender domain checks (parallel)
  steps.push({
    capabilitySlug: "domain-reputation",
    stepOrder: stepOrder++,
    canParallel: true,
    parallelGroup: 3,
    inputMap: { domain: "$input.sender_domain" },
  });
  steps.push({
    capabilitySlug: "whois-lookup",
    stepOrder: stepOrder++,
    canParallel: true,
    parallelGroup: 3,
    inputMap: { domain: "$input.sender_domain" },
  });
  steps.push({
    capabilitySlug: "email-validate",
    stepOrder: stepOrder++,
    canParallel: true,
    parallelGroup: 3,
    inputMap: { email: "$input.sender_email" },
  });
  steps.push({
    capabilitySlug: "dns-lookup",
    stepOrder: stepOrder++,
    canParallel: true,
    parallelGroup: 3,
    inputMap: { domain: "$input.sender_domain" },
  });
  steps.push({
    capabilitySlug: "redirect-trace",
    stepOrder: stepOrder++,
    canParallel: true,
    parallelGroup: 3,
    inputMap: { url: "$input.sender_url" },
  });

  // Group 5: Risk narrative (sequential, final)
  steps.push({
    capabilitySlug: "risk-narrative-generate",
    stepOrder: stepOrder++,
    canParallel: false,
    parallelGroup: null,
    inputMap: { check_results: "$all_results", context: "invoice_fraud" },
  });

  const checkCount = steps.length - 1;

  return {
    slug: `invoice-verify-${c.code}`,
    name: `Invoice Verify — ${c.name}`,
    marketingName: `Invoice Verify — ${c.name}`,
    description: `Invoice fraud detection for ${c.name}. Verifies the invoicing company exists, validates payment details (IBAN, BIC${c.isEU ? ", VAT" : ""}), screens for sanctions and adverse media, analyzes sender domain trustworthiness, and produces a plain-language fraud assessment.`,
    longDescription: `Performs ${checkCount} automated checks for invoices from ${c.name}: company registry verification, ${c.isEU ? "VAT validation, " : ""}IBAN and BIC validation, sanctions screening, adverse media search, invoice format validation, domain reputation, WHOIS, email validation, DNS check, and redirect tracing. Returns a dual-output response with structured checks and a human-readable fraud assessment.`,
    agentDescription: `verify ${c.name.toLowerCase()} invoice, invoice fraud check ${c.code}, is this ${c.name.toLowerCase()} invoice legitimate, validate ${c.name.toLowerCase()} payment, ${c.code} invoice verification`,
    category: "compliance-verification",
    priceCents: 250,
    componentSumCents: c.isEU ? 180 : 150,
    valueTier: "compliance",
    maintenanceLevel: "low",
    geography: c.geography,
    targetAudience: "Finance teams, AP automation, and AI agents reviewing incoming invoices",
    transparencyTag: "mixed",
    extendsWith: [],
    inputSchema: {
      type: "object",
      properties: {
        [c.inputField]: { type: "string", description: c.inputLabel },
        vat_number: { type: "string", description: "VAT number from the invoice" },
        iban: { type: "string", description: "IBAN from the invoice payment details" },
        bic: { type: "string", description: "BIC/SWIFT code from the invoice" },
        sender_domain: { type: "string", description: "Domain of the invoice sender" },
        sender_email: { type: "string", description: "Email address of the invoice sender" },
        sender_url: { type: "string", description: "URL from the invoice for redirect tracing" },
        invoice_data: { type: "object", description: "Structured invoice data for validation" },
      },
      required: [c.inputField],
    },
    exampleInput: { [c.inputField]: c.exampleId, iban: "SE4550000000058398257466", bic: "ESSESESS", sender_domain: "example.com" },
    exampleOutput: {
      checks: { company_exists: true, iban_valid: true, sanctions_clear: true },
      narrative: { risk_level: "none", summary: "All automated checks passed." },
      disclaimer: DISCLAIMER,
    },
    steps,
  };
}

// ─── Build all 60 solutions ────────────────────────────────────────────────

const ALL_SOLUTIONS: SolutionDef[] = [];

for (const c of COUNTRIES) {
  ALL_SOLUTIONS.push(buildKybEssentials(c));
  ALL_SOLUTIONS.push(buildKybComplete(c));
  ALL_SOLUTIONS.push(buildInvoiceVerify(c));
}

// ─── Deprecation targets ───────────────────────────────────────────────────

const DEPRECATE_SLUGS = [
  "kyc-sweden",
  "kyc-norway",
  "kyc-denmark",
  "kyc-finland",
  "verify-us-company",
];

// ─── Seed logic ────────────────────────────────────────────────────────────

async function seed() {
  const db = getDb();

  // 1. Deprecate old solutions
  console.log("=== Deprecating old solutions ===");
  for (const slug of DEPRECATE_SLUGS) {
    const result = await db
      .update(solutions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(solutions.slug, slug))
      .returning({ slug: solutions.slug });
    if (result.length > 0) {
      console.log(`  Deprecated: ${slug}`);
    } else {
      console.log(`  Not found (skipping): ${slug}`);
    }
  }

  // 2. Verify all capability slugs exist
  const allCapSlugs = [
    ...new Set(ALL_SOLUTIONS.flatMap((s) => s.steps.map((st) => st.capabilitySlug))),
  ];
  const capRows = await db
    .select({ slug: capabilities.slug })
    .from(capabilities)
    .where(inArray(capabilities.slug, allCapSlugs));
  const existingSlugs = new Set(capRows.map((r) => r.slug));
  const missing = allCapSlugs.filter((s) => !existingSlugs.has(s));
  if (missing.length) {
    console.warn(`\nWARNING: Missing capabilities: ${missing.join(", ")}`);
  }

  // 3. Get current max displayOrder
  const [maxOrder] = await db
    .select({ max: solutions.displayOrder })
    .from(solutions);
  let displayOrder = (maxOrder?.max ?? 0) + 1;

  // 4. Seed solutions
  console.log("\n=== Seeding 60 solutions ===");
  let seeded = 0;
  let skipped = 0;

  for (const sol of ALL_SOLUTIONS) {
    // Check for missing capabilities
    const missingSlugs = sol.steps.filter(
      (st) => !existingSlugs.has(st.capabilitySlug),
    );
    if (missingSlugs.length) {
      console.warn(
        `  SKIP ${sol.slug} — missing: ${missingSlugs.map((s) => s.capabilitySlug).join(", ")}`,
      );
      skipped++;
      continue;
    }

    // Gate checks: validate solution before writing
    const gateViolations = await validateSolution(
      sol.slug,
      sol.inputSchema,
      sol.steps.map((s) => ({ capabilitySlug: s.capabilitySlug, stepOrder: s.stepOrder, inputMap: s.inputMap })),
    );
    enforceGates(gateViolations);

    await db.transaction(async (tx) => {
      // Upsert solution
      const [existing] = await tx
        .select({ id: solutions.id })
        .from(solutions)
        .where(eq(solutions.slug, sol.slug))
        .limit(1);

      let solutionId: string;

      if (existing) {
        await tx
          .update(solutions)
          .set({
            name: sol.name,
            description: sol.description,
            longDescription: sol.longDescription,
            agentDescription: sol.agentDescription,
            category: sol.category,
            priceCents: sol.priceCents,
            componentSumCents: sol.componentSumCents,
            valueTier: sol.valueTier,
            maintenanceLevel: sol.maintenanceLevel,
            geography: sol.geography,
            inputSchema: sol.inputSchema,
            exampleInput: sol.exampleInput,
            exampleOutput: sol.exampleOutput,
            targetAudience: sol.targetAudience,
            marketingName: sol.marketingName,
            transparencyTag: sol.transparencyTag,
            extendsWith: sol.extendsWith,
            isActive: true,
            displayOrder: displayOrder,
            updatedAt: new Date(),
          })
          .where(eq(solutions.id, existing.id));
        solutionId = existing.id;

        await tx
          .delete(solutionSteps)
          .where(eq(solutionSteps.solutionId, solutionId));
      } else {
        const [inserted] = await tx
          .insert(solutions)
          .values({
            slug: sol.slug,
            name: sol.name,
            description: sol.description,
            longDescription: sol.longDescription,
            agentDescription: sol.agentDescription,
            category: sol.category,
            priceCents: sol.priceCents,
            componentSumCents: sol.componentSumCents,
            valueTier: sol.valueTier,
            maintenanceLevel: sol.maintenanceLevel,
            geography: sol.geography,
            inputSchema: sol.inputSchema,
            exampleInput: sol.exampleInput,
            exampleOutput: sol.exampleOutput,
            targetAudience: sol.targetAudience,
            marketingName: sol.marketingName,
            transparencyTag: sol.transparencyTag,
            extendsWith: sol.extendsWith,
            displayOrder: displayOrder,
          })
          .returning({ id: solutions.id });
        solutionId = inserted.id;
      }

      // Insert steps
      await tx.insert(solutionSteps).values(
        sol.steps.map((step) => ({
          solutionId,
          capabilitySlug: step.capabilitySlug,
          stepOrder: step.stepOrder,
          canParallel: step.canParallel,
          parallelGroup: step.parallelGroup,
          inputMap: step.inputMap,
        })),
      );

      console.log(
        `  ${existing ? "UPDATED" : "INSERTED"} ${sol.slug} (${sol.steps.length} steps)`,
      );
    });

    seeded++;
    displayOrder++;
  }

  console.log(`\nDone: ${seeded} solutions seeded, ${skipped} skipped.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
