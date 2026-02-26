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
