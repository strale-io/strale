import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { capabilities, solutions, solutionSteps } from "./schema.js";
import { eq, inArray } from "drizzle-orm";

// ─── Solution definitions ───────────────────────────────────────────────────

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
  category: string;
  priceCents: number;
  componentSumCents: number;
  valueTier: string;
  maintenanceLevel: string;
  geography: string;
  targetAudience: string;
  transparencyTag: string | null;
  inputSchema: Record<string, unknown>;
  exampleInput?: Record<string, unknown>;
  exampleOutput?: Record<string, unknown>;
  steps: SolutionStep[];
}

const SOLUTIONS: SolutionDef[] = [
  // ── 1. Nordic KYC — Sweden ──
  {
    slug: "kyc-sweden",
    name: "Nordic KYC — Sweden",
    marketingName: "Nordic KYC — Sweden",
    description:
      "Verifies a Swedish company's identity, validates their EU VAT number, and screens against international sanctions lists.",
    category: "compliance-verification",
    priceCents: 150,
    componentSumCents: 110,
    valueTier: "verification",
    maintenanceLevel: "very-low",
    geography: "nordic",
    targetAudience: "Klarna, Trustly, Tink, Pleo, Anyfin, Bits",
    transparencyTag: null,
    inputSchema: {
      type: "object",
      properties: {
        org_number: {
          type: "string",
          description: "Swedish organization number",
        },
      },
      required: ["org_number"],
    },
    exampleInput: { org_number: "559106-8089" },
    exampleOutput: {
      company_name: "Strale AB",
      vat_valid: true,
      vat_number: "SE5591068089",
      sanctions_clear: true,
      sanctions_checked_at: "2026-03-02T12:00:00Z",
    },
    steps: [
      {
        capabilitySlug: "swedish-company-data",
        stepOrder: 1,
        canParallel: false,
        parallelGroup: null,
        inputMap: { org_number: "$input.org_number" },
      },
      {
        capabilitySlug: "vat-validate",
        stepOrder: 2,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { vat_number: "$steps[0].vat_number" },
      },
      {
        capabilitySlug: "sanctions-check",
        stepOrder: 3,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { company_name: "$steps[0].company_name" },
      },
    ],
  },

  // ── 2. Nordic KYC — Norway ──
  {
    slug: "kyc-norway",
    name: "Nordic KYC — Norway",
    marketingName: "Nordic KYC — Norway",
    description:
      "Verifies a Norwegian company's identity, validates their EU VAT number, and screens against international sanctions lists.",
    category: "compliance-verification",
    priceCents: 150,
    componentSumCents: 110,
    valueTier: "verification",
    maintenanceLevel: "very-low",
    geography: "nordic",
    targetAudience: "DNB, Vipps, Cognite",
    transparencyTag: null,
    inputSchema: {
      type: "object",
      properties: {
        org_number: {
          type: "string",
          description: "Norwegian organization number",
        },
      },
      required: ["org_number"],
    },
    exampleInput: { org_number: "923609016" },
    steps: [
      {
        capabilitySlug: "norwegian-company-data",
        stepOrder: 1,
        canParallel: false,
        parallelGroup: null,
        inputMap: { org_number: "$input.org_number" },
      },
      {
        capabilitySlug: "vat-validate",
        stepOrder: 2,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { vat_number: "$steps[0].vat_number" },
      },
      {
        capabilitySlug: "sanctions-check",
        stepOrder: 3,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { company_name: "$steps[0].company_name" },
      },
    ],
  },

  // ── 3. Nordic KYC — Denmark ──
  {
    slug: "kyc-denmark",
    name: "Nordic KYC — Denmark",
    marketingName: "Nordic KYC — Denmark",
    description:
      "Verifies a Danish company's identity, validates their EU VAT number, and screens against international sanctions lists.",
    category: "compliance-verification",
    priceCents: 150,
    componentSumCents: 110,
    valueTier: "verification",
    maintenanceLevel: "very-low",
    geography: "nordic",
    targetAudience: "Pleo, Lunar, Trustpilot",
    transparencyTag: null,
    inputSchema: {
      type: "object",
      properties: {
        cvr_number: { type: "string", description: "Danish CVR number" },
      },
      required: ["cvr_number"],
    },
    exampleInput: { cvr_number: "37582070" },
    steps: [
      {
        capabilitySlug: "danish-company-data",
        stepOrder: 1,
        canParallel: false,
        parallelGroup: null,
        inputMap: { cvr_number: "$input.cvr_number" },
      },
      {
        capabilitySlug: "vat-validate",
        stepOrder: 2,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { vat_number: "$steps[0].vat_number" },
      },
      {
        capabilitySlug: "sanctions-check",
        stepOrder: 3,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { company_name: "$steps[0].company_name" },
      },
    ],
  },

  // ── 4. Nordic KYC — Finland ──
  {
    slug: "kyc-finland",
    name: "Nordic KYC — Finland",
    marketingName: "Nordic KYC — Finland",
    description:
      "Verifies a Finnish company's identity, validates their EU VAT number, and screens against international sanctions lists.",
    category: "compliance-verification",
    priceCents: 150,
    componentSumCents: 110,
    valueTier: "verification",
    maintenanceLevel: "very-low",
    geography: "nordic",
    targetAudience: "Wolt, Supercell, Smartly.io",
    transparencyTag: null,
    inputSchema: {
      type: "object",
      properties: {
        business_id: {
          type: "string",
          description: "Finnish business ID (Y-tunnus)",
        },
      },
      required: ["business_id"],
    },
    exampleInput: { business_id: "2878743-7" },
    steps: [
      {
        capabilitySlug: "finnish-company-data",
        stepOrder: 1,
        canParallel: false,
        parallelGroup: null,
        inputMap: { business_id: "$input.business_id" },
      },
      {
        capabilitySlug: "vat-validate",
        stepOrder: 2,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { vat_number: "$steps[0].vat_number" },
      },
      {
        capabilitySlug: "sanctions-check",
        stepOrder: 3,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { company_name: "$steps[0].company_name" },
      },
    ],
  },

  // ── 5. B2B Payment Validation ──
  {
    slug: "payment-validate",
    name: "B2B Payment Validation",
    marketingName: "B2B Payment Validation",
    description:
      "Validates both sides of a B2B payment: IBAN structure, receiving bank identification, counterparty VAT.",
    category: "finance-banking",
    priceCents: 30,
    componentSumCents: 20,
    valueTier: "verification",
    maintenanceLevel: "near-zero",
    geography: "eu",
    targetAudience: "Trustly, Klarna, Tink, Pleo",
    transparencyTag: null,
    inputSchema: {
      type: "object",
      properties: {
        iban: { type: "string" },
        vat_number: { type: "string" },
      },
      required: ["iban", "vat_number"],
    },
    exampleInput: {
      iban: "DE89370400440532013000",
      vat_number: "DE136695976",
    },
    steps: [
      {
        capabilitySlug: "iban-validate",
        stepOrder: 1,
        canParallel: false,
        parallelGroup: null,
        inputMap: { iban: "$input.iban" },
      },
      {
        capabilitySlug: "bank-bic-lookup",
        stepOrder: 2,
        canParallel: false,
        parallelGroup: null,
        inputMap: {
          bank_code: "$steps[0].bank_code",
          country_code: "$steps[0].country_code",
        },
      },
      {
        capabilitySlug: "vat-validate",
        stepOrder: 3,
        canParallel: false,
        parallelGroup: null,
        inputMap: { vat_number: "$input.vat_number" },
      },
    ],
  },

  // ── 6. SEPA Payment Readiness ──
  {
    slug: "sepa-readiness",
    name: "SEPA Payment Readiness",
    marketingName: "SEPA Payment Readiness Check",
    description:
      "Everything needed before a SEPA transfer: IBAN, bank ID, counterparty VAT, and exchange rate if source isn't EUR.",
    category: "finance-banking",
    priceCents: 35,
    componentSumCents: 22,
    valueTier: "data-lookup",
    maintenanceLevel: "near-zero",
    geography: "eu",
    targetAudience: "Trustly, Klarna, Tink",
    transparencyTag: null,
    inputSchema: {
      type: "object",
      properties: {
        iban: { type: "string" },
        vat_number: { type: "string" },
        source_currency: {
          type: "string",
          description: "ISO 4217 currency code, omit if EUR",
        },
      },
      required: ["iban", "vat_number"],
    },
    exampleInput: {
      iban: "DE89370400440532013000",
      vat_number: "DE136695976",
      source_currency: "SEK",
    },
    steps: [
      {
        capabilitySlug: "iban-validate",
        stepOrder: 1,
        canParallel: false,
        parallelGroup: null,
        inputMap: { iban: "$input.iban" },
      },
      {
        capabilitySlug: "bank-bic-lookup",
        stepOrder: 2,
        canParallel: false,
        parallelGroup: null,
        inputMap: {
          bank_code: "$steps[0].bank_code",
          country_code: "$steps[0].country_code",
        },
      },
      {
        capabilitySlug: "vat-validate",
        stepOrder: 3,
        canParallel: false,
        parallelGroup: null,
        inputMap: { vat_number: "$input.vat_number" },
      },
      {
        capabilitySlug: "exchange-rate",
        stepOrder: 4,
        canParallel: false,
        parallelGroup: null,
        inputMap: { from: "$input.source_currency", to: "EUR" },
      },
    ],
  },

  // ── 7. Lead Email Verify ──
  {
    slug: "lead-email-verify",
    name: "Lead Email Verify",
    marketingName: "Lead Email Verification",
    description:
      "The #1 thing outbound sales agents do at scale: verify an email is real before sending. Catches bad addresses before they tank your deliverability score.",
    category: "sales-outreach",
    priceCents: 20,
    componentSumCents: 11,
    valueTier: "data-lookup",
    maintenanceLevel: "near-zero",
    geography: "us-global",
    targetAudience:
      "US developers building SDR agents, outbound sales bots, lead gen pipelines",
    transparencyTag: null,
    inputSchema: {
      type: "object",
      properties: { email: { type: "string", format: "email" } },
      required: ["email"],
    },
    exampleInput: { email: "jane@acmecorp.com" },
    exampleOutput: {
      valid: true,
      domain: "acmecorp.com",
      has_mx: true,
      is_disposable: false,
      reputation_score: 87,
    },
    steps: [
      {
        capabilitySlug: "email-validate",
        stepOrder: 1,
        canParallel: false,
        parallelGroup: null,
        inputMap: { email: "$input.email" },
      },
      {
        capabilitySlug: "dns-lookup",
        stepOrder: 2,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { domain: "$steps[0].domain" },
      },
      {
        capabilitySlug: "domain-reputation",
        stepOrder: 3,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { domain: "$steps[0].domain" },
      },
    ],
  },

  // ── 8. US Company Verify ──
  {
    slug: "verify-us-company",
    name: "US Company Verify",
    marketingName: "US Company Verification",
    description:
      "SEC EDGAR data + sanctions screening for US companies. Same concept as Nordic KYC for the US market.",
    category: "compliance-verification",
    priceCents: 130,
    componentSumCents: 100,
    valueTier: "verification",
    maintenanceLevel: "very-low",
    geography: "us",
    targetAudience:
      "US developers doing vendor/partner onboarding, compliance teams",
    transparencyTag: null,
    inputSchema: {
      type: "object",
      properties: {
        company: {
          type: "string",
          description: "CIK number, ticker symbol, or company name",
        },
      },
      required: ["company"],
    },
    exampleInput: { company: "AAPL" },
    exampleOutput: {
      company_name: "Apple Inc.",
      cik: "0000320193",
      state: "CA",
      sanctions_clear: true,
    },
    steps: [
      {
        capabilitySlug: "us-company-data",
        stepOrder: 1,
        canParallel: false,
        parallelGroup: null,
        inputMap: { company: "$input.company" },
      },
      {
        capabilitySlug: "sanctions-check",
        stepOrder: 2,
        canParallel: false,
        parallelGroup: null,
        inputMap: { company_name: "$steps[0].company_name" },
      },
    ],
  },

  // ── 9. Domain Intelligence ──
  {
    slug: "domain-intel",
    name: "Domain Intelligence",
    marketingName: "Domain Intelligence Report",
    description:
      "Full profile of any domain: registration, infrastructure, SSL health, reputation score. All protocol-level, geography-agnostic.",
    category: "security-risk",
    priceCents: 35,
    componentSumCents: 21,
    valueTier: "data-lookup",
    maintenanceLevel: "near-zero",
    geography: "global",
    targetAudience:
      "Any developer — vendor assessment, lead qualification, security monitoring",
    transparencyTag: null,
    inputSchema: {
      type: "object",
      properties: { domain: { type: "string" } },
      required: ["domain"],
    },
    exampleInput: { domain: "acmecorp.com" },
    steps: [
      {
        capabilitySlug: "whois-lookup",
        stepOrder: 1,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { domain: "$input.domain" },
      },
      {
        capabilitySlug: "dns-lookup",
        stepOrder: 2,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { domain: "$input.domain" },
      },
      {
        capabilitySlug: "ssl-check",
        stepOrder: 3,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { domain: "$input.domain" },
      },
      {
        capabilitySlug: "domain-reputation",
        stepOrder: 4,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { domain: "$input.domain" },
      },
    ],
  },

  // ── 10. Web Extract & Clean ──
  {
    slug: "web-extract-clean",
    name: "Web Extract & Clean",
    marketingName: "Web Extract & Clean",
    description:
      "Fetch a page, convert to clean markdown, strip out PII before storing. Every RAG pipeline needs this.",
    category: "data-research",
    priceCents: 30,
    componentSumCents: 20,
    valueTier: "data-lookup",
    maintenanceLevel: "low",
    geography: "global",
    targetAudience:
      "Any developer building research agents, RAG pipelines, content ingestion",
    transparencyTag: "ai_generated",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string", format: "uri" } },
      required: ["url"],
    },
    exampleInput: { url: "https://example.com/about" },
    exampleOutput: {
      markdown: "# About Us\n...",
      pii_redacted: 3,
      word_count: 847,
    },
    steps: [
      {
        capabilitySlug: "url-to-markdown",
        stepOrder: 1,
        canParallel: false,
        parallelGroup: null,
        inputMap: { url: "$input.url" },
      },
      {
        capabilitySlug: "pii-redact",
        stepOrder: 2,
        canParallel: false,
        parallelGroup: null,
        inputMap: { text: "$steps[0].markdown" },
      },
    ],
  },

  // ── 11. Email Deliverability Audit ──
  {
    slug: "email-audit",
    name: "Email Deliverability Audit",
    marketingName: "Email Deliverability Audit",
    description:
      "Checks everything that determines inbox placement: SPF, DKIM, DMARC, MX config, blacklists.",
    category: "security-risk",
    priceCents: 25,
    componentSumCents: 16,
    valueTier: "verification",
    maintenanceLevel: "near-zero",
    geography: "global",
    targetAudience: "Any company sending email",
    transparencyTag: null,
    inputSchema: {
      type: "object",
      properties: { domain: { type: "string" } },
      required: ["domain"],
    },
    exampleInput: { domain: "acmecorp.com" },
    steps: [
      {
        capabilitySlug: "email-deliverability-check",
        stepOrder: 1,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { domain: "$input.domain" },
      },
      {
        capabilitySlug: "dns-lookup",
        stepOrder: 2,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { domain: "$input.domain" },
      },
      {
        capabilitySlug: "ssl-check",
        stepOrder: 3,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { domain: "$input.domain" },
      },
    ],
  },

  // ── 12. Website Health Check ──
  {
    slug: "website-health",
    name: "Website Health Check",
    marketingName: "Website Health Check",
    description:
      "Technical health assessment: full SSL chain, email config, page performance.",
    category: "security-risk",
    priceCents: 40,
    componentSumCents: 25,
    valueTier: "data-lookup",
    maintenanceLevel: "low",
    geography: "global",
    targetAudience: "Ops teams, B2B SaaS, security monitoring",
    transparencyTag: null,
    inputSchema: {
      type: "object",
      properties: { domain: { type: "string" } },
      required: ["domain"],
    },
    exampleInput: { domain: "acmecorp.com" },
    steps: [
      {
        capabilitySlug: "ssl-certificate-chain",
        stepOrder: 1,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { domain: "$input.domain" },
      },
      {
        capabilitySlug: "email-deliverability-check",
        stepOrder: 2,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { domain: "$input.domain" },
      },
      {
        capabilitySlug: "page-speed-test",
        stepOrder: 3,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { url: "$input.domain" },
      },
    ],
  },

  // ── 13. EU AI Act Risk Assessment ──
  {
    slug: "ai-act-assess",
    name: "EU AI Act Risk Assessment",
    marketingName: "EU AI Act Risk Assessment",
    description:
      "Classifies an AI system's risk level under the EU AI Act, identifies the supervisory authority, and checks for prior enforcement history.",
    category: "legal-regulatory",
    priceCents: 80,
    componentSumCents: 45,
    valueTier: "compliance",
    maintenanceLevel: "low",
    geography: "eu",
    targetAudience:
      "Kry/Livi, Spotify, any Stockholm AI startup. August 2026 enforcement deadline.",
    transparencyTag: "ai_generated",
    inputSchema: {
      type: "object",
      properties: {
        ai_system_description: {
          type: "string",
          description: "Describe what your AI system does",
        },
        deployment_country: {
          type: "string",
          description: "ISO 3166-1 alpha-2 country code",
        },
        company_name: { type: "string" },
      },
      required: ["ai_system_description", "deployment_country"],
    },
    exampleInput: {
      ai_system_description:
        "AI system that triages patient symptoms and recommends urgency level for GP appointments",
      deployment_country: "SE",
      company_name: "Kry",
    },
    exampleOutput: {
      risk_level: "high",
      category: "Access to essential services",
      obligations: [
        "Conformity assessment",
        "Risk management system",
        "Data governance",
      ],
      supervisory_authority: { name: "IMY", country: "SE" },
      prior_enforcement: [],
    },
    steps: [
      {
        capabilitySlug: "eu-ai-act-classify",
        stepOrder: 1,
        canParallel: false,
        parallelGroup: null,
        inputMap: {
          ai_system_description: "$input.ai_system_description",
        },
      },
      {
        capabilitySlug: "data-protection-authority-lookup",
        stepOrder: 2,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { country_code: "$input.deployment_country" },
      },
      {
        capabilitySlug: "gdpr-fine-lookup",
        stepOrder: 3,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { company_name: "$input.company_name" },
      },
    ],
  },

  // ── 14. Website GDPR Audit ──
  {
    slug: "gdpr-audit",
    name: "Website GDPR Audit",
    marketingName: "Website GDPR Compliance Audit",
    description:
      "Comprehensive GDPR assessment: cookie consent, tracking scripts, privacy policy quality, SSL security, and the responsible data protection authority.",
    category: "legal-regulatory",
    priceCents: 100,
    componentSumCents: 63,
    valueTier: "compliance",
    maintenanceLevel: "low-medium",
    geography: "eu-global",
    targetAudience:
      "Sinch, Spotify, Kry, any EU SaaS assessing vendor/partner compliance",
    transparencyTag: "mixed",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", format: "uri" },
        country_code: {
          type: "string",
          description: "ISO 3166-1 alpha-2 (for DPA lookup)",
        },
      },
      required: ["url"],
    },
    exampleInput: { url: "https://example.com", country_code: "SE" },
    exampleOutput: {
      gdpr_score: 72,
      grade: "B",
      has_cookie_consent: true,
      tracking_scripts: { google_analytics: true },
      privacy_policy: { data_retention_mentioned: true, dpo_listed: false },
      ssl_valid: true,
      supervisory_authority: { name: "IMY" },
    },
    steps: [
      {
        capabilitySlug: "gdpr-website-check",
        stepOrder: 1,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { url: "$input.url" },
      },
      {
        capabilitySlug: "cookie-scan",
        stepOrder: 2,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { url: "$input.url" },
      },
      {
        capabilitySlug: "privacy-policy-analyze",
        stepOrder: 3,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { url: "$input.url" },
      },
      {
        capabilitySlug: "ssl-check",
        stepOrder: 4,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { domain: "$input.url" },
      },
      {
        capabilitySlug: "data-protection-authority-lookup",
        stepOrder: 5,
        canParallel: true,
        parallelGroup: 2,
        inputMap: { country_code: "$input.country_code" },
      },
    ],
  },

  // ── 15. Competitive Intelligence Snapshot ──
  {
    slug: "competitor-snapshot",
    name: "Competitive Intelligence Snapshot",
    marketingName: "Competitive Intelligence Snapshot",
    description:
      "Quick multi-dimensional read on a competitor: technology stack, SEO health, landing page conversion analysis, and social media presence check.",
    category: "data-research",
    priceCents: 140,
    componentSumCents: 110,
    valueTier: "compliance",
    maintenanceLevel: "low",
    geography: "global",
    targetAudience:
      "Any growth-stage startup — fundraising prep, GTM positioning, market research",
    transparencyTag: "mixed",
    inputSchema: {
      type: "object",
      properties: {
        competitor_url: { type: "string", format: "uri" },
        brand_handle: {
          type: "string",
          description: "Social media handle (optional)",
        },
      },
      required: ["competitor_url"],
    },
    exampleInput: {
      competitor_url: "https://competitor.com",
      brand_handle: "competitor",
    },
    exampleOutput: {
      tech_stack: { frontend: "Next.js", hosting: "Vercel" },
      seo: { score: 78, issues: [] },
      landing_page: { score: 65, strengths: [], weaknesses: [] },
      social: { github: true, twitter: true, linkedin: true },
    },
    steps: [
      {
        capabilitySlug: "tech-stack-detect",
        stepOrder: 1,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { url: "$input.competitor_url" },
      },
      {
        capabilitySlug: "seo-audit",
        stepOrder: 2,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { url: "$input.competitor_url" },
      },
      {
        capabilitySlug: "landing-page-roast",
        stepOrder: 3,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { url: "$input.competitor_url" },
      },
      {
        capabilitySlug: "social-profile-check",
        stepOrder: 4,
        canParallel: true,
        parallelGroup: 2,
        inputMap: { handle: "$input.brand_handle" },
      },
    ],
  },
];

