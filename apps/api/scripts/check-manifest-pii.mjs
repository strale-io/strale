#!/usr/bin/env node
/**
 * Manifest PII guard — no real natural-person names in manifest examples.
 *
 * Background: the 2026-05-18 fixture audit
 * (`handoff/_general/from-code/2026-05-18-pii-fixture-audit-legal-representatives.md`)
 * swept `apps/api/tests/fixtures/tier-coverage/` and found it clean, then
 * surfaced an out-of-scope finding it could not fix: `manifests/*.yaml`
 * carried real board members and partners by name in
 * `output_schema.example`. Five manifests were affected — the audit spotted
 * two. It stayed unremediated for ~3 months.
 *
 * The root cause is structural, not a lapse. `scrubFixture()` and
 * `PII_ARRAY_FIELDS` in `capture-tier-fixtures.ts` run at CAPTURE time on
 * executor output. Manifests are hand-authored: an author pastes a real
 * response into `output_schema.example` to document the shape, and no
 * machinery ever looks at it. Fixing the five files does nothing about the
 * sixth.
 *
 * So this gate enforces the rule at authoring time: any PII-bearing array in
 * a manifest example must be empty, null, or carry an obviously-synthetic
 * placeholder. It deliberately does NOT try to decide whether a given string
 * "looks like a real person" — that is not decidable, and a heuristic that
 * guesses would either miss real names or block legitimate edits. Requiring
 * an explicit synthetic marker is checkable and unambiguous.
 *
 * Usage:
 *   node apps/api/scripts/check-manifest-pii.mjs           # report, exit 0
 *   node apps/api/scripts/check-manifest-pii.mjs --strict   # exit 1 on any finding
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const strict = process.argv.includes("--strict");
const MANIFEST_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../manifests");

/**
 * Keys whose values are natural persons. Mirrors PII_ARRAY_FIELDS in
 * capture-tier-fixtures.ts — keep the two in step.
 */
const PII_FIELDS = new Set([
  "directors",
  "partners",
  "legal_representatives",
  "officers",
  "former_officers",
  "beneficial_owners",
  "shareholders",
  "board_members",
  "ubos",
  "representatives",
  "managers",
  "signatories",
]);

/**
 * A value is acceptable if it is unmistakably not a real person. Placeholder
 * markers are matched in the languages the affected registries actually use,
 * so an author can keep the example in its native format.
 */
const SYNTHETIC = /\[REDACTED\]|\bEXAMPLE\b|\bEXEMPLE\b|\bEXEMPLO\b|\bEXEMPEL\b|\bESIMERKKI\b|\bBEISPIEL\b|\bPLACEHOLDER\b|\bJOHN DOE\b|\bJANE DOE\b|\bTEST\b/i;

/** Pull the human-readable name out of either a bare string or a {name} object. */
function nameOf(entry) {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && typeof entry.name === "string") return entry.name;
  return null;
}

/** Walk any nested structure, reporting populated PII arrays. */
function walk(node, path, out) {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${path}[${i}]`, out));
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    const here = path ? `${path}.${key}` : key;

    if (PII_FIELDS.has(key) && Array.isArray(value) && value.length > 0) {
      for (const entry of value) {
        const name = nameOf(entry);
        // A non-string entry carries no name we can check; a shape-only entry
        // (e.g. {type, role}) is fine.
        if (name && !SYNTHETIC.test(name)) {
          out.push({ path: here, name });
        }
      }
    }

    walk(value, here, out);
  }
}

const findings = [];

for (const file of readdirSync(MANIFEST_DIR).filter((f) => f.endsWith(".yaml"))) {
  let doc;
  try {
    doc = yaml.load(readFileSync(join(MANIFEST_DIR, file), "utf8"));
  } catch {
    continue; // malformed YAML is another gate's problem
  }
  if (!doc || typeof doc !== "object") continue;

  const found = [];
  // Only example/fixture surfaces carry values. `properties` blocks are type
  // declarations and never contain a person.
  walk(doc.output_schema?.example, "output_schema.example", found);
  walk(doc.test_fixtures, "test_fixtures", found);

  for (const f of found) findings.push({ slug: basename(file, ".yaml"), ...f });
}

if (findings.length === 0) {
  console.log("Manifest PII guard: clean — no unredacted person names in manifest examples.");
  process.exit(0);
}

console.log(
  `Manifest PII guard: ${findings.length} entr${findings.length === 1 ? "y" : "ies"} in a PII field look like real names.\n` +
    `Manifests are hand-authored and never pass through scrubFixture(), so an example pasted from a\n` +
    `live response ships real people's data. Replace with a placeholder that keeps the shape, e.g.\n` +
    `"EXEMPLE PREMIER DIRIGEANT (Administrateur)". Offenders:\n`,
);
for (const f of findings) {
  console.log(`  ${f.slug}: ${f.path} → ${JSON.stringify(f.name)}`);
}

process.exit(strict ? 1 : 0);
