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