// ─── Seed logic ─────────────────────────────────────────────────────────────

async function seed() {
  const db = getDb();

  // Collect all capability slugs referenced by solutions
  const allSlugs = [
    ...new Set(SOLUTIONS.flatMap((s) => s.steps.map((st) => st.capabilitySlug))),
  ];

  // Verify they exist in the database
  const capRows = await db
    .select({ slug: capabilities.slug })
    .from(capabilities)
    .where(inArray(capabilities.slug, allSlugs));
  const existingSlugs = new Set(capRows.map((r) => r.slug));
  const missing = allSlugs.filter((s) => !existingSlugs.has(s));
  if (missing.length) {
    console.warn(`WARNING: Missing capabilities: ${missing.join(", ")}`);
  }

  let seeded = 0;
  let skipped = 0;

  for (const sol of SOLUTIONS) {
    // Check if any step references a missing capability
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

    await db.transaction(async (tx) => {
      // Upsert solution
      const [existing] = await tx
        .select({ id: solutions.id })
        .from(solutions)
        .where(eq(solutions.slug, sol.slug))
        .limit(1);

      let solutionId: string;

      if (existing) {
        // Update existing
        await tx
          .update(solutions)
          .set({
            name: sol.name,
            description: sol.description,
            category: sol.category,
            priceCents: sol.priceCents,
            componentSumCents: sol.componentSumCents,
            valueTier: sol.valueTier,
            maintenanceLevel: sol.maintenanceLevel,
            geography: sol.geography,
            inputSchema: sol.inputSchema,
            exampleInput: sol.exampleInput ?? null,
            exampleOutput: sol.exampleOutput ?? null,
            targetAudience: sol.targetAudience,
            marketingName: sol.marketingName,
            transparencyTag: sol.transparencyTag,
            displayOrder: seeded,
            updatedAt: new Date(),
          })
          .where(eq(solutions.id, existing.id));
        solutionId = existing.id;

        // Delete old steps
        await tx
          .delete(solutionSteps)
          .where(eq(solutionSteps.solutionId, solutionId));
      } else {
        // Insert new
        const [inserted] = await tx
          .insert(solutions)
          .values({
            slug: sol.slug,
            name: sol.name,
            description: sol.description,
            category: sol.category,
            priceCents: sol.priceCents,
            componentSumCents: sol.componentSumCents,
            valueTier: sol.valueTier,
            maintenanceLevel: sol.maintenanceLevel,
            geography: sol.geography,
            inputSchema: sol.inputSchema,
            exampleInput: sol.exampleInput ?? null,
            exampleOutput: sol.exampleOutput ?? null,
            targetAudience: sol.targetAudience,
            marketingName: sol.marketingName,
            transparencyTag: sol.transparencyTag,
            displayOrder: seeded,
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
  }

  console.log(
    `\nDone: ${seeded} solutions seeded, ${skipped} skipped.`,
  );
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
