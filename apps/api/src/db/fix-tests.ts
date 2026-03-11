import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { testSuites } from "./schema.js";
import { eq, and, inArray } from "drizzle-orm";

type Check = { field: string; operator: string; value?: unknown; values?: unknown[] };
type ValidationRules = { checks: Check[] };

// ─── Helpers ────────────────────────────────────────────────────────────────

function applyRenames(
  rules: ValidationRules,
  renames: Record<string, string | null>,
): ValidationRules {
  const newChecks = rules.checks
    .map((c): Check | null => {
      if (!(c.field in renames)) return c;
      const newField = renames[c.field];
      if (newField === null) return null;
      return { ...c, field: newField };
    })
    .filter((c): c is Check => c !== null);
  return { checks: newChecks };
}

// ─── Fix definitions ─────────────────────────────────────────────────────────
//
// testTypes defaults to ["schema_check", "known_answer"] (generated tests only).
// Never touches edge_case or negative tests.

interface Fix {
  slug: string;
  testTypes?: string[];
  // Rename or remove specific fields in validationRules.checks
  renames?: Record<string, string | null>;
  // Replace all checks entirely
  newChecks?: Check[];
  // Replace the entire input
  inputFix?: Record<string, unknown>;
}

const FIXES: Fix[] = [
  // ── SECTION 1: Field renames / removals in generated validation rules ──────

  // us-company-data: output has `sic`, not `sic_code`
  { slug: "us-company-data", renames: { sic_code: "sic" } },

  // company-id-detect: output has `matches`, not `all_matches`
  // best_match IS a real field — just the test input was bad
  {
    slug: "company-id-detect",
    renames: { all_matches: "matches" },
    inputFix: { id: "556703-7485" },
  },

  // llm-output-validate: output has `auto_fixed`, not `auto_fixed_output`
  { slug: "llm-output-validate", renames: { auto_fixed_output: "auto_fixed" } },

  // sql-explain: output has `tables_referenced`; `operations` and `plain_english` don't exist
  {
    slug: "sql-explain",
    renames: { tables: "tables_referenced", operations: null, plain_english: null },
  },

  // container-track: output has `tracking_status`; `events` not a top-level field
  { slug: "container-track", renames: { status: "tracking_status", events: null } },

  // iban-validate: `error` only present on invalid IBAN — remove from schema checks
  { slug: "iban-validate", renames: { error: null } },

  // openapi-validate: `stats` is not a real field — output has individual count fields
  { slug: "openapi-validate", renames: { stats: null } },

  // sql-optimize: `improvements` is not a real field
  { slug: "sql-optimize", renames: { improvements: null } },

  // uptime-check: `redirected` not in actual output
  { slug: "uptime-check", renames: { redirected: null } },

  // api-health-check: response_body not always present; fix URL to ensure success path
  {
    slug: "api-health-check",
    renames: { response_body: null },
    inputFix: { url: "https://api.strale.io/v1/health" },
  },

  // ── SECTION 2: Full validation rewrites ──────────────────────────────────

  // iso-country-lookup: response is `{query, matches, total_matches, error}` not flat fields
  {
    slug: "iso-country-lookup",
    newChecks: [
      { field: "query", operator: "not_null" },
      { field: "matches", operator: "not_null" },
      { field: "total_matches", operator: "not_null" },
    ],
    inputFix: { country_code: "SE" },
  },

  // incoterms-explain: response wraps details under `incoterm` key
  {
    slug: "incoterms-explain",
    newChecks: [
      { field: "incoterm", operator: "not_null" },
      { field: "version", operator: "not_null" },
    ],
    inputFix: { incoterm: "EXW" },
  },

  // dangerous-goods-classify: response is `{query, matches, total_matches}` search style
  {
    slug: "dangerous-goods-classify",
    newChecks: [
      { field: "query", operator: "not_null" },
      { field: "matches", operator: "not_null" },
      { field: "total_matches", operator: "not_null" },
    ],
    inputFix: { goods_description: "Gasoline" },
  },

  // ── SECTION 3: Input field name mismatches ────────────────────────────────

  // date-parse: generator used `date` field but capability needs `date_string`
  // (iso_date, day, month, year ARE correct top-level fields)
  { slug: "date-parse", inputFix: { date_string: "2025-03-04" } },

  // phone-normalize: generator used `phone` but capability needs `phone_string`
  // (e164, type, country_code ARE correct fields on valid phone input)
  { slug: "phone-normalize", inputFix: { phone_string: "+46701234567" } },

  // ── SECTION 4: Bad generated input values ────────────────────────────────

  // flatten-json: `data` must be a nested object, not "test_value"
  {
    slug: "flatten-json",
    inputFix: {
      data: { user: { name: "John", age: 30, address: { city: "Stockholm" } } },
    },
  },

  // timezone-meeting-find: `timezones` needs ≥2 entries
  {
    slug: "timezone-meeting-find",
    inputFix: { timezones: ["Europe/Stockholm", "America/New_York", "Asia/Tokyo"] },
  },

  // youtube-summarize: needs a real YouTube URL
  {
    slug: "youtube-summarize",
    inputFix: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
  },

  // changelog-generate: needs `commits` array (not just a string)
  {
    slug: "changelog-generate",
    inputFix: {
      commits: [
        { message: "Add user authentication" },
        { message: "Fix login validation bug" },
        { message: "Update dependencies" },
      ],
    },
  },

  // schema-infer: needs `data` as array or CSV
  {
    slug: "schema-infer",
    inputFix: {
      data: [
        { name: "Alice", age: 30, city: "Stockholm" },
        { name: "Bob", age: 25, city: "Oslo" },
      ],
    },
  },

  // gitignore-generate: `languages` must be array, not string
  // (generator matched "language" pattern → "en")
  {
    slug: "gitignore-generate",
    inputFix: { languages: ["typescript", "javascript"], frameworks: ["react", "node"] },
  },

  // barcode-lookup: needs valid 8-14 digit UPC/EAN
  { slug: "barcode-lookup", inputFix: { barcode: "3017620422003" } }, // Nutella 400g

  // schema-migration-generate: needs both current_schema and desired_schema
  {
    slug: "schema-migration-generate",
    inputFix: {
      current_schema: "CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(255))",
      desired_schema:
        "CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(255), email VARCHAR(255), created_at TIMESTAMP)",
    },
  },

  // marketplace-fee-calculate: `marketplace` must be valid enum (amazon/ebay/etsy/shopify)
  {
    slug: "marketplace-fee-calculate",
    inputFix: { marketplace: "amazon", sale_price: 100, category: "electronics" },
  },

  // image-resize: needs `target_width` or `target_height`
  {
    slug: "image-resize",
    inputFix: {
      image_url:
        "https://www.gstatic.com/webp/gallery/1.jpg",
      target_width: 100,
    },
  },

  // blog-post-outline: `keywords` must be array, not string
  // (generator matched "keyword" pattern → "artificial intelligence")
  {
    slug: "blog-post-outline",
    inputFix: {
      topic: "Getting started with TypeScript",
      keywords: ["typescript", "javascript", "types", "static typing"],
    },
  },

  // github-repo-analyze: needs full GitHub URL
  { slug: "github-repo-analyze", inputFix: { url: "https://github.com/microsoft/vscode" } },

  // unit-convert: `from_unit`/`to_unit` fell through to "test_value"
  { slug: "unit-convert", inputFix: { value: 100, from_unit: "km", to_unit: "mi" } },

  // payment-reference-generate: `type` must be valid enum value
  { slug: "payment-reference-generate", inputFix: { type: "ocr_se" } },

  // flight-status: needs valid flight number format (airline + digits)
  { slug: "flight-status", inputFix: { flight: "LH400", flight_number: "LH400" } },

  // customs-duty-lookup: needs valid HS code format
  { slug: "customs-duty-lookup", inputFix: { hs_code: "8471.30" } },

  // json-schema-validate: needs both `data` and `schema`
  {
    slug: "json-schema-validate",
    inputFix: {
      data: { name: "Alice", age: 30 },
      schema: {
        type: "object",
        properties: { name: { type: "string" }, age: { type: "integer" } },
      },
    },
  },

  // diff-json: needs both `before` and `after`
  {
    slug: "diff-json",
    inputFix: {
      before: { name: "Alice", version: 1 },
      after: { name: "Alice", version: 2, email: "alice@example.com" },
    },
  },

  // dependency-audit: needs `package_json` string (file contents, not path)
  {
    slug: "dependency-audit",
    inputFix: {
      package_json:
        '{"name": "my-app", "version": "1.0.0", "dependencies": {"express": "^4.18.0", "lodash": "^4.17.21"}}',
    },
  },

  // llm-cost-calculate: model must be a supported name
  {
    slug: "llm-cost-calculate",
    inputFix: { model: "gpt-4o", prompt_text: "Write a function to validate email addresses" },
  },

  // prompt-compress: needs `prompt_text` string (not `messages` array)
  {
    slug: "prompt-compress",
    inputFix: {
      prompt_text:
        "You are a helpful AI assistant. Please help me write a comprehensive function that validates email addresses using a robust regex pattern, handling edge cases like internationalized addresses, plus-sign addressing, and subdomain TLDs.",
    },
  },

  // test-case-generate: needs `function_description` string
  {
    slug: "test-case-generate",
    inputFix: {
      function_description:
        "function add(a: number, b: number): number — returns the sum of two numbers",
    },
  },

  // ── SECTION 5: Country registry inputs ───────────────────────────────────

  // finnish-company-data: schema_check test used Swedish format "556703-7485"
  // known_answer tests already have correct inputs in seed-tests.ts — don't touch them
  {
    slug: "finnish-company-data",
    testTypes: ["schema_check"],
    inputFix: { business_id: "0112038-9" }, // Nokia Oyj
  },

  // estonian-company-data: no hand-seeded tests, generator used wrong registry_code format
  {
    slug: "estonian-company-data",
    inputFix: { registry_code: "10116441" }, // Skype Technologies OÜ
  },

  // french-company-data: generator used "Google" for SIREN search
  {
    slug: "french-company-data",
    inputFix: { siren: "542051180" }, // LVMH
  },

  // polish-company-data: generator used "test_value" for krs field
  {
    slug: "polish-company-data",
    inputFix: { krs: "0000033945" }, // PKN Orlen
  },

  // brazilian-company-data: needs 14-digit CNPJ, not a name
  {
    slug: "brazilian-company-data",
    inputFix: { cnpj: "11222333000181" },
  },

  // charity-lookup-uk: "Google" returns 404 in Charity Commission
  { slug: "charity-lookup-uk", inputFix: { name: "Oxfam" } },

  // github-repo-compare: needs two valid repo slugs
  {
    slug: "github-repo-compare",
    inputFix: { repo1: "microsoft/vscode", repo2: "neovim/neovim" },
  },

  // ── SECTION 6: External API inputs ───────────────────────────────────────

  // crypto-price: generated symbol not recognised
  { slug: "crypto-price", inputFix: { symbol: "BTC" } },

  // pypi-package-info: generated package name not found
  { slug: "pypi-package-info", inputFix: { package: "requests" } },

  // docker-hub-info: generated image name not found
  { slug: "docker-hub-info", inputFix: { image: "nginx" } },

  // npm-package-info: generated package name not found
  { slug: "npm-package-info", inputFix: { package: "express" } },
];

