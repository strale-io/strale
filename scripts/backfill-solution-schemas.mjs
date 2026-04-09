import postgres from "postgres";

const dbUrl = process.argv[2];
if (!dbUrl) { console.error("Usage: node scripts/backfill-solution-schemas.mjs <DB_URL>"); process.exit(1); }
const sql = postgres(dbUrl, { max: 1, ssl: { rejectUnauthorized: false } });

const COUNTRIES = {
  se: { inputField: "org_number", inputLabel: "Swedish organization number" },
  no: { inputField: "org_number", inputLabel: "Norwegian org number (9 digits)" },
  dk: { inputField: "cvr_number", inputLabel: "Danish CVR number" },
  fi: { inputField: "business_id", inputLabel: "Finnish business ID" },
  uk: { inputField: "company_number", inputLabel: "UK Companies House number" },
  de: { inputField: "company_name", inputLabel: "German company name or registration number" },
  fr: { inputField: "siren", inputLabel: "French SIREN/SIRET number" },
  nl: { inputField: "kvk_number", inputLabel: "Dutch KVK number" },
  be: { inputField: "enterprise_number", inputLabel: "Belgian enterprise number" },
  at: { inputField: "company_name", inputLabel: "Austrian company name or register number" },
  ie: { inputField: "company_name", inputLabel: "Irish company name or CRO number" },
  es: { inputField: "company_name", inputLabel: "Spanish company name or CIF" },
  it: { inputField: "company_name", inputLabel: "Italian company name or codice fiscale" },
  ch: { inputField: "company_name", inputLabel: "Swiss company name or UID" },
  pl: { inputField: "krs_number", inputLabel: "Polish KRS number" },
  pt: { inputField: "company_name", inputLabel: "Portuguese company name or NIPC" },
  us: { inputField: "company_name", inputLabel: "US company name or EIN" },
  ca: { inputField: "company_name", inputLabel: "Canadian company name or corporation number" },
  au: { inputField: "abn", inputLabel: "Australian Business Number (11 digits)" },
  sg: { inputField: "company_name", inputLabel: "Singapore company name or UEN" },
};

const STANDARD_OPTIONAL = {
  vat_number: { type: "string", description: "EU VAT number with country prefix. Auto-derived from registry data when possible." },
  domain: { type: "string", description: "Company website domain (e.g., example.com)" },
  contact_name: { type: "string", description: "Name of contact person for PEP screening" },
  contact_email: { type: "string", description: "Contact email for validation" },
};

function parseSchema(raw) {
  if (!raw) return {};
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return {}; } }
  return raw;
}

let updated = 0;

// Phase 1: KYB/Invoice solutions
for (const [cc, config] of Object.entries(COUNTRIES)) {
  for (const prefix of ["kyb-complete", "kyb-essentials", "invoice-verify"]) {
    const slug = `${prefix}-${cc}`;
    const [sol] = await sql`SELECT id, input_schema FROM solutions WHERE slug = ${slug}`;
    if (!sol) continue;

    const existing = parseSchema(sol.input_schema);
    const props = { ...(existing.properties || {}) };
    const before = Object.keys(props).length;

    // Country-specific ID
    if (!props[config.inputField]) {
      props[config.inputField] = { type: "string", description: config.inputLabel };
    }
    // company_name as alternative
    if (config.inputField !== "company_name" && !props.company_name) {
      props.company_name = { type: "string", description: "Company name (alternative to registration ID)" };
    }
    // Standard optional fields
    for (const [field, def] of Object.entries(STANDARD_OPTIONAL)) {
      if (!props[field]) props[field] = def;
    }
    // Invoice-specific
    if (prefix === "invoice-verify") {
      if (!props.invoice_number) props.invoice_number = { type: "string", description: "Invoice number" };
      if (!props.iban) props.iban = { type: "string", description: "Payment IBAN from invoice" };
    }

    const after = Object.keys(props).length;
    if (after > before) {
      const schema = { type: "object", properties: props, required: [config.inputField] };
      await sql`UPDATE solutions SET input_schema = ${JSON.stringify(schema)}::jsonb WHERE id = ${sol.id}`;
      updated++;
      console.log(`  ${slug}: ${before} -> ${after} fields`);
    }
  }
}

