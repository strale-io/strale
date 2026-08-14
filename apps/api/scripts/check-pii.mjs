#!/usr/bin/env node
/**
 * PII guard — real personal data must never sit in hand-authored examples.
 *
 * Formerly check-manifest-pii.mjs, scoped to manifests/*.yaml only. Renamed
 * and widened after the 2026-08-14 italian-company-stakeholders incident
 * (PR #135 / branch feat/phase-7a-it-stakeholders): the same live vendor
 * response — two named individuals with their codice fiscale, birth dates,
 * ages and birthplace — was pasted into BOTH
 * `manifests/italian-company-stakeholders.yaml` (output_schema.example) AND
 * `apps/api/scripts/smoke-it-stakeholders-mapper.ts` (a mocked-fetch smoke
 * fixture). This gate caught the manifest copy and failed the branch. The
 * manifest was scrubbed, CI went green, and the identical data shipped
 * unnoticed in scripts/ because nothing scanned that directory. The fix
 * satisfied the gate rather than the finding. See commit 8774fff for the
 * remediation and `handoff/_general/from-code/` for the incident writeup.
 *
 * Two independent detectors now run, on purpose kept separate rather than
 * unified, because they trade off false-positive risk differently:
 *
 * Detector 1 — PII_FIELDS name check (original, UNCHANGED, manifests/ only).
 * Manifest examples are a narrow, curated genre: an author documents a
 * capability's output shape under well-known keys (directors, officers,
 * shareholders, ...). Within that genre, "is this array populated with a
 * string that isn't an obvious placeholder" is a workable heuristic — the
 * field-key vocabulary is closed and the false-positive rate is low because
 * there's nothing else in a manifest that would trip it.
 *
 * Detector 2 — high-signal identifier scan (NEW, wider scope: manifests/,
 * apps/api/scripts/, apps/api/test/, apps/api/tests/, apps/api/coverage-matrix/,
 * archive/, audit-output/, handoff/, docs/, apps/api/docs/). This is where vendor
 * samples actually land in practice outside the manifest-authoring flow —
 * smoke scripts that mock fetch() with a captured response (exactly the
 * #135 pattern), session captures, audit notes, research docs. That genre
 * is NOT narrow: it's full of legitimate synthetic names ("MARIO ROSSI"),
 * real company names, code identifiers, and — per DEC-20260428-A — real
 * named company officers that a capability is *designed* to return in
 * production (public commercial-registry data). A name-shaped heuristic
 * applied to that genre would either miss real names or flag constantly on
 * legitimate content, and get disabled. See the docstring above PII_FIELDS
 * below for the fuller version of this argument; it is why this detector
 * deliberately does NOT match on names or field keys at all.
 *
 * Instead it matches on identifier FORMATS that are personal data on their
 * own, independent of context — the same point the incident's remediation
 * commit makes explicitly: "a codice fiscale encodes name, date and place
 * of birth, so it is personal data on its own — scrubbing display names
 * while leaving the CF would not have helped." Two formats, both gated by
 * their real checksum algorithm so a hand-typed shape-preserving synthetic
 * replacement (the correct way to scrub these, per commit 8774fff) does
 * NOT get flagged — only a value that is actually a valid instance of the
 * identifier does:
 *
 *   - Italian codice fiscale (16 chars, ISO check-letter algorithm).
 *     Verified against this incident's real values (both checksum-valid —
 *     not reproduced here; this file is itself in scope for this scanner)
 *     and their shape-preserving synthetic replacements from commit
 *     8774fff (RSSMRA70A01H501X, BNCGLI80A41H501X — both checksum-INVALID,
 *     because a hand-typed replacement doesn't recompute the check letter).
 *     This is the discriminator, not a name/word list. See
 *     apps/api/test/check-pii.test.ts for the regression test that pins
 *     both directions.
 *   - IBAN (mod-97 per ISO 7064), for the same reason — sepa-xml-validate,
 *     invoice-verify and similar capabilities plausibly leak a real
 *     customer/vendor IBAN into a future session capture the same way.
 *
 * Deliberately NOT covered: generic national-ID regexes beyond IT (every
 * other format either lacks a public checksum algorithm or collides too
 * often with unrelated numeric data — no real incident has surfaced one),
 * personal email addresses (indistinguishable from role/synthetic emails
 * without a name-shaped heuristic this detector avoids on purpose), and
 * phone numbers (arbitrary-looking digit strings, no checksum, very high
 * false-positive rate against fixture data in general). If one of these
 * becomes a real incident vector, add a checksum- or format-anchored
 * detector for that specific case rather than a generic regex.
 *
 * Escape hatch: apps/api/scripts/pii-identifier-allowlist.txt (one
 * `path|VALUE` pair per line) for the rare case where a checksum-valid
 * value is deliberately synthetic (e.g. a generated-but-valid test IBAN).
 * Verify by hand before adding — the checksum passing is exactly the
 * signal that it might be real. Real offenders should be fixed, not
 * allowlisted.
 *
 * Named individuals sourced from a statutorily-public register (company
 * officers, UBOs) are a real but genuinely ambiguous case this script does
 * NOT try to adjudicate — see the 2026-08-14 session report for the
 * archive/sessions/bosch-kyb-response-final*.json finding, flagged to a
 * human rather than auto-scrubbed.
 *
 * Usage:
 *   node apps/api/scripts/check-pii.mjs           # report, exit 0
 *   node apps/api/scripts/check-pii.mjs --strict   # exit 1 on any finding
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, basename, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const strict = process.argv.includes("--strict");
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const MANIFEST_DIR = join(REPO_ROOT, "manifests");

// ============================================================================
// Detector 1 — manifest PII-field name check (unchanged from check-manifest-pii.mjs)
// ============================================================================

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
function walkPiiFields(node, path, out) {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node)) {
    node.forEach((v, i) => walkPiiFields(v, `${path}[${i}]`, out));
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

    walkPiiFields(value, here, out);
  }
}

function runDetector1() {
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
    walkPiiFields(doc.output_schema?.example, "output_schema.example", found);
    walkPiiFields(doc.test_fixtures, "test_fixtures", found);

    for (const f of found) findings.push({ slug: basename(file, ".yaml"), kind: "name_field", ...f });
  }
  return findings;
}

// ============================================================================
// Detector 2 — high-signal identifier scan (new, wider scope)
// ============================================================================

const IDENTIFIER_SCAN_DIRS = [
  "manifests",
  "apps/api/scripts",
  "apps/api/test",
  "apps/api/tests",
  "apps/api/coverage-matrix",
  "archive",
  "audit-output",
  "handoff",
  "docs",
  "apps/api/docs",
];

const SCAN_EXTENSIONS = new Set([".ts", ".mjs", ".js", ".json", ".yaml", ".yml", ".md", ".txt"]);
const SKIP_DIR_NAMES = new Set(["node_modules", ".git", "dist", "build", "coverage"]);
// The allowlist itself legitimately contains literal checksum-valid values
// (that's the whole point) — never scan it against itself.
const SKIP_FILE_NAMES = new Set(["pii-identifier-allowlist.txt"]);

/** Italian codice fiscale: 6 letters, 2 digits, 1 letter, 2 digits, 1 letter, 3 digits, 1 check letter. */
const CF_PATTERN = /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/g;

