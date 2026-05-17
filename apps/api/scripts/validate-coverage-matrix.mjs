#!/usr/bin/env node
/**
 * Validate every apps/api/coverage-matrix/*.yaml against schema.json.
 *
 * Fourth structural CI gate alongside check-tier-coverage.mjs (PR #125),
 * check-manifest-guaranteed-consistency.mjs, check-fetch-timeout-coverage.mjs,
 * check-no-bare-catch.mjs.
 *
 * Two reads per file:
 *   1. JSON-Schema validation via Ajv (kebab-case slug pattern, enum checks,
 *      additionalProperties: false, type checks).
 *   2. Filename-content alignment: the filename
 *      `{capability_slug}__{country_lc}__{evidence_type_slug}.yaml` must
 *      mechanically derive from the YAML fields. Catches the class of bug
 *      where someone hand-edits one without re-running the regenerator.
 *
 * Exit codes: 0 clean, 2 violations (with per-file detail).
 *
 * Pattern mirrors check-manifest-guaranteed-consistency.mjs. See
 * apps/api/coverage-matrix/README.md for the canonical-source contract.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..");
const matrixDir = resolve(repoRoot, "apps", "api", "coverage-matrix");
const schemaPath = resolve(matrixDir, "schema.json");

const EVIDENCE_TYPE_SLUG = {
  "Company registry": "company-registry",
  "VAT": "vat",
  "LEI": "lei",
  "Sanctions / PEP": "sanctions-pep",
  "IBAN / name match": "iban-name-match",
  "Beneficial ownership": "beneficial-ownership",
  "Address / other": "address-other",
  "Adverse media": "adverse-media",
  "Litigation / bankruptcy": "litigation-bankruptcy",
  "EIN / Tax ID": "ein-tax-id",
};

function countryLc(c) {
  if (c === "EU-wide") return "eu-wide";
  if (c === "Global") return "global";
  return c.toLowerCase();
}

function main() {
  if (!existsSync(matrixDir)) {
    console.error(`coverage-matrix directory not found: ${matrixDir}`);
    process.exit(2);
  }
  if (!existsSync(schemaPath)) {
    console.error(`schema.json not found: ${schemaPath}`);
    process.exit(2);
  }

  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  // Convention is .yaml only; .yml would fail filename-alignment anyway
  // (the validator builds expectedFilename with .yaml). Filter the same way
  // the summary script does.
  const files = readdirSync(matrixDir)
    .filter((f) => f.endsWith(".yaml"))
    .sort();

  let violations = 0;
  for (const file of files) {
    const fullPath = resolve(matrixDir, file);
    let parsed;
    try {
      parsed = yaml.load(readFileSync(fullPath, "utf8"));
    } catch (err) {
      console.error(`${fullPath}: YAML parse error — ${err.message}`);
      violations++;
      continue;
    }
    if (!parsed || typeof parsed !== "object") {
      console.error(`${fullPath}: parsed to non-object`);
      violations++;
      continue;
    }

    // (1) JSON-Schema validation.
    const ok = validate(parsed);
    if (!ok) {
      console.error(`${fullPath}: schema violations:`);
      for (const e of validate.errors) {
        console.error(`  ${e.instancePath || "(root)"} ${e.message}`);
      }
      violations++;
      continue;
    }

    // (2) Filename-content alignment.
    const expectedEt = EVIDENCE_TYPE_SLUG[parsed.evidence_type];
    if (!expectedEt) {
      console.error(`${fullPath}: unknown evidence_type "${parsed.evidence_type}" — extend EVIDENCE_TYPE_SLUG`);
      violations++;
      continue;
    }
    const expectedFilename = `${parsed.capability_slug}__${countryLc(parsed.country)}__${expectedEt}.yaml`;
    if (basename(file) !== expectedFilename) {
      console.error(`${fullPath}: filename mismatch — expected ${expectedFilename} from (slug=${parsed.capability_slug}, country=${parsed.country}, evidence_type=${parsed.evidence_type})`);
      violations++;
    }
  }

  console.log(
    `coverage-matrix: ${files.length} file(s) scanned, ${violations} violation(s)`,
  );
  if (violations > 0) process.exit(2);
}

main();
