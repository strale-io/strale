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

  console.log("Done. 5 capabilities seeded.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