const CF_ODD = {
  0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21,
  K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14,
  U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};
const CF_EVEN = {
  0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9,
  K: 10, L: 11, M: 12, N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19,
  U: 20, V: 21, W: 22, X: 23, Y: 24, Z: 25,
};

/**
 * Validates the real Italian codice fiscale check-letter algorithm.
 * A real (government-issued) CF always satisfies this; a hand-typed
 * shape-preserving synthetic replacement essentially never does (1/26
 * chance by coincidence) because scrubbing it doesn't recompute the digit.
 */
function cfChecksumValid(candidate) {
  if (!/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(candidate)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const c = candidate[i];
    sum += i % 2 === 0 ? CF_ODD[c] : CF_EVEN[c];
  }
  const expected = String.fromCharCode(65 + (sum % 26));
  return expected === candidate[15];
}

/** IBAN country codes actually in circulation (ISO 13616 registry, 2026). */
const IBAN_COUNTRY_CODES = new Set([
  "AD", "AE", "AL", "AT", "AZ", "BA", "BE", "BG", "BH", "BR", "BY", "CH", "CR", "CY", "CZ",
  "DE", "DK", "DO", "EE", "EG", "ES", "FI", "FO", "FR", "GB", "GE", "GI", "GL", "GR", "GT",
  "HR", "HU", "IE", "IL", "IQ", "IS", "IT", "JO", "KW", "KZ", "LB", "LC", "LI", "LT", "LU",
  "LV", "LY", "MC", "MD", "ME", "MK", "MR", "MT", "MU", "NL", "NO", "PK", "PL", "PS", "PT",
  "QA", "RO", "RS", "SA", "SC", "SE", "SI", "SK", "SM", "ST", "SV", "TL", "TN", "TR", "UA",
  "VA", "VG", "XK",
]);

const IBAN_PATTERN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;

/** ISO 7064 mod-97-10 IBAN checksum. Real IBANs always satisfy this. */
function ibanChecksumValid(candidate) {
  if (candidate.length < 15 || candidate.length > 34) return false;
  if (!IBAN_COUNTRY_CODES.has(candidate.slice(0, 2))) return false;
  const rearranged = candidate.slice(4) + candidate.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (c) => (c.charCodeAt(0) - 55).toString());
  if (!/^\d+$/.test(expanded)) return false;
  // mod-97 over an arbitrary-length numeral, computed in chunks to avoid
  // BigInt-vs-Number precision issues on the longest IBANs.
  let remainder = 0;
  for (let i = 0; i < expanded.length; i += 7) {
    remainder = Number(`${remainder}${expanded.slice(i, i + 7)}`) % 97;
  }
  return remainder === 1;
}

