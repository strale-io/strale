/**
 * Committed regression smoke for the openapi-resolver chain across all 8
 * WW-Top countries (AT + Phase 2a BG/CY/HU/LU/MT/NL/RO).
 *
 * Modes:
 *   --offline-only (default): runs negative tests only. Free.
 *   --live: additionally exercises each country with its probe-verified
 *           fixture against Openapi prod credentials. Cost ~€1.28 per
 *           full sweep (€0.16 × 8 countries).
 *
 * Negative tests (run per country in both modes):
 *   1. OPENAPI_ENABLED=false → capability-unavailable
 *   2. invalid identifier shape → invalid-identifier error
 *   3. missing input → missing-input error
 *
 * Live test (only in --live):
 *   4. Fixture identifier → HTTP 200 with T1=6/7 (legal_form null OK),
 *      T2 vat+source_as_of populated, T3 NACE populated.
 *
 * Exit code: 0 on all-pass, 1 on any-fail.
 *
 * Usage:
 *   npx tsx apps/api/scripts/smoke-openapi-resolver.ts --offline-only
 *   railway run -- npx tsx apps/api/scripts/smoke-openapi-resolver.ts --live
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

const args = process.argv.slice(2);
const LIVE = args.includes("--live");
const OFFLINE_ONLY = !LIVE;

interface CountryConfig {
  country: string;
  slug: string;
  product: "ww-top" | "es-advanced" | "pt-advanced";
  validFixture: Record<string, string>;
  invalidShape: Record<string, string>; // pre-flight regex reject
  expectedCompanyName: string;          // for live verify (loose match)
  // Tier 3 fields expected populated. WW-Top: just NACE (1/6).
  // ES/PT-Advanced: NACE + last_filing_date (2/6). IT-Advanced (Phase 2c):
  // adds shareHolders[] (4/6); IT-Full adds managers + subsidiaries.
  expectedT3Fields: string[];
}

const COUNTRIES: CountryConfig[] = [
  { country: "AT", slug: "austrian-company-data", product: "ww-top", validFixture: { vat_number: "ATU14189108" }, invalidShape: { vat_number: "FN93363z" }, expectedCompanyName: "OMV", expectedT3Fields: ["nace_codes"] },
  { country: "BG", slug: "bulgarian-company-data", product: "ww-top", validFixture: { vat_number: "831902088" }, invalidShape: { vat_number: "ABC" }, expectedCompanyName: "Sopharma", expectedT3Fields: ["nace_codes"] },
  { country: "CY", slug: "cypriot-company-data", product: "ww-top", validFixture: { vat_number: "C165" }, invalidShape: { vat_number: "INVALID" }, expectedCompanyName: "Bank of Cyprus", expectedT3Fields: ["nace_codes"] },
  { country: "HU", slug: "hungarian-company-data", product: "ww-top", validFixture: { vat_number: "HU10537914" }, invalidShape: { vat_number: "01-10-041585" }, expectedCompanyName: "OTP", expectedT3Fields: ["nace_codes"] },
  { country: "LU", slug: "luxembourgish-company-data", product: "ww-top", validFixture: { vat_number: "LU18513414" }, invalidShape: { vat_number: "B10807" }, expectedCompanyName: "RTL", expectedT3Fields: ["nace_codes"] },
  { country: "MT", slug: "maltese-company-data", product: "ww-top", validFixture: { vat_number: "MT12826209" }, invalidShape: { vat_number: "C 2833" }, expectedCompanyName: "GO", expectedT3Fields: ["nace_codes"] },
  { country: "NL", slug: "dutch-company-data", product: "ww-top", validFixture: { vat_number: "NL803441526B01" }, invalidShape: { vat_number: "17085815" }, expectedCompanyName: "ASML", expectedT3Fields: ["nace_codes"] },
  { country: "RO", slug: "romanian-company-data", product: "ww-top", validFixture: { vat_number: "RO13267213" }, invalidShape: { vat_number: "INVALID" }, expectedCompanyName: "Hidroelectrica", expectedT3Fields: ["nace_codes"] },
  { country: "ES", slug: "spanish-company-data", product: "es-advanced", validFixture: { vat_number: "A28015865" }, invalidShape: { vat_number: "INVALID" }, expectedCompanyName: "Telefonica", expectedT3Fields: ["nace_codes", "last_filing_date"] },
  { country: "PT", slug: "portuguese-company-data", product: "pt-advanced", validFixture: { vat_number: "504499777" }, invalidShape: { vat_number: "ABC" }, expectedCompanyName: "Galp", expectedT3Fields: ["nace_codes", "last_filing_date"] },
  // IT-Advanced is unique in v1: T1=7/7 (legal_form via detailedLegalForm),
  // T3=4/6 (shareholders + nace + share_capital + last_filing_date).
  // shareholders[] is structurally present but empty for widely-held Eni —
  // the smoke validates structural presence (array), not non-empty count.
  { country: "IT", slug: "italian-company-data", product: "it-advanced", validFixture: { vat_number: "00484960588" }, invalidShape: { vat_number: "INVALID" }, expectedCompanyName: "ENI", expectedT3Fields: ["nace_codes", "last_filing_date", "share_capital"] },
];

// Disable DB sync in auto-register — smoke runs locally without prod DB access.
const savedDbUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = "";

const { autoRegisterCapabilities } = await import("../src/capabilities/auto-register.js");
const { getExecutor } = await import("../src/capabilities/index.js");
await autoRegisterCapabilities();
process.env.DATABASE_URL = savedDbUrl ?? "";

interface TestResult {
  country: string;
  test: string;
  passed: boolean;
  detail?: string;
}
const results: TestResult[] = [];

function record(country: string, test: string, passed: boolean, detail?: string) {
  results.push({ country, test, passed, detail });
  const prefix = passed ? "  ✓" : "  ✗";
  console.error(`${prefix} ${country} ${test}${detail ? ": " + detail.slice(0, 100) : ""}`);
}

async function expectError(fn: () => Promise<unknown>, matcher: string): Promise<{ ok: boolean; msg: string }> {
  try {
    await fn();
    return { ok: false, msg: "no error thrown" };
  } catch (err) {
    const msg = String(err);
    return { ok: msg.includes(matcher), msg };
  }
}

async function runOfflineTests(cfg: CountryConfig) {
  console.error(`\n--- ${cfg.country} (${cfg.slug}) offline ---`);
  const executor = getExecutor(cfg.slug);
  if (!executor) {
    record(cfg.country, "executor registered", false, "no executor for slug");
    return;
  }
  record(cfg.country, "executor registered", true);

  // Test 1: flag disabled
  const savedFlag = process.env.OPENAPI_ENABLED;
  process.env.OPENAPI_ENABLED = "false";
  const t1 = await expectError(() => executor(cfg.validFixture), "capability-unavailable");
  record(cfg.country, "flag-disabled → capability-unavailable", t1.ok, t1.msg);

  // Test 2: invalid shape (flag enabled so we reach the validator)
  process.env.OPENAPI_ENABLED = "true";
  const t2 = await expectError(() => executor(cfg.invalidShape), "not a valid");
  record(cfg.country, "invalid-shape → rejected", t2.ok, t2.msg);

  // Test 3: missing input
  const t3 = await expectError(() => executor({}), "required");
  record(cfg.country, "missing-input → required-error", t3.ok, t3.msg);

  process.env.OPENAPI_ENABLED = savedFlag;
}

async function runLiveTest(cfg: CountryConfig) {
  console.error(`\n--- ${cfg.country} (${cfg.slug}) LIVE ---`);
  process.env.OPENAPI_ENABLED = "true";
  const executor = getExecutor(cfg.slug);
  if (!executor) {
    record(cfg.country, "live executor", false, "no executor");
    return;
  }
  try {
    const t0 = Date.now();
    const result = await executor(cfg.validFixture);
    const ms = Date.now() - t0;
    const output = result.output as Record<string, unknown>;
    const provenance = result.provenance as Record<string, unknown>;

    const companyName = String(output.company_name ?? "");
    const nameMatch = companyName.toLowerCase().includes(cfg.expectedCompanyName.toLowerCase());
    record(cfg.country, `live HTTP 200 in ${ms}ms`, true);
    record(cfg.country, `company_name contains '${cfg.expectedCompanyName}'`, nameMatch, `got: ${companyName.slice(0, 80)}`);

    // Tier 1. IT-Advanced reaches 7/7 via detailedLegalForm; all other
    // Openapi-routed countries are 6/7 with legal_form structurally null.
    const t1Fields = ["company_name", "registration_number", "country_code", "status", "registered_date", "registered_address"];
    const t1Populated = t1Fields.filter((f) => output[f] !== null && output[f] !== undefined && output[f] !== "");
    const legalFormPopulated = output.legal_form !== null && output.legal_form !== undefined && output.legal_form !== "";
    if (cfg.product === "it-advanced") {
      record(cfg.country, "T1 7/7 (legal_form via detailedLegalForm)", t1Populated.length === 6 && legalFormPopulated, `base ${t1Populated.length}/6, legal_form=${output.legal_form}`);
    } else {
      record(cfg.country, `T1 6/7 (legal_form null at non-IT products)`, t1Populated.length === 6, `${t1Populated.length}/6 (legal_form=${legalFormPopulated ? output.legal_form : "null✓"})`);
    }

    // Tier 2 output fields (vat_number, source_as_of)
    const t2OutputFields = ["vat_number", "source_as_of"];
    const t2OutputPopulated = t2OutputFields.filter((f) => output[f] !== null && output[f] !== undefined);
    record(cfg.country, `T2 output 2/2 (vat + source_as_of)`, t2OutputPopulated.length === 2, `${t2OutputPopulated.length}/2`);

    // Tier 2 provenance fields (source_register_name, authoritative).
    // Source label is product-aware: "Openapi.com WW-Top" / "...ES-Advanced" / etc.
    const provSourceOk = typeof provenance.source === "string" && provenance.source.startsWith("Openapi.com ");
    const provAuthOk = provenance.authoritative === false;
    record(cfg.country, "T2 provenance source-name + authoritative=false", provSourceOk && provAuthOk, `source=${provenance.source} authoritative=${provenance.authoritative}`);

    // Tier 3 — per-product field expectations.
    const t3Populated = cfg.expectedT3Fields.filter((f) => {
      const v = output[f];
      if (Array.isArray(v)) return v.length > 0;
      return v !== null && v !== undefined && v !== "";
    });
    const t3Denom = cfg.expectedT3Fields.length;
    record(
      cfg.country,
      `T3 ${t3Denom}/6 expected (${cfg.expectedT3Fields.join("+")})`,
      t3Populated.length === t3Denom,
      `populated: ${t3Populated.join(",")}`,
    );
    // IT-Advanced shareholders contract assertion: structurally present as
    // array; entries (when present) conform to canonical shape per Phase 2c.
    // Eni is widely-held → empty array; this validates structure not count.
    if (cfg.product === "it-advanced") {
      const sh = output.shareholders;
      const shStructuralOk = Array.isArray(sh);
      record(cfg.country, "shareholders structural=array (Phase 2c contract)", shStructuralOk, `len=${Array.isArray(sh) ? sh.length : "non-array"}`);
      // If the array is non-empty (e.g. for a closely-held entity in future
      // fixtures), validate the canonical shape on the first entry.
      if (shStructuralOk && Array.isArray(sh) && sh.length > 0) {
        const first = sh[0] as Record<string, unknown>;
        const hasType = first.type === "company" || first.type === "person";
        const hasName = typeof first.name === "string" && first.name.length > 0;
        const hasPct = typeof first.percent_share === "number";
        record(cfg.country, "shareholders[0] shape (type+name+percent_share)", hasType && hasName && hasPct, `type=${first.type} name=${String(first.name).slice(0,40)} pct=${first.percent_share}`);
      }
    }
  } catch (err) {
    record(cfg.country, "live HTTP call", false, String(err).slice(0, 200));
  }
}

console.error(`smoke-openapi-resolver: ${LIVE ? "LIVE mode (cost ~€1.28)" : "OFFLINE-ONLY mode"}`);

for (const cfg of COUNTRIES) {
  await runOfflineTests(cfg);
}

if (LIVE) {
  for (const cfg of COUNTRIES) {
    await runLiveTest(cfg);
  }
}

const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
console.error(`\n=== RESULT: ${passed} passed, ${failed} failed (${results.length} total) ===`);
if (failed > 0) {
  console.error("Failures:");
  for (const r of results.filter((x) => !x.passed)) {
    console.error(`  ${r.country} | ${r.test}${r.detail ? " | " + r.detail.slice(0, 150) : ""}`);
  }
  process.exit(1);
}
process.exit(0);
