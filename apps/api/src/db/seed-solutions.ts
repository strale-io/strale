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
  longDescription?: string;
  agentDescription?: string;
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
    longDescription:
      "Looks up the company in Sweden's official business registry (Bolagsverket), validates their EU VAT number against VIES, and screens the company name against OFAC, EU, and UN sanctions lists. Use this before onboarding a customer, signing a contract, or generating a partnership agreement involving a Swedish entity.",
    agentDescription:
      "verify swedish company, is this swedish company legit, KYC check sweden, check swedish org number, onboard swedish business customer, validate swedish organization, bolagsverket lookup",
    category: "compliance-verification",
    priceCents: 150,
    componentSumCents: 110,
    valueTier: "verification",
    maintenanceLevel: "very-low",
    geography: "nordic",
    targetAudience: "Developers building fintech tools, onboarding flows, or any agent that verifies Nordic businesses",
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
    longDescription:
      "Looks up the company in Norway's Brønnøysund Register Centre, validates their VAT number, and screens against international sanctions lists. Use this before doing business with a Norwegian entity.",
    agentDescription:
      "verify norwegian company, is this norwegian company legit, KYC check norway, check norwegian org number, brønnøysund lookup, validate norwegian organization",
    category: "compliance-verification",
    priceCents: 150,
    componentSumCents: 110,
    valueTier: "verification",
    maintenanceLevel: "very-low",
    geography: "nordic",
    targetAudience: "Developers building fintech tools or agents that verify Norwegian businesses",
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
    longDescription:
      "Looks up the company in Denmark's CVR register, validates their EU VAT number, and screens against international sanctions lists. Use this before doing business with a Danish entity.",
    agentDescription:
      "verify danish company, is this danish company legit, KYC check denmark, check danish CVR number, validate danish organization",
    category: "compliance-verification",
    priceCents: 150,
    componentSumCents: 110,
    valueTier: "verification",
    maintenanceLevel: "very-low",
    geography: "nordic",
    targetAudience: "Developers building fintech tools or agents that verify Danish businesses",
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
    longDescription:
      "Looks up the company in Finland's PRH business register using their Y-tunnus (business ID), validates their EU VAT number, and screens against international sanctions lists. Use this before doing business with a Finnish entity.",
    agentDescription:
      "verify finnish company, is this finnish company legit, KYC check finland, check finnish business id, Y-tunnus lookup, validate finnish organization",
    category: "compliance-verification",
    priceCents: 150,
    componentSumCents: 110,
    valueTier: "verification",
    maintenanceLevel: "very-low",
    geography: "nordic",
    targetAudience: "Developers building fintech tools or agents that verify Finnish businesses",
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
      "Verify bank details and tax IDs before your agent processes a payment. IBAN validation, bank identification, and counterparty VAT check.",
    longDescription:
      "Validates the IBAN structure and identifies the receiving bank, then confirms the counterparty's VAT registration is active. Catches invalid bank details and unregistered VAT numbers before money moves. Use this in any payment flow, invoice processing, or vendor onboarding.",
    agentDescription:
      "validate IBAN before payment, check bank details, verify payment recipient, is this IBAN real, validate counterparty before transfer, B2B payment check",
    category: "finance-banking",
    priceCents: 25,
    componentSumCents: 15,
    valueTier: "verification",
    maintenanceLevel: "near-zero",
    geography: "eu",
    targetAudience: "Developers building payment flows or B2B finance tools",
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
      "Everything your agent needs before initiating a SEPA transfer: IBAN validation, bank identification, VAT verification, and current exchange rate.",
    longDescription:
      "Validates the receiving IBAN, identifies the bank, confirms the counterparty's VAT registration, and fetches the current exchange rate if the source currency isn't EUR. One call replaces four separate API integrations. Use before any European bank transfer.",
    agentDescription:
      "prepare SEPA payment, SEPA transfer readiness check, European bank transfer validation, verify before SEPA transfer, IBAN and VAT for SEPA",
    category: "finance-banking",
    priceCents: 30,
    componentSumCents: 17,
    valueTier: "data-lookup",
    maintenanceLevel: "near-zero",
    geography: "eu",
    targetAudience: "Developers building European payment flows or SEPA integrations",
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
      "Your agent found a prospect's email — is it real? Deliverability check, DNS, and domain reputation in one call.",
    longDescription:
      "Validates the email address for deliverability, checks the domain's DNS configuration and MX records, and scores the domain's reputation. Catches disposable addresses, invalid mailboxes, and suspicious domains before your agent sends outreach. Use in any sales, marketing, or CRM enrichment pipeline.",
    agentDescription:
      "is this email real, check email before sending, validate prospect email, email deliverability check, verify email address, is this a real mailbox",
    category: "sales-outreach",
    priceCents: 20,
    componentSumCents: 11,
    valueTier: "data-lookup",
    maintenanceLevel: "near-zero",
    geography: "us-global",
    targetAudience:
      "Developers building outbound sales agents, email verification, or lead gen pipelines",
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
      "Look up any US company using SEC EDGAR data and screen against international sanctions lists. Filing data, company status, and sanctions check.",
    longDescription:
      "Queries SEC EDGAR for official filing data using a company name, ticker symbol, or CIK number, then screens the company against OFAC, EU, and UN sanctions lists. Returns company name, CIK, state of incorporation, and sanctions status. Use before doing business with a US entity.",
    agentDescription:
      "verify US company, check if american company exists, SEC company lookup, is this US company legit, US company sanctions check, EDGAR lookup",
    category: "compliance-verification",
    priceCents: 130,
    componentSumCents: 100,
    valueTier: "verification",
    maintenanceLevel: "very-low",
    geography: "us",
    targetAudience:
      "Developers doing vendor/partner onboarding or compliance checks on US companies",
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
      "Everything your agent needs to evaluate a domain: registration details, DNS setup, SSL health, and reputation score.",
    longDescription:
      "Combines WHOIS registration data, DNS record analysis, SSL certificate validation, and domain reputation scoring into one report. Use when your agent is researching a company, vetting a vendor, qualifying a lead, or checking a link before following it.",
    agentDescription:
      "look up this domain, who owns this website, is this domain trustworthy, domain background check, domain registration info, check website reputation",
    category: "security-risk",
    priceCents: 35,
    componentSumCents: 21,
    valueTier: "data-lookup",
    maintenanceLevel: "near-zero",
    geography: "global",
    targetAudience:
      "Any developer doing vendor assessment, lead qualification, or security monitoring",
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
      "Fetch any web page — even behind anti-bot walls — convert to clean markdown, and strip PII automatically. Ready for your RAG pipeline.",
    longDescription:
      "Uses a headless browser to fetch JavaScript-rendered pages that block direct requests, converts the content to clean markdown, then automatically detects and redacts PII (names, emails, phone numbers, addresses) before returning. Ready to drop into your RAG pipeline, knowledge base, or agent context window.",
    agentDescription:
      "scrape this page, get content from URL, extract web page for RAG, page blocked need content, convert URL to markdown, fetch website content, web scraping with anti-bot",
    category: "data-research",
    priceCents: 30,
    componentSumCents: 20,
    valueTier: "data-lookup",
    maintenanceLevel: "low",
    geography: "global",
    targetAudience:
      "Any developer building research agents, RAG pipelines, or content ingestion",
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
      "Will emails to this domain actually arrive? SPF, DKIM, DMARC, MX records, SSL, and blacklist status — the complete deliverability audit.",
    longDescription:
      "Checks every factor that determines inbox placement: SPF record configuration, DKIM signing, DMARC policy, MX record health, SSL certificate status, and blacklist presence. Use when evaluating email infrastructure for lead qualification, vendor assessment, or monitoring your own domain's deliverability.",
    agentDescription:
      "check email config for domain, will emails arrive at this domain, email infrastructure audit, SPF DKIM DMARC check, email deliverability test, can this domain receive email",
    category: "security-risk",
    priceCents: 25,
    componentSumCents: 16,
    valueTier: "verification",
    maintenanceLevel: "near-zero",
    geography: "global",
    targetAudience: "Any developer or team sending email at scale",
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
    longDescription:
      "Validates the full SSL certificate chain, checks email deliverability configuration (SPF/DKIM/DMARC), and measures page load performance. Your DevOps agent's first check when monitoring a service, or a quick sanity check before your agent interacts with an external site.",
    agentDescription:
      "is this website healthy, check website performance, site health check, SSL and speed test, website technical audit, is this site working properly",
    category: "security-risk",
    priceCents: 40,
    componentSumCents: 25,
    valueTier: "data-lookup",
    maintenanceLevel: "low",
    geography: "global",
    targetAudience: "DevOps teams, B2B SaaS, or agents monitoring external services",
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
      "Classify your AI system's risk level under the EU AI Act before the August 2026 deadline. Risk classification, obligations, and supervisory authority.",
    longDescription:
      "Analyzes your AI system description against EU AI Act risk categories, identifies matched articles and specific obligations, looks up the relevant national supervisory authority, and checks for prior enforcement actions in your sector. Use before deploying any AI system in the EU.",
    agentDescription:
      "EU AI Act classification, is my AI system high risk, AI compliance check, what are my AI Act obligations, EU AI regulation check, AI risk assessment Europe",
    category: "legal-regulatory",
    priceCents: 80,
    componentSumCents: 45,
    valueTier: "compliance",
    maintenanceLevel: "low",
    geography: "eu",
    targetAudience:
      "Any developer deploying AI systems in the EU. August 2026 enforcement deadline.",
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
    longDescription:
      "Comprehensive GDPR assessment: scans for cookie consent implementation, analyzes tracking scripts, evaluates privacy policy quality, checks SSL security, and identifies the responsible data protection authority for the website's jurisdiction. Use before your agent ships a feature, evaluates a vendor, or monitors compliance across a portfolio.",
    agentDescription:
      "GDPR check this website, is this site GDPR compliant, cookie and privacy audit, check website privacy compliance, European data protection check, does this website follow GDPR",
    category: "legal-regulatory",
    priceCents: 100,
    componentSumCents: 63,
    valueTier: "compliance",
    maintenanceLevel: "low-medium",
    geography: "eu-global",
    targetAudience:
      "Any developer assessing vendor/partner compliance or monitoring GDPR across a portfolio",
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
    longDescription:
      "Detects the competitor's technology stack (frameworks, hosting, analytics), audits their SEO health (meta tags, structure, performance), analyzes landing page conversion elements, and checks social media presence. Use for market research, fundraising prep, GTM positioning, or any agent building competitive intelligence.",
    agentDescription:
      "research this competitor, competitive analysis, what tech does this company use, analyze competitor website, competitor intelligence, market research on company",
    category: "data-research",
    priceCents: 140,
    componentSumCents: 110,
    valueTier: "compliance",
    maintenanceLevel: "low",
    geography: "global",
    targetAudience:
      "Any developer building competitive intelligence, market research, or fundraising prep tools",
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
      "SEC data, sanctions screening, domain security — answers 'should we do business with this company?' in one call.",
    longDescription:
      "Checks a company across 7 data sources in one call: SEC EDGAR, OFAC/EU/UN sanctions, WHOIS, DNS, SSL, domain reputation, and HTTP security headers. All steps run in parallel, quality-verified before delivery. Use before onboarding a vendor, signing a partnership, or approving a procurement request.",
    agentDescription:
      "assess vendor risk, should we do business with this company, vendor due diligence, vendor security check, is this vendor safe, company risk assessment, supplier evaluation, partnership due diligence",
    category: "security-risk",
    priceCents: 180,
    componentSumCents: 129,
    valueTier: "verification",
    maintenanceLevel: "very-low",
    geography: "us-global",
    targetAudience:
      "Developers building procurement agents, vendor management, or partnership due diligence tools",
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
      "Everything your sales agent needs from one email address — validation, domain intel, reputation, registrar, and tech stack detection.",
    longDescription:
      "Starting from just an email address: validates deliverability, checks DNS records, scores domain reputation, looks up WHOIS registration data, and detects the company's technology stack. Returns everything an outbound agent needs to qualify a prospect and personalize outreach. Use in CRM enrichment, SDR automation, or account research pipelines.",
    agentDescription:
      "enrich this lead, prospect research from email, lead qualification, what company is this email from, CRM enrichment, sales prospecting data, who is this prospect",
    category: "sales-outreach",
    priceCents: 65,
    componentSumCents: 46,
    valueTier: "verification",
    maintenanceLevel: "low",
    geography: "us-global",
    targetAudience:
      "Developers building outbound sales agents, CRM enrichment, or account research tools",
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
      "Is this website secure? SSL, HTTP headers, DNS, and tech stack — the security audit your agent runs before trusting any URL.",
    longDescription:
      "Comprehensive security posture assessment: validates SSL certificate health, audits HTTP security header configuration (CSP, HSTS, X-Frame-Options), checks DNS security, and maps the technology surface area. Use when your security agent evaluates a vendor, your procurement agent vets a SaaS tool, or your monitoring agent checks your own infrastructure.",
    agentDescription:
      "security audit this website, is this URL safe, check website security, SSL and header security check, website vulnerability assessment, is this site secure",
    category: "security-risk",
    priceCents: 45,
    componentSumCents: 29,
    valueTier: "verification",
    maintenanceLevel: "low",
    geography: "global",
    targetAudience:
      "Security teams, developers filling security questionnaires, or compliance monitoring agents",
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
      "Everything your sales agent researches before a call: SEC data, tech stack, web presence, and domain credibility — delivered in seconds.",
    longDescription:
      "Given a company name and URL: pulls SEC EDGAR filing data, detects their technology stack, audits their SEO and web presence strength, and scores their domain credibility. The complete pre-call research package that would take a human 30 minutes, delivered to your agent in seconds.",
    agentDescription:
      "research this prospect, company profile for sales call, what does this company do, pre-call research, prospect intelligence, account research before meeting",
    category: "sales-outreach",
    priceCents: 180,
    componentSumCents: 140,
    valueTier: "data-lookup",
    maintenanceLevel: "low",
    geography: "us-global",
    targetAudience:
      "Developers building account research, CRM enrichment, or pre-call intelligence tools",
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
      "Given a domain, answer 'is this domain trustworthy?' — registration age, DNS, SSL, reputation score, and HTTP security headers.",
    longDescription:
      "Checks five trust signals for any domain: WHOIS registration age and registrar, DNS configuration health, SSL certificate validity, reputation score from threat intelligence feeds, and HTTP security header grade. Use for phishing detection, link safety checks, brand protection, or any time your agent needs to evaluate whether a domain is trustworthy before interacting with it.",
    agentDescription:
      "is this domain trustworthy, check domain trust, domain reputation check, is this website safe to visit, phishing check, link safety verification, should I trust this domain",
    category: "security-risk",
    priceCents: 40,
    componentSumCents: 29,
    valueTier: "data-lookup",
    maintenanceLevel: "near-zero",
    geography: "global",
    targetAudience:
      "Anti-fraud teams, brand protection, phishing detection, or cybersecurity agents",
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
            longDescription: sol.longDescription ?? null,
            agentDescription: sol.agentDescription ?? null,
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
            longDescription: sol.longDescription ?? null,
            agentDescription: sol.agentDescription ?? null,
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
