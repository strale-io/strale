#!/usr/bin/env node
/**
 * Canonical-input sentinel — DEC-20260513-D Phase 3 Harden gate (a).
 *
 * Pairs with:
 *   - guaranteed-fields-sentinel.ts (runtime, lib/) — catches missing-key
 *     parser bugs at scheduler-tick time. v2 of PR #109.
 *   - check-manifest-guaranteed-consistency.mjs (static, this dir) —
 *     DEC-20260513-D Phase 3 Harden gate (b) — catches authorship-time
 *     drift between output_field_reliability.guaranteed and output_schema.
 *
 * What this gate catches that the other two miss:
 *   The 2026-05-13 GR bad-fixture case (PR #116). The known_answer.input
 *   `gemi_number 000237954001` resolved to a Lamia branch of National
 *   Bank of Greece (is_branch=true). GEMI does not publish directors or
 *   industry_code for branch records, so the response carried empty
 *   directors=[] and null industry_code. The runtime guaranteed-fields
 *   sentinel passed (every guaranteed key was present, just empty), and
 *   the static manifest-consistency gate passed (every guaranteed field
 *   was enumerated in output_schema). The manifest's expected_fields
 *   faithfully encoded the branch shape with `is_branch equals true` —
 *   a textbook bad-shape fixture that no existing gate caught because
 *   nothing checked the *content* of the assertions for canonical
 *   well-shape.
 *
 * What this gate asserts (v1 criteria, kept tight — see prompt context):
 *   1. is_branch: any equals-assertion on is_branch must NOT be true.
 *      Direct catch for the GR original-fixture failure mode.
 *   2. status: any equals-assertion on status must be in the per-country
 *      "active" set. SI exempt (data.gov.si CKAN does not publish status
 *      per DEC-20260513-F + audit matrix §2 SI structural source gap).
 *   3. name: manifest's known_answer.expected_fields must include at
 *      least one assertion on a recognised name field (company_name /
 *      entity_name / etc.). Basic sanity.
 *   4. regnum input regex: the known_answer.input must contain at least
 *      one identifier-shaped field whose value matches the country's
 *      canonical regex. Catches identifier-shape errors at fixture-set
 *      time (CHE-PR-#107 was an entity-doesn't-exist case, not a shape
 *      error, but the regex check is cheap and defensive).
 *
 * Out of scope for v1:
 *   - directors-must-be-asserted check: would surface ~14 of 20 manifests
 *     as not currently asserting directors, none of which is a real bug.
 *     The runtime sentinel + canary cadence catches director regressions
 *     in production. v1.1 if pattern proves valuable.
 *   - Calling public registers at CI time (e.g., GEMI public search to
 *     confirm the fixture entity still exists and is active). The audit
 *     established a clean baseline 2026-05-13; entity drift at the source
 *     register surfaces via canary cadence + runtime sentinel.
 *   - Non-Identity capabilities. Criteria are country-specific. The
 *     IDENTITY_SLUGS constant scopes the gate to the 20 shipped Identity
 *     capabilities (the v1 Identity Coverage Matrix cohort per
 *     DEC-20260513-F).
 *
 * Pattern mirrors check-manifest-guaranteed-consistency.mjs. Two modes:
 *   default    — print findings + exit 0 (informational)
 *   --strict   — exit 1 if any new offenders appear vs the allowlist
 *
 * Allowlist: scripts/identity-fixture-shape-allowlist.txt (one slug per
 * line). Expected empty at v1 ship — the 2026-05-13 audit verified all
 * 20 Identity fixtures are well-shaped. Allowlist exists for the same
 * reason its sibling does: future violations during transitional fixes
 * can be grandfathered while their per-manifest fix lands.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..");
const manifestsDir = resolve(repoRoot, "manifests");
const allowlistPath = resolve(__dirname, "identity-fixture-shape-allowlist.txt");
const strict = process.argv.includes("--strict");

// The 20 shipped Identity capabilities per DEC-20260513-F. Update on
// future ships of Identity capabilities (IT/ES/PT/AT/NL/BG/CY/HU/LU/MT/RO
// would join here once they leave mid-rebuild / Openapi-gated status).
const IDENTITY_SLUGS = new Set([
  "swedish-company-data", "norwegian-company-data", "danish-company-data",
  "finnish-company-data", "uk-company-data", "irish-company-data",
  "french-company-data", "belgian-company-data", "cz-company-data",
  "estonian-company-data", "polish-company-data", "latvian-company-data",
  "lithuanian-company-data", "slovak-company-data", "slovenian-company-data",
  "croatian-company-data", "greek-company-data", "swiss-company-data",
  "singapore-company-data", "german-company-data",
]);

// Canonical-active status values per country. equals-assertions on the
// `status` field whose value isn't in this set are flagged. Drawn from
// each manifest's output_schema.example + observed canary responses.
// SI is in PER_SLUG_EXEMPTIONS — its source register does not publish
// status at all, so the manifest has no status assertion.
const ACTIVE_STATUS_VALUES = new Set([
  "active",                                 // SE, BE, SK, HR, GR, and most
  "ACTIVE",                                 // CH (Zefix uppercase)
  "Normal",                                 // IE (CRO)
  "Registered",                             // SG (ACRA)
  "Reģistrēts",                             // LV (CKAN)
  "Teisinis statusas neįregistruotas",      // LT (legal-proceedings status,
                                            // which paradoxically means
                                            // "active" — per LT manifest
                                            // example + is_active=true)
]);

// Recognised name-field keys. Any expected_field whose `field` is one of
// these counts as a name-presence assertion.
const NAME_FIELDS = new Set([
  "company_name",      // most
  "entity_name",       // SG (ACRA dataset)
  "name",              // generic fallback
]);

// Per-country canonical input regex. Keyed by Identity capability slug.
// Each entry has the input field name(s) checked + the regex that the
// known_answer.input value must match. Drawn from each manifest's
// input_schema descriptions + the 2026-05-13 audit's fixture-validation
// pass. Identifier values inside the regex are the source registers'
// own canonical formats.
const INPUT_REGEX_BY_SLUG = {
  "swedish-company-data":    { fields: ["org_number"],      regex: /^\d{6}-\d{4}$/ },
  "norwegian-company-data":  { fields: ["org_number"],      regex: /^\d{9}$/ },
  "danish-company-data":     { fields: ["cvr_number"],      regex: /^\d{8}$/ },
  "finnish-company-data":    { fields: ["business_id"],     regex: /^\d{7}-\d$/ },
  "uk-company-data":         { fields: ["company_number"],  regex: /^[A-Z0-9]{8}$/ },
  "irish-company-data":      { fields: ["cro_number"],      regex: /^\d{4,7}$/ },
  "french-company-data":     { fields: ["siren"],           regex: /^\d{9}(\d{5})?$/ },
  "belgian-company-data":    { fields: ["enterprise_number"], regex: /^\d{10}$/ },
  "cz-company-data":         { fields: ["ico"],             regex: /^\d{8}$/ },
  "estonian-company-data":   { fields: ["registry_code"],   regex: /^\d{8}$/ },
  "polish-company-data":     { fields: ["krs_number"],      regex: /^\d{10}$/ },
  "latvian-company-data":    { fields: ["reg_number"],      regex: /^\d{11}$/ },
  "lithuanian-company-data": { fields: ["company_code"],    regex: /^\d{7,9}$/ },
  "slovak-company-data":     { fields: ["ico"],             regex: /^\d{8}$/ },
  "slovenian-company-data":  { fields: ["reg_number"],      regex: /^\d{7,10}$/ },
  "croatian-company-data":   { fields: ["oib"],             regex: /^\d{11}$/ },
  "greek-company-data":      { fields: ["gemi_number"],     regex: /^\d{6,14}$/ },
  "swiss-company-data":      { fields: ["uid"],             regex: /^CHE-\d{3}\.\d{3}\.\d{3}$/ },
  "singapore-company-data":  { fields: ["uen"],             regex: /^\d{9}[A-Z]$/ },
  // DE accepts multiple input shapes (company_id, hrb_number+court, or
  // company_name fuzzy). The current fixture uses company_name "SAP SE".
  // Treat company_name as a free-text input, exempt from numeric-regex
  // shape checks. The runtime sentinel catches DE response-shape bugs.
  "german-company-data":     { fields: ["company_name", "company_id", "hrb_number"], regex: null },
};

// Per-slug exemptions to specific criteria. The `reason` field MUST cite
// a DEC for traceability. Future exemptions without a DEC reference are
// the kind of pipeline-bypass that gate (b) catches; if a manifest needs
// an exemption here, the chat-driven DEC must land first.
const PER_SLUG_EXEMPTIONS = {
  "slovenian-company-data": {
    criteria: ["status"],
    reason: "data.gov.si CKAN does not publish status (DEC-20260513-F + audit matrix §2 SI structural source gap)",
  },
};

function loadAllowlist() {
  if (!existsSync(allowlistPath)) return new Set();
  return new Set(
    readFileSync(allowlistPath, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#")),
  );
}

function isExempt(slug, criterion) {
  const ex = PER_SLUG_EXEMPTIONS[slug];
  if (!ex) return false;
  return ex.criteria.includes(criterion);
}

function findExpectedField(expectedFields, fieldName, operator) {
  if (!Array.isArray(expectedFields)) return null;
  return expectedFields.find(
    (ef) => ef && ef.field === fieldName && (operator ? ef.operator === operator : true),
  );
}

function checkIsBranch(manifest, findings) {
  const expectedFields = manifest.test_fixtures?.known_answer?.expected_fields;
  const ef = findExpectedField(expectedFields, "is_branch", "equals");
  if (!ef) return; // No assertion on is_branch — fine, only ~GR has the concept.
  if (ef.value === true || ef.value === "true") {
    findings.push({
      criterion: "is_branch",
      detail: `known_answer.expected_fields asserts is_branch equals true — fixture must reference a parent entity, not a branch (DEC-20260513-F)`,
    });
  }
}

function checkStatus(manifest, findings) {
  if (isExempt(manifest.slug, "status")) return;
  const expectedFields = manifest.test_fixtures?.known_answer?.expected_fields;
  const ef = findExpectedField(expectedFields, "status", "equals");
  if (!ef) return; // No equals-assertion on status — `not_null` is fine.
  if (!ACTIVE_STATUS_VALUES.has(ef.value)) {
    findings.push({
      criterion: "status",
      detail: `known_answer.expected_fields asserts status equals "${ef.value}" — must be one of ACTIVE_STATUS_VALUES (fixture should reference an active entity)`,
    });
  }
}

function checkNameField(manifest, findings) {
  const expectedFields = manifest.test_fixtures?.known_answer?.expected_fields;
  if (!Array.isArray(expectedFields)) {
    findings.push({
      criterion: "name",
      detail: "known_answer.expected_fields missing entirely — cannot verify name-field presence",
    });
    return;
  }
  const hasName = expectedFields.some(
    (ef) => ef && NAME_FIELDS.has(ef.field),
  );
  if (!hasName) {
    findings.push({
      criterion: "name",
      detail: `known_answer.expected_fields has no assertion on a recognised name field (one of: ${[...NAME_FIELDS].join(", ")})`,
    });
  }
}

function checkInputRegex(manifest, findings) {
  const cfg = INPUT_REGEX_BY_SLUG[manifest.slug];
  if (!cfg) return; // No regex defined for this slug.
  if (cfg.regex === null) return; // Free-text input, regex check skipped.
  const input = manifest.test_fixtures?.known_answer?.input;
  if (!input || typeof input !== "object") {
    findings.push({
      criterion: "input_regex",
      detail: "known_answer.input missing entirely — cannot verify identifier shape",
    });
    return;
  }
  const matched = cfg.fields.some((f) => {
    const v = input[f];
    if (typeof v !== "string") return false;
    return cfg.regex.test(v);
  });
  if (!matched) {
    findings.push({
      criterion: "input_regex",
      detail: `known_answer.input has no field in {${cfg.fields.join(", ")}} whose value matches canonical regex ${cfg.regex}`,
    });
  }
}

function scan() {
  if (!existsSync(manifestsDir)) {
    console.error(`manifests directory not found: ${manifestsDir}`);
    process.exit(2);
  }

  const files = readdirSync(manifestsDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const violations = [];

  for (const file of files) {
    let manifest;
    try {
      manifest = yaml.load(readFileSync(resolve(manifestsDir, file), "utf8"));
    } catch (err) {
      // Malformed YAML is a different gate's problem (validate-capability).
      continue;
    }
    if (!manifest || typeof manifest !== "object") continue;
    if (!manifest.slug || !IDENTITY_SLUGS.has(manifest.slug)) continue;

    const findings = [];
    checkIsBranch(manifest, findings);
    checkStatus(manifest, findings);
    checkNameField(manifest, findings);
    checkInputRegex(manifest, findings);

    if (findings.length > 0) {
      violations.push({ slug: manifest.slug, file, findings });
    }
  }

  return violations;
}

const violations = scan();
const allowed = loadAllowlist();
const newViolations = violations.filter((v) => !allowed.has(v.slug));

console.log(
  `identity fixture-shape sentinel: ${violations.length} total, ${newViolations.length} not in allowlist`,
);

if (newViolations.length > 0) {
  console.log("\nNew violations (not in allowlist):");
  for (const v of newViolations) {
    console.log(`  ${v.slug} (${v.file}):`);
    for (const f of v.findings) {
      console.log(`    - [${f.criterion}] ${f.detail}`);
    }
  }
}

if (strict && newViolations.length > 0) {
  console.error(
    "\nIdentity fixture-shape sentinel found new violations. Each must be " +
      "resolved by editing the offending manifest's test_fixtures.known_answer " +
      "(swap fixture to a well-shaped entity) OR by adding the slug to the " +
      "allowlist with a DEC-referenced rationale comment. See " +
      "scripts/check-identity-fixture-shape.mjs header for the gate's criteria.",
  );
  process.exit(1);
}