// Phase 1b: KYC solutions
const kycMap = { "kyc-sweden": "se", "kyc-norway": "no", "kyc-denmark": "dk", "kyc-finland": "fi" };
for (const [slug, cc] of Object.entries(kycMap)) {
  const config = COUNTRIES[cc];
  const [sol] = await sql`SELECT id, input_schema FROM solutions WHERE slug = ${slug}`;
  if (!sol) continue;

  const existing = parseSchema(sol.input_schema);
  const props = { ...(existing.properties || {}) };
  const before = Object.keys(props).length;

  if (!props[config.inputField]) props[config.inputField] = { type: "string", description: config.inputLabel };
  if (config.inputField !== "company_name" && !props.company_name) {
    props.company_name = { type: "string", description: "Company name (alternative)" };
  }
  for (const [field, def] of Object.entries(STANDARD_OPTIONAL)) {
    if (!props[field]) props[field] = def;
  }

  if (Object.keys(props).length > before) {
    await sql`UPDATE solutions SET input_schema = ${JSON.stringify({ type: "object", properties: props, required: [config.inputField] })}::jsonb WHERE id = ${sol.id}`;
    updated++;
    console.log(`  ${slug}: ${before} -> ${Object.keys(props).length} fields`);
  }
}

// Phase 1c: verify-us-company
const [usSol] = await sql`SELECT id, input_schema FROM solutions WHERE slug = 'verify-us-company'`;
if (usSol) {
  const existing = parseSchema(usSol.input_schema);
  const props = { ...(existing.properties || {}) };
  if (!props.company) props.company = { type: "string", description: "US company name" };
  if (!props.domain) props.domain = { type: "string", description: "Company website domain" };
  if (!props.vat_number) props.vat_number = { type: "string", description: "Tax ID / EIN" };
  if (!props.contact_name) props.contact_name = { type: "string", description: "Contact person name" };
  if (!props.contact_email) props.contact_email = { type: "string", description: "Contact email" };
  await sql`UPDATE solutions SET input_schema = ${JSON.stringify({ type: "object", properties: props, required: ["company"] })}::jsonb WHERE id = ${usSol.id}`;
  updated++;
  console.log("  verify-us-company updated");
}

console.log(`\nPhase 1 complete: ${updated} solutions updated`);

// Phase 2: Repair malformed capability schemas
console.log("\n=== Phase 2: Repair malformed capability schemas ===");
const allCaps = await sql`SELECT id, slug, input_schema FROM capabilities WHERE is_active = true`;
let repaired = 0;
for (const cap of allCaps) {
  const raw = cap.input_schema;
  const parsed = parseSchema(raw);

  // Check if schema is valid (has type and properties)
  if (!parsed.type || !parsed.properties) {
    // It's malformed — check if it's a string "[]" or similar
    if (raw === null || raw === "[]" || (typeof raw === "object" && Array.isArray(raw))) {
      await sql`UPDATE capabilities SET input_schema = '{"type":"object","required":[],"properties":{}}'::jsonb WHERE id = ${cap.id}`;
      console.log(`  Repaired ${cap.slug}: was ${typeof raw === "string" ? raw.substring(0, 30) : JSON.stringify(raw)?.substring(0, 30)}`);
      repaired++;
    } else if (typeof parsed === "object" && parsed.required !== undefined && !parsed.type) {
      // Has required but no type — add type and properties
      const fixed = { type: "object", required: parsed.required || [], properties: parsed.properties || {} };
      await sql`UPDATE capabilities SET input_schema = ${JSON.stringify(fixed)}::jsonb WHERE id = ${cap.id}`;
      console.log(`  Repaired ${cap.slug}: added missing type field`);
      repaired++;
    }
  }
}
console.log(`Phase 2 complete: ${repaired} capabilities repaired`);

await sql.end();