/** Load the escape-hatch allowlist: Map<relPath, Set<value>>. */
function loadIdentifierAllowlist() {
  const path = join(dirname(fileURLToPath(import.meta.url)), "pii-identifier-allowlist.txt");
  const map = new Map();
  if (!existsSync(path)) return map;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [relPath, value] = trimmed.split("|");
    if (!relPath || !value) continue;
    if (!map.has(relPath)) map.set(relPath, new Set());
    map.get(relPath).add(value);
  }
  return map;
}

/** Recursively list files under `dir` with an allowed extension. */
function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isDirectory()) continue;
    // `parentPath` landed in Node 20.12; `path` is its older, deprecated
    // name on earlier 20.x. package.json declares >=20.0.0, so both are
    // live fallbacks here, not dead code.
    const entryDir = entry.parentPath ?? entry.path ?? dir;
    if (entryDir.split(/[\\/]/).some((segment) => SKIP_DIR_NAMES.has(segment))) continue;
    if (SKIP_FILE_NAMES.has(entry.name)) continue;
    if (!SCAN_EXTENSIONS.has(extname(entry.name))) continue;
    out.push(join(entryDir, entry.name));
  }
  return out;
}

/** Mask a matched identifier for safe printing — never echo the real value into CI logs. */
function mask(value) {
  if (value.length <= 6) return "*".repeat(value.length);
  return `${value.slice(0, 3)}${"*".repeat(value.length - 5)}${value.slice(-2)}`;
}

// One entry per identifier format Detector 2 knows about. Adding a future
// high-signal format (see the "deliberately NOT covered" note in the header)
// means adding a row here, not a new loop.
const IDENTIFIER_KINDS = [
  { kind: "codice_fiscale", pattern: CF_PATTERN, checksumValid: cfChecksumValid },
  { kind: "iban", pattern: IBAN_PATTERN, checksumValid: ibanChecksumValid },
];

function runDetector2() {
  const allowlist = loadIdentifierAllowlist();
  const findings = [];

  for (const scanDir of IDENTIFIER_SCAN_DIRS) {
    const files = listFiles(join(REPO_ROOT, scanDir));
    for (const filePath of files) {
      let text;
      try {
        text = readFileSync(filePath, "utf8");
      } catch {
        continue;
      }
      const relPath = relative(REPO_ROOT, filePath).replace(/\\/g, "/");
      const exempt = allowlist.get(relPath) ?? new Set();

      for (const { kind, pattern, checksumValid } of IDENTIFIER_KINDS) {
        for (const match of text.matchAll(pattern)) {
          const value = match[0];
          if (exempt.has(value) || !checksumValid(value)) continue;
          const line = text.slice(0, match.index).split("\n").length;
          findings.push({ kind, file: relPath, line, masked: mask(value) });
        }
      }
    }
  }

  return findings;
}

// ============================================================================
// Report
// ============================================================================

const d1 = runDetector1();
const d2 = runDetector2();
const total = d1.length + d2.length;

if (total === 0) {
  console.log("PII guard: clean — no unredacted person names or checksum-valid identifiers found.");
  process.exit(0);
}

if (d1.length > 0) {
  console.log(
    `PII guard: ${d1.length} entr${d1.length === 1 ? "y" : "ies"} in a manifest PII field look like real names.\n` +
      `Manifests are hand-authored and never pass through scrubFixture(), so an example pasted from a\n` +
      `live response ships real people's data. Replace with a placeholder that keeps the shape, e.g.\n` +
      `"EXEMPLE PREMIER DIRIGEANT (Administrateur)". Offenders:\n`,
  );
  for (const f of d1) console.log(`  ${f.slug}: ${f.path} → ${JSON.stringify(f.name)}`);
}

if (d2.length > 0) {
  if (d1.length > 0) console.log("");
  console.log(
    `PII guard: ${d2.length} checksum-valid identifier${d2.length === 1 ? "" : "s"} found by the identifier\n` +
      `scan — a codice fiscale or IBAN carries personal data on its own, regardless of which JSON/YAML key\n` +
      `it sits under or whether Detector 1's name check already passed (see the incident background in\n` +
      `this script's header). Replace with a shape-preserving value that does NOT recompute the check\n` +
      `digit (e.g. RSSMRA70A01H501X for a CF, matching field-name length/format for an IBAN) so the\n` +
      `fixture still exercises real code paths.\n` +
      `If a match here is genuinely synthetic and checksum-valid on purpose, add it to\n` +
      `apps/api/scripts/pii-identifier-allowlist.txt with a comment explaining why. Offenders:\n`,
  );
  for (const f of d2) console.log(`  ${f.file}:${f.line} → ${f.kind} (${f.masked})`);
}

process.exit(strict ? 1 : 0);