// ─── Main ────────────────────────────────────────────────────────────────────

async function fix() {
  const db = getDb();
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const f of FIXES) {
    const targetTypes = f.testTypes ?? ["schema_check", "known_answer"];

    const rows = await db
      .select()
      .from(testSuites)
      .where(
        and(
          eq(testSuites.capabilitySlug, f.slug),
          eq(testSuites.active, true),
          inArray(testSuites.testType, targetTypes),
        ),
      );

    if (rows.length === 0) {
      console.log(`  - ${f.slug}: no matching tests found`);
      totalSkipped++;
      continue;
    }

    for (const row of rows) {
      const updates: Record<string, unknown> = {};

      // Apply input fix
      if (f.inputFix !== undefined) {
        updates.input = f.inputFix;
      }

      // Apply validation rule changes
      const currentRules = (row.validationRules ?? { checks: [] }) as ValidationRules;

      if (f.newChecks !== undefined) {
        updates.validationRules = { checks: f.newChecks };
      } else if (f.renames !== undefined) {
        const patched = applyRenames(currentRules, f.renames);
        // Only update if something actually changed
        if (JSON.stringify(patched) !== JSON.stringify(currentRules)) {
          updates.validationRules = patched;
        }
      }

      if (Object.keys(updates).length === 0) {
        totalSkipped++;
        continue;
      }

      await db
        .update(testSuites)
        .set(updates as Parameters<typeof db.update>[0] extends infer T ? T : never)
        .where(eq(testSuites.id, row.id));

      console.log(`  ✓ ${f.slug} / "${row.testName}" (${Object.keys(updates).join(", ")})`);
      totalUpdated++;
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Done. Updated: ${totalUpdated}  Skipped: ${totalSkipped}`);
  process.exit(0);
}

fix().catch((err) => {
  console.error("Fix failed:", err);
  process.exit(1);
});
