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
  extendsWith: string[];
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
      "Check if a Swedish company is real and safe to do business with. Official registry data, VAT validation, and sanctions screening in one call.",
    category: "compliance-verification",
    priceCents: 150,
    componentSumCents: 110,
    valueTier: "verification",
    maintenanceLevel: "very-low",
    geography: "nordic",
    targetAudience: "Klarna, Trustly, Tink, Pleo, Anyfin, Bits",
    transparencyTag: "mixed",
    extendsWith: ["credit-report-summary", "annual-report-extract", "company-enrich"],
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
    exampleInput: { org_number: "556703-7485" },
    exampleOutput: {
      company_name: "Spotify AB",
      org_number: "556703-7485",
      vat_valid: true,
      vat_number: "SE556703748501",
      is_sanctioned: false,
      match_count: 0,
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
        inputMap: { name: "$steps[0].company_name" },
      },
    ],
  },

  // ── 2. Nordic KYC — Norway ──
  {
    slug: "kyc-norway",
    name: "Nordic KYC — Norway",
    marketingName: "Nordic KYC — Norway",
    description:
      "Check if a Norwegian company is real and safe to do business with. Official registry data, VAT validation, and sanctions screening in one call.",
    category: "compliance-verification",
    priceCents: 150,
    componentSumCents: 110,
    valueTier: "verification",
    maintenanceLevel: "very-low",
    geography: "nordic",
    targetAudience: "DNB, Vipps, Cognite",
    transparencyTag: "mixed",
    extendsWith: ["credit-report-summary", "annual-report-extract", "company-enrich"],
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
    exampleOutput: {
      company_name: "EQUINOR ASA",
      org_number: "923609016",
      vat_valid: true,
      vat_number: "NO923609016MVA",
      is_sanctioned: false,
      match_count: 0,
    },
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
        inputMap: { name: "$steps[0].company_name" },
      },
    ],
  },

  // ── 3. Nordic KYC — Denmark ──
  {
    slug: "kyc-denmark",
    name: "Nordic KYC — Denmark",
    marketingName: "Nordic KYC — Denmark",
    description:
      "Check if a Danish company is real and safe to do business with. Official registry data, VAT validation, and sanctions screening in one call.",
    category: "compliance-verification",
    priceCents: 150,
    componentSumCents: 110,
    valueTier: "verification",
    maintenanceLevel: "very-low",
    geography: "nordic",
    targetAudience: "Pleo, Lunar, Trustpilot",
    transparencyTag: "mixed",
    extendsWith: ["credit-report-summary", "annual-report-extract", "company-enrich"],
    inputSchema: {
      type: "object",
      properties: {
        cvr_number: { type: "string", description: "Danish CVR number" },
      },
      required: ["cvr_number"],
    },
    exampleInput: { cvr_number: "47458714" },
    exampleOutput: {
      company_name: "LEGO System A/S",
      cvr_number: "47458714",
      vat_valid: true,
      vat_number: "DK47458714",
      is_sanctioned: false,
      match_count: 0,
    },
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
        inputMap: { name: "$steps[0].company_name" },
      },
    ],
  },

  // ── 4. Nordic KYC — Finland ──
  {
    slug: "kyc-finland",
    name: "Nordic KYC — Finland",
    marketingName: "Nordic KYC — Finland",
    description:
      "Check if a Finnish company is real and safe to do business with. Official registry data, VAT validation, and sanctions screening in one call.",
    category: "compliance-verification",
    priceCents: 150,
    componentSumCents: 110,
    valueTier: "verification",
    maintenanceLevel: "very-low",
    geography: "nordic",
    targetAudience: "Wolt, Supercell, Smartly.io",
    transparencyTag: "mixed",
    extendsWith: ["credit-report-summary", "annual-report-extract", "company-enrich"],
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
    exampleInput: { business_id: "0112038-9" },
    exampleOutput: {
      company_name: "Nokia Oyj",
      business_id: "0112038-9",
      vat_valid: true,
      vat_number: "FI01120389",
      is_sanctioned: false,
      match_count: 0,
    },
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
        inputMap: { name: "$steps[0].company_name" },
      },
    ],
  },

  // ── 5. B2B Payment Validation ──
  {
    slug: "payment-validate",
    name: "B2B Payment Validation",
    marketingName: "B2B Payment Validation",
    description:
      "Verify bank details and tax IDs before your agent processes a payment. Validates IBAN structure, identifies the receiving bank, and confirms counterparty VAT registration.",
    category: "finance-banking",
    priceCents: 25,
    componentSumCents: 15,
    valueTier: "verification",
    maintenanceLevel: "near-zero",
    geography: "eu",
    targetAudience: "Trustly, Klarna, Tink, Pleo",
    transparencyTag: "algorithmic",
    extendsWith: ["exchange-rate", "sanctions-check", "company-enrich"],
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
    exampleOutput: {
      iban_valid: true,
      country_code: "DE",
      bank_code: "37040044",
      vat_valid: true,
      vat_company_name: "SAP SE",
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
        capabilitySlug: "vat-validate",
        stepOrder: 2,
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
      "Everything your agent needs before initiating a SEPA transfer: IBAN validation, bank identification, VAT verification, and current exchange rate. One call replaces four separate integrations.",
    category: "finance-banking",
    priceCents: 30,
    componentSumCents: 17,
    valueTier: "data-lookup",
    maintenanceLevel: "near-zero",
    geography: "eu",
    targetAudience: "Trustly, Klarna, Tink",
    transparencyTag: "algorithmic",
    extendsWith: ["sanctions-check", "bank-bic-lookup", "company-enrich"],
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
    exampleOutput: {
      iban_valid: true,
      country_code: "DE",
      bank_code: "37040044",
      vat_valid: true,
      vat_company_name: "SAP SE",
      exchange_rate: 0.0936,
      exchange_rate_date: "2026-03-05",
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
        capabilitySlug: "vat-validate",
        stepOrder: 2,
        canParallel: false,
        parallelGroup: null,
        inputMap: { vat_number: "$input.vat_number" },
      },
      {
        capabilitySlug: "exchange-rate",
        stepOrder: 3,
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
      "Your agent found a prospect's email — is it real? Check deliverability, DNS configuration, and domain reputation in one call. Catches disposable addresses and suspicious domains before outreach.",
    category: "sales-outreach",
    priceCents: 20,
    componentSumCents: 11,
    valueTier: "data-lookup",
    maintenanceLevel: "near-zero",
    geography: "us-global",
    targetAudience:
      "US developers building SDR agents, outbound sales bots, lead gen pipelines",
    transparencyTag: "algorithmic",
    extendsWith: ["company-enrich", "social-profile-check", "whois-lookup"],
    inputSchema: {
      type: "object",
      properties: { email: { type: "string", format: "email" } },
      required: ["email"],
    },
    exampleInput: { email: "test@google.com" },
    exampleOutput: {
      valid: true,
      domain: "google.com",
      has_mx: true,
      is_disposable: false,
      reputation_score: 92,
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
      "Look up any US company using SEC EDGAR data and screen against international sanctions lists. Official filing data, company status, and a clean sanctions check.",
    category: "compliance-verification",
    priceCents: 130,
    componentSumCents: 100,
    valueTier: "verification",
    maintenanceLevel: "very-low",
    geography: "us",
    targetAudience:
      "US developers doing vendor/partner onboarding, compliance teams",
    transparencyTag: "ai_generated",
    extendsWith: ["domain-reputation", "social-profile-check", "credit-report-summary"],
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
      is_sanctioned: false,
      match_count: 0,
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
        inputMap: { name: "$steps[0].company_name" },
      },
    ],
  },

  // ── 9. Domain Intelligence ──
  {
    slug: "domain-intel",
    name: "Domain Intelligence",
    marketingName: "Domain Intelligence Report",
    description:
      "Everything your agent needs to evaluate a domain: who registered it, when, DNS setup, SSL certificate health, and reputation score.",
    category: "security-risk",
    priceCents: 35,
    componentSumCents: 21,
    valueTier: "data-lookup",
    maintenanceLevel: "near-zero",
    geography: "global",
    targetAudience:
      "Any developer — vendor assessment, lead qualification, security monitoring",
    transparencyTag: "algorithmic",
    extendsWith: ["tech-stack-detect", "page-speed-test", "backlink-check"],
    inputSchema: {
      type: "object",
      properties: { domain: { type: "string" } },
      required: ["domain"],
    },
    exampleInput: { domain: "google.com" },
    exampleOutput: {
      registrar: "MarkMonitor Inc.",
      ssl_valid: true,
      dns_records: true,
      reputation_score: 95,
    },
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
      "Fetch any web page — even JavaScript-heavy ones behind anti-bot walls — convert to clean markdown, and strip PII automatically. Ready for your RAG pipeline.",
    category: "data-research",
    priceCents: 30,
    componentSumCents: 20,
    valueTier: "data-lookup",
    maintenanceLevel: "low",
    geography: "global",
    targetAudience:
      "Any developer building research agents, RAG pipelines, content ingestion",
    transparencyTag: "mixed",
    extendsWith: ["structured-scrape", "translate", "summarize"],
    inputSchema: {
      type: "object",
      properties: { url: { type: "string", format: "uri" } },
      required: ["url"],
    },
    exampleInput: { url: "https://example.com" },
    exampleOutput: {
      markdown: "# Example Domain\n\nThis domain is for use in illustrative examples...",
      pii_redacted: 0,
      word_count: 58,
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
      "Will emails to this domain actually arrive? Checks SPF, DKIM, DMARC, MX records, SSL, and blacklist status — the complete deliverability audit.",
    category: "security-risk",
    priceCents: 25,
    componentSumCents: 16,
    valueTier: "verification",
    maintenanceLevel: "near-zero",
    geography: "global",
    targetAudience: "Any company sending email",
    transparencyTag: "algorithmic",
    extendsWith: ["domain-reputation", "whois-lookup", "tech-stack-detect"],
    inputSchema: {
      type: "object",
      properties: { domain: { type: "string" } },
      required: ["domain"],
    },
    exampleInput: { domain: "google.com" },
    exampleOutput: {
      score: 95,
      grade: "A",
      spf: "pass",
      dmarc: "pass",
      ssl_valid: true,
    },
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
      "Quick technical health check on any website: SSL certificate chain, email deliverability configuration, and page load performance.",
    category: "security-risk",
    priceCents: 40,
    componentSumCents: 25,
    valueTier: "data-lookup",
    maintenanceLevel: "low",
    geography: "global",
    targetAudience: "Ops teams, B2B SaaS, security monitoring",
    transparencyTag: "algorithmic",
    extendsWith: ["dns-lookup", "whois-lookup", "domain-reputation"],
    inputSchema: {
      type: "object",
      properties: { domain: { type: "string" } },
      required: ["domain"],
    },
    exampleInput: { domain: "google.com" },
    exampleOutput: {
      certificate_chain: [{ subject: "*.google.com", issuer: "GTS CA 1C3" }],
      email_score: 95,
      performance_score: 92,
    },
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
      "Classify your AI system's risk level under the EU AI Act before the August 2026 enforcement deadline. Returns risk classification, matched articles, obligations, and supervisory authority.",
    category: "legal-regulatory",
    priceCents: 80,
    componentSumCents: 45,
    valueTier: "compliance",
    maintenanceLevel: "low",
    geography: "eu",
    targetAudience:
      "Kry/Livi, Spotify, any Stockholm AI startup. August 2026 enforcement deadline.",
    transparencyTag: "mixed",
    extendsWith: ["gdpr-website-check", "privacy-policy-analyze", "cookie-scan"],
    inputSchema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Describe what your AI system does",
        },
        deployment_country: {
          type: "string",
          description: "ISO 3166-1 alpha-2 country code",
        },
        company: { type: "string" },
      },
      required: ["description", "deployment_country"],
    },
    exampleInput: {
      description:
        "AI system that triages patient symptoms and recommends urgency level for GP appointments",
      deployment_country: "SE",
      company: "Kry",
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
          description: "$input.description",
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
        inputMap: { company: "$input.company" },
      },
    ],
  },

  // ── 14. Website GDPR Audit ──
  {
    slug: "gdpr-audit",
    name: "Website GDPR Audit",
    marketingName: "Website GDPR Compliance Audit",
    description:
      "Is this website GDPR compliant? Scans cookies, consent mechanisms, privacy policy, SSL, and identifies the relevant data protection authority.",
    category: "legal-regulatory",
    priceCents: 100,
    componentSumCents: 63,
    valueTier: "compliance",
    maintenanceLevel: "low-medium",
    geography: "eu-global",
    targetAudience:
      "Sinch, Spotify, Kry, any EU SaaS assessing vendor/partner compliance",
    transparencyTag: "mixed",
    extendsWith: ["tech-stack-detect", "domain-reputation", "dns-lookup"],
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
    exampleInput: { url: "https://google.com", country_code: "SE" },
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
      "Tech stack, SEO, landing page analysis, social presence — the competitive read your agent can run in seconds.",
    category: "data-research",
    priceCents: 140,
    componentSumCents: 110,
    valueTier: "compliance",
    maintenanceLevel: "low",
    geography: "global",
    targetAudience:
      "Any growth-stage startup — fundraising prep, GTM positioning, market research",
    transparencyTag: "mixed",
    extendsWith: ["page-speed-test", "backlink-check", "domain-reputation"],
    inputSchema: {
      type: "object",
      properties: {
        competitor_url: { type: "string", format: "uri" },
        brand_username: {
          type: "string",
          description: "Social media username (optional)",
        },
      },
      required: ["competitor_url"],
    },
    exampleInput: {
      competitor_url: "https://stripe.com",
      brand_username: "stripe",
    },
    exampleOutput: {
      tech_stack: { frontend: "React", hosting: "AWS" },
      seo: { overall_score: 82, issues: [] },
      landing_page: { overall_score: 78, strengths: [], weaknesses: [] },
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
        inputMap: { username: "$input.brand_username" },
      },
    ],
  },
  // ── 16. Vendor Risk Assessment ──
  {
    slug: "vendor-risk-assess",
    name: "Vendor Risk Assessment",
    marketingName: "Vendor Risk Assessment",
    description:
      "SEC EDGAR data, sanctions screening, and comprehensive domain security posture. Given a company name/CIK and domain, answers \"should we do business with this company?\"",
    category: "security-risk",
    priceCents: 180,
    componentSumCents: 129,
    valueTier: "verification",
    maintenanceLevel: "very-low",
    geography: "us-global",
    targetAudience:
      "US developers building procurement agents, vendor management, partnership due diligence",
    transparencyTag: "mixed",
    extendsWith: ["credit-report-summary", "company-enrich", "tech-stack-detect"],
    inputSchema: {
      type: "object",
      properties: {
        company: {
          type: "string",
          description: "Company name, CIK, or ticker",
        },
        domain: {
          type: "string",
          description: "Company domain to assess",
        },
      },
      required: ["company", "domain"],
    },
    exampleInput: { company: "Apple Inc", domain: "apple.com" },
    exampleOutput: {
      company_name: "Apple Inc.",
      cik: "0000320193",
      is_sanctioned: false,
      domain_reputation_score: 95,
      ssl_valid: true,
      header_security_grade: "A",
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
        canParallel: true,
        parallelGroup: 2,
        inputMap: { name: "$steps[0].company_name" },
      },
      {
        capabilitySlug: "whois-lookup",
        stepOrder: 3,
        canParallel: true,
        parallelGroup: 2,
        inputMap: { domain: "$input.domain" },
      },
      {
        capabilitySlug: "dns-lookup",
        stepOrder: 4,
        canParallel: true,
        parallelGroup: 2,
        inputMap: { domain: "$input.domain" },
      },
      {
        capabilitySlug: "ssl-check",
        stepOrder: 5,
        canParallel: true,
        parallelGroup: 2,
        inputMap: { domain: "$input.domain" },
      },
      {
        capabilitySlug: "domain-reputation",
        stepOrder: 6,
        canParallel: true,
        parallelGroup: 2,
        inputMap: { domain: "$input.domain" },
      },
      {
        capabilitySlug: "header-security-check",
        stepOrder: 7,
        canParallel: true,
        parallelGroup: 2,
        inputMap: { url: "$input.domain" },
      },
    ],
  },

  // ── 17. Lead Enrichment & Qualification ──
  {
    slug: "lead-enrich",
    name: "Lead Enrichment & Qualification",
    marketingName: "Lead Enrichment & Qualification",
    description:
      "Given a prospect's email, return everything a sales agent needs: email validation, DNS, domain reputation, WHOIS, and technology stack detection.",
    category: "sales-outreach",
    priceCents: 65,
    componentSumCents: 46,
    valueTier: "verification",
    maintenanceLevel: "low",
    geography: "us-global",
    targetAudience:
      "US developers building outbound sales agents, CRM enrichment, account research",
    transparencyTag: "mixed",
    extendsWith: ["company-enrich", "social-profile-check", "landing-page-roast"],
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          format: "email",
          description: "Prospect email address",
        },
      },
      required: ["email"],
    },
    exampleInput: { email: "jane@acme.com" },
    exampleOutput: {
      valid: true,
      domain: "acme.com",
      has_mx: true,
      reputation_score: 78,
      registrar: "GoDaddy",
      tech_stack: { frontend: "React", cms: "WordPress" },
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
      {
        capabilitySlug: "whois-lookup",
        stepOrder: 4,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { domain: "$steps[0].domain" },
      },
      {
        capabilitySlug: "tech-stack-detect",
        stepOrder: 5,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { url: "$steps[0].domain" },
      },
    ],
  },

  // ── 18. Website Security Audit ──
  {
    slug: "website-security-audit",
    name: "Website Security Audit",
    marketingName: "Website Security Audit",
    description:
      "Comprehensive security posture for any URL: SSL certificate health, HTTP header configuration, DNS security, and technology surface area.",
    category: "security-risk",
    priceCents: 45,
    componentSumCents: 29,
    valueTier: "verification",
    maintenanceLevel: "low",
    geography: "global",
    targetAudience:
      "Security teams, developers filling security questionnaires, compliance monitoring agents",
    transparencyTag: "mixed",
    extendsWith: ["ssl-certificate-chain", "page-speed-test", "whois-lookup"],
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to audit",
        },
      },
      required: ["url"],
    },
    exampleInput: { url: "https://example.com" },
    exampleOutput: {
      ssl_valid: true,
      header_security_grade: "B",
      dns_records: true,
      tech_stack: { frontend: "Vanilla", hosting: "AWS" },
    },
    steps: [
      {
        capabilitySlug: "ssl-check",
        stepOrder: 1,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { domain: "$input.url" },
      },
      {
        capabilitySlug: "header-security-check",
        stepOrder: 2,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { url: "$input.url" },
      },
      {
        capabilitySlug: "dns-lookup",
        stepOrder: 3,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { domain: "$input.url" },
      },
      {
        capabilitySlug: "tech-stack-detect",
        stepOrder: 4,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { url: "$input.url" },
      },
    ],
  },

  // ── 19. Prospect Company Profile ──
  {
    slug: "prospect-profile",
    name: "Prospect Company Profile",
    marketingName: "Prospect Company Profile",
    description:
      "Given a company name and URL, return SEC filing data, technology choices, web presence strength, and domain credibility. What an AE researches before a call, delivered in seconds.",
    category: "sales-outreach",
    priceCents: 180,
    componentSumCents: 140,
    valueTier: "data-lookup",
    maintenanceLevel: "low",
    geography: "us-global",
    targetAudience:
      "Account executives, CRM enrichment agents, investor research",
    transparencyTag: "mixed",
    extendsWith: ["sanctions-check", "social-profile-check", "landing-page-roast"],
    inputSchema: {
      type: "object",
      properties: {
        company: {
          type: "string",
          description: "Company name, CIK, or ticker",
        },
        url: {
          type: "string",
          description: "Company website URL",
        },
      },
      required: ["company", "url"],
    },
    exampleInput: { company: "Stripe", url: "https://stripe.com" },
    exampleOutput: {
      company_name: "Stripe, Inc.",
      cik: "0001779474",
      tech_stack: { frontend: "React", hosting: "AWS" },
      seo_score: 88,
      reputation_score: 95,
    },
    steps: [
      {
        capabilitySlug: "us-company-data",
        stepOrder: 1,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { company: "$input.company" },
      },
      {
        capabilitySlug: "tech-stack-detect",
        stepOrder: 2,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { url: "$input.url" },
      },
      {
        capabilitySlug: "seo-audit",
        stepOrder: 3,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { url: "$input.url" },
      },
      {
        capabilitySlug: "domain-reputation",
        stepOrder: 4,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { domain: "$input.url" },
      },
    ],
  },

  // ── 20. Domain Trust Check ──
  {
    slug: "domain-trust",
    name: "Domain Trust Check",
    marketingName: "Domain Trust Check",
    description:
      "Given a domain, answer \"is this domain trustworthy?\" — registration age, DNS configuration, SSL certificate, reputation score, and HTTP security headers.",
    category: "security-risk",
    priceCents: 40,
    componentSumCents: 29,
    valueTier: "data-lookup",
    maintenanceLevel: "near-zero",
    geography: "global",
    targetAudience:
      "Anti-fraud teams, brand protection, phishing detection, cybersecurity agents",
    transparencyTag: "algorithmic",
    extendsWith: ["tech-stack-detect", "backlink-check", "page-speed-test"],
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Domain to check",
        },
      },
      required: ["domain"],
    },
    exampleInput: { domain: "example.com" },
    exampleOutput: {
      registrar: "IANA",
      registration_age_days: 10950,
      dns_records: true,
      ssl_valid: true,
      reputation_score: 85,
      header_security_grade: "C",
    },
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
      {
        capabilitySlug: "header-security-check",
        stepOrder: 5,
        canParallel: true,
        parallelGroup: 1,
        inputMap: { url: "$input.domain" },
      },
    ],
  },
];

// ─── Seed logic ─────────────────────────────────────────────────────────────

async function seed() {
  const db = getDb();

  // Collect all capability slugs referenced by solutions (steps + extendsWith)
  const allSlugs = [
    ...new Set([
      ...SOLUTIONS.flatMap((s) => s.steps.map((st) => st.capabilitySlug)),
      ...SOLUTIONS.flatMap((s) => s.extendsWith),
    ]),
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
            extendsWith: sol.extendsWith,
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
            extendsWith: sol.extendsWith,
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
