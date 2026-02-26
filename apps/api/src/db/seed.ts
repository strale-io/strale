import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { capabilities } from "./schema.js";

const seedCapabilities = [
  {
    name: "Swedish Company Data",
    slug: "swedish-company-data",
    description:
      "Extract company data (revenue, employees, profit, fiscal year) for a Swedish organization number. Accepts natural language descriptions — resolves to org number automatically.",
    category: "data-extraction",
    inputSchema: {
      type: "object",
      properties: {
        org_number: {
          type: "string",
          description: "Swedish org number (e.g. 559106-8089) or company name",
        },
      },
      required: ["org_number"],
    },
    outputSchema: {
      type: "object",
      properties: {
        company_name: { type: "string" },
        org_number: { type: "string" },
        revenue_sek: { type: "number" },
        employees: { type: "integer" },
        profit_sek: { type: "number" },
        fiscal_year: { type: "string" },
      },
    },
    priceCents: 80,
  },
  {
    name: "Invoice / Receipt Extraction",
    slug: "invoice-extract",
    description:
      "Extract structured data from an invoice or receipt image/PDF. Returns line items, totals, dates, vendor info, VAT amounts.",
    category: "data-extraction",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to invoice image or PDF" },
        base64: { type: "string", description: "Base64-encoded invoice file" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        vendor: { type: "string" },
        date: { type: "string" },
        total: { type: "number" },
        currency: { type: "string" },
        line_items: { type: "array" },
        vat_amount: { type: "number" },
      },
    },
    priceCents: 50,
  },
  {
    name: "Web Page Data Extraction",
    slug: "web-extract",
    description:
      "Extract structured data from any web page with full JavaScript rendering. Handles SPAs, dynamic content, and pages that require JS to load.",
    category: "data-extraction",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to extract data from" },
        extract: {
          type: "string",
          description: "What data to extract (natural language)",
        },
      },
      required: ["url"],
    },
    outputSchema: {
      type: "object",
      properties: {
        data: { type: "object" },
        page_title: { type: "string" },
      },
    },
    priceCents: 15,
  },
  {
    name: "EU VAT Validation + VIES Enrichment",
    slug: "vat-validate",
    description:
      "Validate a European VAT number against the VIES database and return enriched company data. Handles VIES downtime and rate limiting reliably.",
    category: "validation",
    inputSchema: {
      type: "object",
      properties: {
        vat_number: {
          type: "string",
          description: "EU VAT number including country prefix (e.g. SE556703748501)",
        },
      },
      required: ["vat_number"],
    },
    outputSchema: {
      type: "object",
      properties: {
        valid: { type: "boolean" },
        country_code: { type: "string" },
        vat_number: { type: "string" },
        company_name: { type: "string" },
        company_address: { type: "string" },
      },
    },
    priceCents: 10,
  },
  {
    name: "Swedish Annual Report Extraction",
    slug: "annual-report-extract",
    description:
      "Download and extract structured financial data from a Swedish company's annual report (årsredovisning). Returns balance sheet, income statement, and key ratios.",
    category: "data-extraction",
    inputSchema: {
      type: "object",
      properties: {
        org_number: {
          type: "string",
          description: "Swedish org number (e.g. 559106-8089)",
        },
        year: {
          type: "integer",
          description: "Fiscal year (defaults to most recent)",
        },
      },
      required: ["org_number"],
    },
    outputSchema: {
      type: "object",
      properties: {
        company_name: { type: "string" },
        fiscal_year: { type: "string" },
        revenue_sek: { type: "number" },
        profit_sek: { type: "number" },
        total_assets_sek: { type: "number" },
        equity_sek: { type: "number" },
        employees: { type: "integer" },
      },
    },
    priceCents: 100,
  },
  // ─── New capabilities (DEC-20260226-P-s3t4) ─────────────────────────────
  {
    name: "Norwegian Company Data",
    slug: "norwegian-company-data",
    description:
      "Look up Norwegian company data from the Brønnøysund Register Centre. Accepts org number (9 digits) or fuzzy company name.",
    category: "data-extraction",
    inputSchema: {
      type: "object",
      properties: {
        org_number: { type: "string", description: "Norwegian org number (9 digits) or company name" },
      },
      required: ["org_number"],
    },
    outputSchema: {
      type: "object",
      properties: {
        company_name: { type: "string" },
        org_number: { type: "string" },
        business_type: { type: "string" },
        industry_code: { type: "string" },
        address: { type: "string" },
        registration_date: { type: "string" },
        employee_count: { type: "integer" },
        status: { type: "string" },
      },
    },
    priceCents: 80,
  },
  {
    name: "Danish Company Data",
    slug: "danish-company-data",
    description:
      "Look up Danish company data from the Central Business Register (CVR). Accepts CVR number (8 digits) or fuzzy company name.",
    category: "data-extraction",
    inputSchema: {
      type: "object",
      properties: {
        cvr_number: { type: "string", description: "Danish CVR number (8 digits) or company name" },
      },
      required: ["cvr_number"],
    },
    outputSchema: {
      type: "object",
      properties: {
        company_name: { type: "string" },
        cvr_number: { type: "string" },
        business_type: { type: "string" },
        industry_code: { type: "string" },
        address: { type: "string" },
        start_date: { type: "string" },
        employee_range: { type: "string" },
        status: { type: "string" },
      },
    },
    priceCents: 80,
  },
  {
    name: "Finnish Company Data",
    slug: "finnish-company-data",
    description:
      "Look up Finnish company data from PRH (Patent and Registration Office). Accepts Business ID (e.g. 0112038-9) or fuzzy company name.",
    category: "data-extraction",
    inputSchema: {
      type: "object",
      properties: {
        business_id: { type: "string", description: "Finnish Business ID (e.g. 0112038-9) or company name" },
      },
      required: ["business_id"],
    },
    outputSchema: {
      type: "object",
      properties: {
        company_name: { type: "string" },
        business_id: { type: "string" },
        business_type: { type: "string" },
        industry_code: { type: "string" },
        address: { type: "string" },
        registration_date: { type: "string" },
        status: { type: "string" },
      },
    },
    priceCents: 80,
  },
  {
    name: "IBAN Validation",
    slug: "iban-validate",
    description:
      "Validate an IBAN number. Checks format, length, and mod-97 checksum. Extracts country code, bank identifier, and branch code. Pure algorithmic — fast and cheap.",
    category: "validation",
    inputSchema: {
      type: "object",
      properties: {
        iban: { type: "string", description: "IBAN to validate (e.g. SE3550000000054910000003)" },
      },
      required: ["iban"],
    },
    outputSchema: {
      type: "object",
      properties: {
        valid: { type: "boolean" },
        country_code: { type: "string" },
        bank_code: { type: "string" },
        branch_code: { type: "string" },
        error: { type: "string" },
      },
    },
    priceCents: 5,
  },
  {
    name: "PII Redaction",
    slug: "pii-redact",
    description:
      "Detect and redact personally identifiable information (PII) from text. Identifies names, emails, phone numbers, national ID numbers (Swedish personnummer, Finnish henkilötunnus, etc.), addresses, and more.",
    category: "data-processing",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to redact PII from" },
      },
      required: ["text"],
    },
    outputSchema: {
      type: "object",
      properties: {
        redacted_text: { type: "string" },
        entities: { type: "array" },
        entity_counts: { type: "object" },
      },
    },
    priceCents: 15,
  },
  {
    name: "PDF Data Extraction",
    slug: "pdf-extract",
    description:
      "Extract structured data from any PDF document. Accepts a URL or base64-encoded PDF. Works on contracts, reports, forms — any document type. Returns JSON based on your extraction instructions.",
    category: "data-extraction",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to a PDF file" },
        base64: { type: "string", description: "Base64-encoded PDF" },
        extract: { type: "string", description: "What data to extract (natural language)" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        data: { type: "object" },
        source_url: { type: "string" },
      },
    },
    priceCents: 30,
  },
  {
    name: "Company Enrichment",
    slug: "company-enrich",
    description:
      "Enrich company data from a domain, email, or company name. Scrapes the company website to extract: industry, employee estimate, HQ location, description, social links, tech stack.",
    category: "data-extraction",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Company domain (e.g. spotify.com), email, or name" },
      },
      required: ["domain"],
    },
    outputSchema: {
      type: "object",
      properties: {
        company_name: { type: "string" },
        industry: { type: "string" },
        employee_estimate: { type: "string" },
        hq_location: { type: "string" },
        description: { type: "string" },
        tech_stack: { type: "array" },
      },
    },
    priceCents: 50,
  },
  {
    name: "EU Procurement Tender Search",
    slug: "ted-procurement",
    description:
      "Search EU public procurement tenders on TED (Tenders Electronic Daily). Filter by keyword, country, and CPV code. Returns tender titles, authorities, values, deadlines, and links.",
    category: "data-extraction",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "Search keyword for tenders" },
        country: { type: "string", description: "ISO country code filter (e.g. SE, DE)" },
        cpv_code: { type: "string", description: "CPV code filter" },
      },
      required: ["keyword"],
    },
    outputSchema: {
      type: "object",
      properties: {
        query: { type: "object" },
        result_count: { type: "integer" },
        tenders: { type: "array" },
      },
    },
    priceCents: 50,
  },
  // ─── EU Company Registries (15) ─────────────────────────────────────────────
  {
    name: "UK Company Data",
    slug: "uk-company-data",
    description: "Look up UK company data from Companies House. Accepts company number (8 digits) or fuzzy company name. Returns company name, status, incorporation date, SIC codes, registered address.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { company_number: { type: "string", description: "UK Companies House number (8 digits) or company name" } }, required: ["company_number"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, company_number: { type: "string" }, business_type: { type: "string" }, address: { type: "string" }, incorporation_date: { type: "string" }, status: { type: "string" } } },
    priceCents: 80,
  },
  {
    name: "Dutch Company Data",
    slug: "dutch-company-data",
    description: "Look up Dutch company data from KVK (Kamer van Koophandel). Accepts KVK number (8 digits) or fuzzy company name.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { kvk_number: { type: "string", description: "Dutch KVK number (8 digits) or company name" } }, required: ["kvk_number"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, registration_number: { type: "string" }, business_type: { type: "string" }, address: { type: "string" }, status: { type: "string" } } },
    priceCents: 80,
  },
  {
    name: "German Company Data",
    slug: "german-company-data",
    description: "Look up German company data from the Handelsregister. Accepts HRB/HRA number or fuzzy company name.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { hrb_number: { type: "string", description: "Handelsregister number (e.g. HRB 86891) or company name" } }, required: ["hrb_number"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, registration_number: { type: "string" }, business_type: { type: "string" }, address: { type: "string" }, status: { type: "string" } } },
    priceCents: 80,
  },
  {
    name: "French Company Data",
    slug: "french-company-data",
    description: "Look up French company data from the SIRENE registry. Accepts SIREN (9 digits), SIRET (14 digits), or fuzzy company name. Returns company name, address, activity code, directors.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { siren: { type: "string", description: "SIREN (9 digits), SIRET (14 digits), or company name" } }, required: ["siren"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, siren: { type: "string" }, siret: { type: "string" }, address: { type: "string" }, activity_code: { type: "string" }, status: { type: "string" }, directors: { type: "array" } } },
    priceCents: 80,
  },
  {
    name: "Belgian Company Data",
    slug: "belgian-company-data",
    description: "Look up Belgian company data from KBO/BCE (Crossroads Bank for Enterprises). Accepts enterprise number (10 digits, e.g. 0404.616.494) or fuzzy company name.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { enterprise_number: { type: "string", description: "KBO/BCE enterprise number (e.g. 0404.616.494) or company name" } }, required: ["enterprise_number"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, registration_number: { type: "string" }, business_type: { type: "string" }, address: { type: "string" }, status: { type: "string" } } },
    priceCents: 80,
  },
  {
    name: "Austrian Company Data",
    slug: "austrian-company-data",
    description: "Look up Austrian company data from the Firmenbuch. Accepts Firmenbuchnummer (e.g. FN 150913f) or fuzzy company name.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { fn_number: { type: "string", description: "Firmenbuchnummer (e.g. FN 150913f) or company name" } }, required: ["fn_number"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, registration_number: { type: "string" }, business_type: { type: "string" }, address: { type: "string" }, status: { type: "string" } } },
    priceCents: 80,
  },
  {
    name: "Irish Company Data",
    slug: "irish-company-data",
    description: "Look up Irish company data from CRO (Companies Registration Office). Accepts CRO number (5-6 digits) or fuzzy company name.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { cro_number: { type: "string", description: "CRO number (5-6 digits) or company name" } }, required: ["cro_number"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, registration_number: { type: "string" }, business_type: { type: "string" }, address: { type: "string" }, status: { type: "string" } } },
    priceCents: 80,
  },
  {
    name: "Polish Company Data",
    slug: "polish-company-data",
    description: "Look up Polish company data from KRS (Krajowy Rejestr Sądowy). Accepts KRS number (10 digits) or fuzzy company name. Returns company name, legal form, address, registration date.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { krs_number: { type: "string", description: "KRS number (10 digits) or company name" } }, required: ["krs_number"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, krs_number: { type: "string" }, legal_form: { type: "string" }, address: { type: "string" }, registration_date: { type: "string" }, status: { type: "string" } } },
    priceCents: 80,
  },
  {
    name: "Estonian Company Data",
    slug: "estonian-company-data",
    description: "Look up Estonian company data from the e-Business Register. Accepts registry code (8 digits) or fuzzy company name.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { registry_code: { type: "string", description: "Estonian registry code (8 digits) or company name" } }, required: ["registry_code"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, registry_code: { type: "string" }, business_type: { type: "string" }, address: { type: "string" }, status: { type: "string" } } },
    priceCents: 80,
  },
  {
    name: "Latvian Company Data",
    slug: "latvian-company-data",
    description: "Look up Latvian company data from the Enterprise Register (Uzņēmumu reģistrs). Accepts registration number (11 digits) or fuzzy company name.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { reg_number: { type: "string", description: "Latvian registration number (11 digits) or company name" } }, required: ["reg_number"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, registration_number: { type: "string" }, business_type: { type: "string" }, address: { type: "string" }, status: { type: "string" } } },
    priceCents: 80,
  },
  {
    name: "Lithuanian Company Data",
    slug: "lithuanian-company-data",
    description: "Look up Lithuanian company data from Registrų centras. Accepts company code (7-9 digits) or fuzzy company name.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { company_code: { type: "string", description: "Lithuanian company code (7-9 digits) or company name" } }, required: ["company_code"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, registration_number: { type: "string" }, business_type: { type: "string" }, address: { type: "string" }, status: { type: "string" } } },
    priceCents: 80,
  },
  {
    name: "Swiss Company Data",
    slug: "swiss-company-data",
    description: "Look up Swiss company data from Zefix (Zentraler Firmenindex). Accepts UID (e.g. CHE-105.805.977) or fuzzy company name.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { uid: { type: "string", description: "Swiss UID (e.g. CHE-105.805.977) or company name" } }, required: ["uid"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, registration_number: { type: "string" }, business_type: { type: "string" }, address: { type: "string" }, status: { type: "string" } } },
    priceCents: 80,
  },
  {
    name: "Spanish Company Data",
    slug: "spanish-company-data",
    description: "Look up Spanish company data from the Registro Mercantil. Accepts CIF/NIF (e.g. A28015865) or fuzzy company name.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { cif: { type: "string", description: "CIF/NIF number (e.g. A28015865) or company name" } }, required: ["cif"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, registration_number: { type: "string" }, business_type: { type: "string" }, address: { type: "string" }, status: { type: "string" } } },
    priceCents: 80,
  },
  {
    name: "Italian Company Data",
    slug: "italian-company-data",
    description: "Look up Italian company data from Registro Imprese. Accepts Partita IVA (11 digits) or fuzzy company name.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { partita_iva: { type: "string", description: "Partita IVA (11 digits) or company name" } }, required: ["partita_iva"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, registration_number: { type: "string" }, business_type: { type: "string" }, address: { type: "string" }, status: { type: "string" } } },
    priceCents: 80,
  },
  {
    name: "Portuguese Company Data",
    slug: "portuguese-company-data",
    description: "Look up Portuguese company data from RNPC. Accepts NIPC (9 digits) or fuzzy company name.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { nipc: { type: "string", description: "NIPC number (9 digits) or company name" } }, required: ["nipc"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, registration_number: { type: "string" }, business_type: { type: "string" }, address: { type: "string" }, status: { type: "string" } } },
    priceCents: 80,
  },
  // ─── Validation / Compliance Utilities (7) ──────────────────────────────────
  {
    name: "SWIFT/BIC Validation",
    slug: "swift-validate",
    description: "Validate a SWIFT/BIC code. Checks format, length, and country code. Extracts bank code, location, and branch. Pure algorithmic — instant and cheap.",
    category: "validation",
    inputSchema: { type: "object", properties: { swift: { type: "string", description: "SWIFT/BIC code (e.g. DABASESX)" } }, required: ["swift"] },
    outputSchema: { type: "object", properties: { valid: { type: "boolean" }, swift_code: { type: "string" }, bank_code: { type: "string" }, country_code: { type: "string" }, is_head_office: { type: "boolean" } } },
    priceCents: 3,
  },
  {
    name: "LEI Lookup",
    slug: "lei-lookup",
    description: "Look up a Legal Entity Identifier (LEI) via the GLEIF database. Accepts a 20-character LEI or company name. Returns entity name, jurisdiction, addresses, registration status.",
    category: "validation",
    inputSchema: { type: "object", properties: { lei: { type: "string", description: "20-character LEI code or company name" } }, required: ["lei"] },
    outputSchema: { type: "object", properties: { lei: { type: "string" }, legal_name: { type: "string" }, jurisdiction: { type: "string" }, status: { type: "string" }, legal_address: { type: "object" } } },
    priceCents: 10,
  },
  {
    name: "EORI Validation",
    slug: "eori-validate",
    description: "Validate an EORI (Economic Operators Registration and Identification) number against the EU customs validation service. Returns trader name and address if valid.",
    category: "validation",
    inputSchema: { type: "object", properties: { eori: { type: "string", description: "EORI number (e.g. DE123456789012345)" } }, required: ["eori"] },
    outputSchema: { type: "object", properties: { valid: { type: "boolean" }, eori_number: { type: "string" }, country_code: { type: "string" }, trader_name: { type: "string" } } },
    priceCents: 10,
  },
  {
    name: "Email Validation",
    slug: "email-validate",
    description: "Validate an email address. Checks format, MX records, disposable domain detection, and role-based address detection. No email is sent.",
    category: "validation",
    inputSchema: { type: "object", properties: { email: { type: "string", description: "Email address to validate" } }, required: ["email"] },
    outputSchema: { type: "object", properties: { valid: { type: "boolean" }, email: { type: "string" }, has_mx_records: { type: "boolean" }, is_disposable: { type: "boolean" }, is_role_address: { type: "boolean" } } },
    priceCents: 3,
  },
  {
    name: "VAT Format Validation",
    slug: "vat-format-validate",
    description: "Validate a European VAT number format against country-specific rules. Pure algorithmic — does NOT check VIES. Use vat-validate for full VIES verification. Supports all 27 EU countries + GB, CH, NO.",
    category: "validation",
    inputSchema: { type: "object", properties: { vat_number: { type: "string", description: "VAT number including country prefix (e.g. SE556703748501)" } }, required: ["vat_number"] },
    outputSchema: { type: "object", properties: { valid: { type: "boolean" }, vat_number: { type: "string" }, country_code: { type: "string" }, country_name: { type: "string" }, format_valid: { type: "boolean" } } },
    priceCents: 2,
  },
  {
    name: "ISBN Validation",
    slug: "isbn-validate",
    description: "Validate an ISBN-10 or ISBN-13 number. Checks format, length, and checksum. Converts ISBN-10 to ISBN-13. Pure algorithmic — instant.",
    category: "validation",
    inputSchema: { type: "object", properties: { isbn: { type: "string", description: "ISBN-10 or ISBN-13 (e.g. 978-3-16-148410-0)" } }, required: ["isbn"] },
    outputSchema: { type: "object", properties: { valid: { type: "boolean" }, type: { type: "string" }, isbn13: { type: "string" } } },
    priceCents: 2,
  },
  {
    name: "Company ID Detection",
    slug: "company-id-detect",
    description: "Identify the type and country of a company registration number. Detects Swedish org numbers, Finnish business IDs, German HRB numbers, LEIs, DUNS, and 20+ other formats. Pure algorithmic.",
    category: "validation",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "Company registration number to identify" } }, required: ["id"] },
    outputSchema: { type: "object", properties: { detected: { type: "boolean" }, best_match: { type: "object" }, all_matches: { type: "array" } } },
    priceCents: 5,
  },
  // ─── Global Company Registries (8) ──────────────────────────────────────────
  {
    name: "US Company Data",
    slug: "us-company-data",
    description: "Look up US company data from SEC EDGAR. Accepts CIK number, ticker symbol, or fuzzy company name. Returns company name, CIK, SIC code, state, filings summary.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { company: { type: "string", description: "CIK number, ticker symbol, or company name" } }, required: ["company"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, cik: { type: "string" }, sic_code: { type: "string" }, state: { type: "string" }, fiscal_year_end: { type: "string" } } },
    priceCents: 80,
  },
  {
    name: "Canadian Company Data",
    slug: "canadian-company-data",
    description: "Look up Canadian company data from Corporations Canada. Accepts corporation number or fuzzy company name.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { corporation_number: { type: "string", description: "Canadian corporation number or company name" } }, required: ["corporation_number"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, corporation_number: { type: "string" }, business_type: { type: "string" }, status: { type: "string" } } },
    priceCents: 80,
  },
  {
    name: "Australian Company Data",
    slug: "australian-company-data",
    description: "Look up Australian company data from ABN Lookup. Accepts ABN (11 digits), ACN (9 digits), or fuzzy company name.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { abn: { type: "string", description: "ABN (11 digits), ACN (9 digits), or company name" } }, required: ["abn"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, abn: { type: "string" }, acn: { type: "string" }, business_type: { type: "string" }, status: { type: "string" } } },
    priceCents: 80,
  },
  {
    name: "Indian Company Data",
    slug: "indian-company-data",
    description: "Look up Indian company data from MCA. Accepts CIN (21-character Corporate Identity Number) or fuzzy company name.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { cin: { type: "string", description: "CIN (21 characters) or company name" } }, required: ["cin"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, cin: { type: "string" }, business_type: { type: "string" }, status: { type: "string" } } },
    priceCents: 80,
  },
  {
    name: "Singapore Company Data",
    slug: "singapore-company-data",
    description: "Look up Singaporean company data from ACRA. Accepts UEN (9-10 alphanumeric) or fuzzy company name.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { uen: { type: "string", description: "UEN (e.g. 200401141R) or company name" } }, required: ["uen"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, uen: { type: "string" }, business_type: { type: "string" }, status: { type: "string" } } },
    priceCents: 80,
  },
  {
    name: "Hong Kong Company Data",
    slug: "hong-kong-company-data",
    description: "Look up Hong Kong company data from ICRIS. Accepts CR number (7 digits) or fuzzy company name.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { cr_number: { type: "string", description: "CR number (7 digits) or company name" } }, required: ["cr_number"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, cr_number: { type: "string" }, business_type: { type: "string" }, status: { type: "string" } } },
    priceCents: 80,
  },
  {
    name: "Brazilian Company Data",
    slug: "brazilian-company-data",
    description: "Look up Brazilian company data from ReceitaWS. Requires CNPJ (14 digits). Returns company name, trade name, status, address, activity codes, partners.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { cnpj: { type: "string", description: "CNPJ number (14 digits, e.g. 11222333000181)" } }, required: ["cnpj"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, cnpj: { type: "string" }, status: { type: "string" }, address: { type: "string" }, activity_codes: { type: "array" } } },
    priceCents: 80,
  },
  {
    name: "Japanese Company Data",
    slug: "japanese-company-data",
    description: "Look up Japanese company data from the National Tax Agency corporate number system. Accepts 13-digit corporate number or fuzzy company name.",
    category: "data-extraction",
    inputSchema: { type: "object", properties: { corporate_number: { type: "string", description: "13-digit corporate number or company name" } }, required: ["corporate_number"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, corporate_number: { type: "string" }, business_type: { type: "string" }, status: { type: "string" } } },
    priceCents: 80,
  },
  // ─── Financial & Credit (3) ─────────────────────────────────────────────────
  {
    name: "Exchange Rate",
    slug: "exchange-rate",
    description: "Get current exchange rate between two currencies using ECB data. Supports all major currencies. Returns rate, inverse rate, and date.",
    category: "financial",
    inputSchema: { type: "object", properties: { from: { type: "string", description: "Source currency (ISO 4217, e.g. USD)" }, to: { type: "string", description: "Target currency (ISO 4217, e.g. EUR)" } }, required: ["from", "to"] },
    outputSchema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, rate: { type: "number" }, inverse_rate: { type: "number" }, date: { type: "string" } } },
    priceCents: 2,
  },
  {
    name: "Stock Quote",
    slug: "stock-quote",
    description: "Get real-time stock quote data for any publicly traded company. Accepts ticker symbols (e.g. AAPL, VOLV-B.ST). Returns price, change, volume, market state.",
    category: "financial",
    inputSchema: { type: "object", properties: { symbol: { type: "string", description: "Stock ticker symbol (e.g. AAPL, TSLA, VOLV-B.ST)" } }, required: ["symbol"] },
    outputSchema: { type: "object", properties: { symbol: { type: "string" }, name: { type: "string" }, price: { type: "number" }, change: { type: "number" }, change_percent: { type: "number" }, volume: { type: "integer" } } },
    priceCents: 5,
  },
  {
    name: "Credit Report Summary",
    slug: "credit-report-summary",
    description: "Get a credit report summary for a Swedish company from Allabolag. Returns credit rating, financial summary, risk indicators, board members. Accepts org number or company name.",
    category: "financial",
    inputSchema: { type: "object", properties: { org_number: { type: "string", description: "Swedish org number (10 digits) or company name" } }, required: ["org_number"] },
    outputSchema: { type: "object", properties: { company_name: { type: "string" }, credit_rating: { type: "string" }, risk_indicator: { type: "string" }, revenue_sek: { type: "number" }, profit_sek: { type: "number" } } },
    priceCents: 100,
  },
  // ─── Domain & Web Intelligence (4) ──────────────────────────────────────────
  {
    name: "DNS Lookup",
    slug: "dns-lookup",
    description: "Perform a comprehensive DNS lookup for a domain. Returns A, AAAA, MX, NS, TXT, CNAME records plus SPF and DMARC detection.",
    category: "web-intelligence",
    inputSchema: { type: "object", properties: { domain: { type: "string", description: "Domain name (e.g. example.com)" } }, required: ["domain"] },
    outputSchema: { type: "object", properties: { domain: { type: "string" }, a_records: { type: "array" }, mx_records: { type: "array" }, ns_records: { type: "array" }, has_spf: { type: "boolean" }, has_dmarc: { type: "boolean" } } },
    priceCents: 3,
  },
  {
    name: "WHOIS Lookup",
    slug: "whois-lookup",
    description: "Perform a WHOIS lookup for a domain. Returns registrar, creation date, expiry date, name servers, registrant info, and raw WHOIS data.",
    category: "web-intelligence",
    inputSchema: { type: "object", properties: { domain: { type: "string", description: "Domain name (e.g. example.com)" } }, required: ["domain"] },
    outputSchema: { type: "object", properties: { domain: { type: "string" }, registrar: { type: "string" }, created: { type: "string" }, expires: { type: "string" }, name_servers: { type: "array" } } },
    priceCents: 10,
  },
  {
    name: "SSL Certificate Check",
    slug: "ssl-check",
    description: "Check a domain's SSL/TLS certificate. Returns issuer, validity dates, days until expiry, protocol version, cipher, and SAN entries.",
    category: "web-intelligence",
    inputSchema: { type: "object", properties: { domain: { type: "string", description: "Domain name (e.g. example.com)" } }, required: ["domain"] },
    outputSchema: { type: "object", properties: { domain: { type: "string" }, valid: { type: "boolean" }, issuer: { type: "string" }, valid_to: { type: "string" }, days_until_expiry: { type: "integer" }, is_expired: { type: "boolean" } } },
    priceCents: 3,
  },
  {
    name: "Tech Stack Detection",
    slug: "tech-stack-detect",
    description: "Detect the technology stack of a website. Identifies frontend framework, CSS framework, CMS, analytics, hosting, CDN, and other technologies.",
    category: "web-intelligence",
    inputSchema: { type: "object", properties: { url: { type: "string", description: "Website URL (e.g. https://example.com)" } }, required: ["url"] },
    outputSchema: { type: "object", properties: { url: { type: "string" }, frontend_framework: { type: "string" }, css_framework: { type: "string" }, cms: { type: "string" }, analytics: { type: "array" }, hosting: { type: "string" } } },
    priceCents: 20,
  },
  // ─── Regulatory & Trade (3) ─────────────────────────────────────────────────
  {
    name: "Sanctions Check",
    slug: "sanctions-check",
    description: "Check if a person or entity is on sanctions lists (EU, US OFAC, UN, UK). Uses OpenSanctions consolidated database. Returns match results with confidence scores.",
    category: "compliance",
    inputSchema: { type: "object", properties: { name: { type: "string", description: "Person or company name to check" }, country: { type: "string", description: "ISO country code filter (optional)" } }, required: ["name"] },
    outputSchema: { type: "object", properties: { query: { type: "string" }, is_sanctioned: { type: "boolean" }, match_count: { type: "integer" }, matches: { type: "array" } } },
    priceCents: 20,
  },
  {
    name: "HS Code Lookup",
    slug: "hs-code-lookup",
    description: "Classify a product into Harmonized System (HS) commodity codes. Returns primary HS code, chapter, section, and alternative classifications with confidence levels.",
    category: "trade",
    inputSchema: { type: "object", properties: { product: { type: "string", description: "Product description to classify" } }, required: ["product"] },
    outputSchema: { type: "object", properties: { primary_hs_code: { type: "string" }, primary_description: { type: "string" }, chapter: { type: "string" }, alternative_codes: { type: "array" }, confidence: { type: "string" } } },
    priceCents: 10,
  },
  {
    name: "EU Regulation Search",
    slug: "eu-regulation-search",
    description: "Search EU regulations, directives, and decisions on EUR-Lex. Returns matching legislation with titles, CELEX numbers, dates, and summaries.",
    category: "compliance",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Search topic or keywords" }, type: { type: "string", description: "Regulation type filter (regulation/directive/decision)" } }, required: ["query"] },
    outputSchema: { type: "object", properties: { query: { type: "string" }, result_count: { type: "integer" }, regulations: { type: "array" } } },
    priceCents: 30,
  },
  // ─── Text & Language (4) ────────────────────────────────────────────────────
  {
    name: "Translate Text",
    slug: "translate",
    description: "Translate text between languages. Auto-detects source language. Supports all major languages. Returns translated text with confidence.",
    category: "text-processing",
    inputSchema: { type: "object", properties: { text: { type: "string", description: "Text to translate" }, target_language: { type: "string", description: "Target language (e.g. English, Swedish, French)" }, source_language: { type: "string", description: "Source language (optional, auto-detected)" } }, required: ["text", "target_language"] },
    outputSchema: { type: "object", properties: { translated_text: { type: "string" }, source_language: { type: "string" }, target_language: { type: "string" }, confidence: { type: "string" } } },
    priceCents: 5,
  },
  {
    name: "Summarize Text",
    slug: "summarize",
    description: "Summarize text into a concise format. Supports paragraph, bullet points, or one-sentence styles. Configurable max length.",
    category: "text-processing",
    inputSchema: { type: "object", properties: { text: { type: "string", description: "Text to summarize" }, style: { type: "string", description: "Summary style: paragraph, bullets, or one_sentence" }, max_length: { type: "integer", description: "Approximate max word count" } }, required: ["text"] },
    outputSchema: { type: "object", properties: { summary: { type: "string" }, style: { type: "string" }, word_count: { type: "integer" }, key_points: { type: "array" } } },
    priceCents: 5,
  },
  {
    name: "Sentiment Analysis",
    slug: "sentiment-analyze",
    description: "Analyze the sentiment of text. Returns overall sentiment (positive/negative/neutral/mixed), confidence scores, and aspect-level sentiment.",
    category: "text-processing",
    inputSchema: { type: "object", properties: { text: { type: "string", description: "Text to analyze" } }, required: ["text"] },
    outputSchema: { type: "object", properties: { sentiment: { type: "string" }, confidence: { type: "number" }, scores: { type: "object" }, aspects: { type: "array" } } },
    priceCents: 5,
  },
  {
    name: "Text Classification",
    slug: "classify-text",
    description: "Classify text into categories. Optionally provide custom categories. Returns primary category, confidence scores, topic keywords, and summary.",
    category: "text-processing",
    inputSchema: { type: "object", properties: { text: { type: "string", description: "Text to classify" }, categories: { type: "array", description: "Optional list of categories to classify into" } }, required: ["text"] },
    outputSchema: { type: "object", properties: { primary_category: { type: "string" }, confidence: { type: "number" }, all_categories: { type: "array" }, topic_keywords: { type: "array" } } },
    priceCents: 5,
  },
  // ─── Data Format Utilities (3) ──────────────────────────────────────────────
  {
    name: "JSON to CSV",
    slug: "json-to-csv",
    description: "Convert a JSON array of objects to CSV format. Supports custom delimiters. Pure algorithmic — instant and cheap.",
    category: "data-processing",
    inputSchema: { type: "object", properties: { data: { type: "array", description: "Array of objects to convert" }, delimiter: { type: "string", description: "Column delimiter (default: comma)" } }, required: ["data"] },
    outputSchema: { type: "object", properties: { csv: { type: "string" }, row_count: { type: "integer" }, column_count: { type: "integer" }, columns: { type: "array" } } },
    priceCents: 2,
  },
  {
    name: "Currency Convert",
    slug: "currency-convert",
    description: "Convert an amount between currencies using ECB exchange rates. Supports all major currencies. Returns converted amount and rate.",
    category: "financial",
    inputSchema: { type: "object", properties: { amount: { type: "number", description: "Amount to convert" }, from: { type: "string", description: "Source currency (ISO 4217)" }, to: { type: "string", description: "Target currency (ISO 4217)" } }, required: ["amount", "from", "to"] },
    outputSchema: { type: "object", properties: { amount: { type: "number" }, from: { type: "string" }, to: { type: "string" }, converted_amount: { type: "number" }, rate: { type: "number" }, date: { type: "string" } } },
    priceCents: 2,
  },
  {
    name: "Address Parse",
    slug: "address-parse",
    description: "Parse a free-text address into structured components. Returns street, city, postal code, state/province, country. Works with addresses worldwide.",
    category: "data-processing",
    inputSchema: { type: "object", properties: { address: { type: "string", description: "Free-text address to parse" } }, required: ["address"] },
    outputSchema: { type: "object", properties: { street: { type: "string" }, city: { type: "string" }, postal_code: { type: "string" }, country: { type: "string" }, country_code: { type: "string" }, formatted: { type: "string" } } },
    priceCents: 5,
  },
];

async function seed() {
  const db = getDb();

  console.log("Seeding capabilities...");

  for (const cap of seedCapabilities) {
    await db
      .insert(capabilities)
      .values(cap)
      .onConflictDoUpdate({
        target: capabilities.slug,
        set: {
          name: cap.name,
          description: cap.description,
          category: cap.category,
          inputSchema: cap.inputSchema,
          outputSchema: cap.outputSchema,
          priceCents: cap.priceCents,
          updatedAt: new Date(),
        },
      });
    console.log(`  ✓ ${cap.slug} (€${(cap.priceCents / 100).toFixed(2)})`);
  }

  console.log(`Done. ${seedCapabilities.length} capabilities seeded.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
