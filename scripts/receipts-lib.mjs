// Pure functions behind the T15 evidence-receipt contract
// (archive/receipts/*.json). Spec:
// archive/sessions/2026-09-02-t15-receipts-and-migration-ledger-plan.md
//
// Mirrors research-lib.mjs / program-tracks-lib.mjs: Ajv 2020 schema
// validation for structure, hand-written checks for relations a schema
// cannot see — immutability (a git fact, not a schema property) and
// dangling evidence paths cited from decision records, program tracks, and
// remediation packages.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";
import {
  classifyRepoPath,
  isCalendarDate,
  listRegisters,
  loadRegister,
  repoRootFrom,
  trackedFiles,
} from "./program-tracks-lib.mjs";
import { isDirectInvocation, parseFrontMatter } from "./research-lib.mjs";

export { classifyRepoPath, isDirectInvocation, repoRootFrom, trackedFiles };

export const RECEIPTS_DIR = "archive/receipts";
export const SCHEMA_PATH = "archive/receipts/receipt.schema.json";
export const README_PATH = "archive/receipts/README.md";
export const DECISIONS_DIR = "docs/decisions/records";
export const REMEDIATION_PACKAGES_DIR = "docs/remediation/packages";
export const HANDOFF_DIR = "handoff/_general";
// Bare test counts stated in a handoff dated on/after this day must carry a
// receipt link — the day the T15 plan (and the receipt contract) landed.
export const HANDOFF_WARN_FROM = "2026-09-02";

const FILENAME_PATTERN = /^(\d{4}-\d{2}-\d{2})-(test-run|sweep|audit|check)-([a-z0-9][a-z0-9-]*)\.json$/;
const KIND_ENUM = new Set(["test-run", "sweep", "audit", "check"]);
const SHA_PATH_REF = /^([0-9a-f]{7,40}):(.+)$/i;
// owner/repo@sha or owner/repo@sha:path — a reference into a DIFFERENT
// repository (e.g. "codex/repo-native-operating-model@b295109...:manifest.json"),
// not this checkout. Not locally resolvable; accepted as-is.
const CROSS_REPO_REF = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{7,40}(?::.+)?$/i;
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const TEST_COUNT_PATTERN = /\b\d+\s+tests?\b/i;
const PASS_RATIO_PATTERN = /\b\d+\/\d+\s+pass/i;
const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})-/;

export function loadSchema(root) {
  return JSON.parse(readFileSync(resolve(root, SCHEMA_PATH), "utf8"));
}

/** File names under archive/receipts/ ending in .json, excluding the schema itself. */
export function listReceiptFiles(root) {
  const dir = resolve(root, RECEIPTS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".json") && d.name !== "receipt.schema.json")
    .map((d) => d.name)
    .sort();
}

/**
 * Loads every archive/receipts/*.json file. Returns
 * { file, name, metadata: null|object, error: null|string } per file — a
 * parse error is captured as a finding, not thrown, so one broken file
 * doesn't stop the whole check.
 */
export function loadReceiptFiles(root) {
  return listReceiptFiles(root).map((name) => {
    const file = `${RECEIPTS_DIR}/${name}`;
    try {
      const metadata = JSON.parse(readFileSync(resolve(root, file), "utf8"));
      return { file, name, metadata, error: null };
    } catch (err) {
      return { file, name, metadata: null, error: err.message };
    }
  });
}

/**
 * Validates one receipt's JSON body against the schema. Returns a list of
 * finding strings (empty means valid).
 */
export function validateReceiptSchema(metadata, schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (validate(metadata)) return [];
  return (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message}`);
}

/** Full per-file structural check: filename shape, schema, filename/body kind agreement. */
export function checkReceiptFile(record, { schema }) {
  const findings = [];
  const add = (code, detail) => findings.push({ code, file: record.file, detail });

  const nameMatch = FILENAME_PATTERN.exec(record.name);
  if (!nameMatch) {
    add(
      "RECEIPT_FILENAME_INVALID",
      `${record.name} does not match YYYY-MM-DD-<kind>-<topic>.json (kind one of ${[...KIND_ENUM].join("/")})`,
    );
  } else if (!isCalendarDate(nameMatch[1])) {
    add("RECEIPT_FILENAME_INVALID", `${record.name}: "${nameMatch[1]}" is not a real calendar date`);
  }

  if (record.error) {
    add("RECEIPT_JSON_INVALID", record.error);
    return findings; // nothing else to check without parsed JSON
  }

  const schemaErrors = validateReceiptSchema(record.metadata, schema);
  for (const e of schemaErrors) add("RECEIPT_SCHEMA_INVALID", e);
  if (schemaErrors.length > 0) return findings;

  if (nameMatch && record.metadata.kind !== nameMatch[2]) {
    add(
      "RECEIPT_KIND_MISMATCH",
      `filename says kind "${nameMatch[2]}" but the JSON body's kind is "${record.metadata.kind}"`,
    );
  }

  return findings;
}

function gitOutput(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

/** True when `ref` resolves to a real commit in `root`'s repo. */
function commitResolves(root, ref) {
  try {
    gitOutput(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * For every tracked archive/receipts/*.json file, finds the commit that
 * first added it and compares the blob at that commit to the blob at HEAD.
 * A mismatch means the receipt was edited after being committed — the
 * immutability rule broken. A receipt with no introduction commit (new,
 * untracked, or staged-but-uncommitted) is not yet subject to the rule.
 */
export function findMutatedReceipts(root, tracked) {
  const findings = [];
  for (const name of listReceiptFiles(root)) {
    const path = `${RECEIPTS_DIR}/${name}`;
    if (tracked && !tracked.has(path)) continue; // uncommitted new receipt: fine

    let introShas;
    try {
      introShas = gitOutput(root, ["log", "--diff-filter=A", "--follow", "--format=%H", "--reverse", "--", path])
        .split("\n")
        .filter(Boolean);
    } catch {
      introShas = [];
    }
    if (introShas.length === 0) continue; // never committed: fine

    const introSha = introShas[0];
    let introBlob;
    let headBlob;
    try {
      introBlob = gitOutput(root, ["rev-parse", `${introSha}:${path}`]);
      headBlob = gitOutput(root, ["rev-parse", `HEAD:${path}`]);
    } catch (err) {
      findings.push({
        code: "RECEIPT_HISTORY_UNREADABLE",
        file: path,
        detail: `could not read git history for this receipt: ${err.message}`,
      });
      continue;
    }
    if (introBlob !== headBlob) {
      findings.push({
        code: "RECEIPT_MUTATED",
        file: path,
        detail: `content at HEAD differs from the content in ${introSha.slice(0, 12)}, the commit that first added it — receipts are never edited; write a new one instead`,
      });
    }
  }
  return findings;
}

/**
 * True for a whitespace-free string that is a plausible repo-path-or-reference
 * candidate: contains a slash, is a `<sha>:<path>` reference, or is a bare
 * root-level file name with an extension (`CLAUDE.md`, `package.json`). A
 * bare identifier such as `DEC-20260302-A` is not a path and is left alone.
 * (Independent review of PR #490: the first version exempted every bare
 * file name, so `CLAUDE.md` and a misspelt one were never checked.)
 */
const BARE_FILE_NAME = /^[A-Za-z0-9_.-]+\.[A-Za-z0-9]{1,8}$/;
export function isBarePathCandidate(value) {
  if (typeof value !== "string" || value.length === 0 || /\s/.test(value)) return false;
  return value.includes("/") || SHA_PATH_REF.test(value) || BARE_FILE_NAME.test(value);
}

/**
 * Classifies one evidence string: OK (resolves, or is a URL, or is a valid
 * `<sha>:<path>` reference), or a problem code. Strings that don't look
 * like a bare path/reference (contain whitespace — i.e. prose) are OK: this
 * check only ever flags something that was clearly meant as a path.
 */
export function classifyEvidenceReference(root, value, tracked) {
  if (!isBarePathCandidate(value)) return "OK";
  if (CROSS_REPO_REF.test(value)) return "OK";

  const shaMatch = SHA_PATH_REF.exec(value);
  if (shaMatch) {
    const [, sha, path] = shaMatch;
    if (!commitResolves(root, sha)) return "SHA_UNRESOLVED";
    try {
      gitOutput(root, ["cat-file", "-e", `${sha}:${path}`]);
      return "OK";
    } catch {
      return "MISSING_AT_SHA";
    }
  }

  if (URL_SCHEME.test(value)) return "OK";

  return classifyRepoPath(root, value, tracked);
}

/** Recursively finds every `evidence` / `production_evidence` field anywhere in a parsed YAML/JSON value. */
export function findEvidenceLikeFields(value, path = "") {
  const out = [];
  if (Array.isArray(value)) {
    value.forEach((item, i) => out.push(...findEvidenceLikeFields(item, `${path}[${i}]`)));
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (key === "evidence" || key === "production_evidence") {
        out.push({ path: nextPath, value: v });
      } else {
        out.push(...findEvidenceLikeFields(v, nextPath));
      }
    }
  }
  return out;
}

/** String leaves under one evidence-like field's value (handles scalar / array / object-of-strings). */
function stringLeaves(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string");
  if (value && typeof value === "object") return Object.values(value).filter((v) => typeof v === "string");
  return [];
}

/** Dangling evidence paths cited in docs/decisions/records/*.md front matter. */
export function findDanglingDecisionEvidence(root, tracked) {
  const findings = [];
  const dir = resolve(root, DECISIONS_DIR);
  if (!existsSync(dir)) return findings;
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const file = `${DECISIONS_DIR}/${name}`;
    let metadata;
    try {
      ({ metadata } = parseFrontMatter(readFileSync(resolve(root, file), "utf8")));
    } catch {
      continue; // decision-records-lib's own checker owns malformed front matter
    }
    for (const ev of metadata.evidence ?? []) {
      if (typeof ev !== "string") continue;
      const problem = classifyEvidenceReference(root, ev, tracked);
      if (problem !== "OK") {
        findings.push({
          code: "DANGLING_EVIDENCE",
          file,
          detail: `evidence entry "${ev}" is ${problem} — fix: correct the path, or drop the entry`,
        });
      }
    }
  }
  return findings;
}

/** Dangling evidence paths cited in each docs/programs/<program>/tracks.yaml track row. */
export function findDanglingTrackEvidence(root, tracked) {
  const findings = [];
  for (const rel of listRegisters(root)) {
    let register;
    try {
      register = loadRegister(root, rel);
    } catch {
      continue; // program-tracks-lib's own checker owns malformed registers
    }
    for (const t of register.tracks ?? []) {
      for (const ev of t.evidence ?? []) {
        if (typeof ev !== "string") continue;
        const problem = classifyEvidenceReference(root, ev, tracked);
        if (problem !== "OK") {
          findings.push({
            code: "DANGLING_EVIDENCE",
            file: rel,
            detail: `${t.id}: evidence entry "${ev}" is ${problem} — fix: correct the path, or drop the entry`,
          });
        }
      }
    }
  }
  return findings;
}

/** Dangling evidence paths cited anywhere in docs/remediation/packages/WP*.yaml (evidence / production_evidence fields, any depth). */
export function findDanglingRemediationEvidence(root, tracked) {
  const findings = [];
  const dir = resolve(root, REMEDIATION_PACKAGES_DIR);
  if (!existsSync(dir)) return findings;
  for (const name of readdirSync(dir).filter((f) => /^WP.*\.yaml$/.test(f))) {
    const file = `${REMEDIATION_PACKAGES_DIR}/${name}`;
    let doc;
    try {
      doc = parseYaml(readFileSync(resolve(root, file), "utf8"));
    } catch {
      continue; // not this checker's job to validate remediation package YAML shape
    }
    for (const { path: fieldPath, value } of findEvidenceLikeFields(doc)) {
      for (const ev of stringLeaves(value)) {
        const problem = classifyEvidenceReference(root, ev, tracked);
        if (problem !== "OK") {
          findings.push({
            code: "DANGLING_EVIDENCE",
            file,
            detail: `${fieldPath}: "${ev}" is ${problem} — fix: correct the path, or drop the entry`,
          });
        }
      }
    }
  }
  return findings;
}

/** Every evidence-path finding across decisions, program tracks, and remediation packages. */
export function findAllDanglingEvidence(root, tracked) {
  return [
    ...findDanglingDecisionEvidence(root, tracked),
    ...findDanglingTrackEvidence(root, tracked),
    ...findDanglingRemediationEvidence(root, tracked),
  ];
}

/** handoff/_general/**\/*.md files (excluding README.md), with a filename date and full text. */
function listHandoffFilesWithDates(root) {
  const generalDir = resolve(root, HANDOFF_DIR);
  if (!existsSync(generalDir)) return [];
  const out = [];
  for (const category of readdirSync(generalDir, { withFileTypes: true })) {
    if (!category.isDirectory()) continue;
    const categoryDir = resolve(generalDir, category.name);
    for (const entry of readdirSync(categoryDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name === "README.md") continue;
      const dateMatch = DATE_PREFIX.exec(entry.name);
      out.push({
        file: `${HANDOFF_DIR}/${category.name}/${entry.name}`,
        date: dateMatch ? dateMatch[1] : null,
      });
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * Warning-only: handoffs dated 2026-09-02 or later that state a bare test
 * count with no archive/receipts/ link anywhere in the file.
 */
export function findBareTestCountHandoffs(root) {
  const warnings = [];
  for (const { file, date } of listHandoffFilesWithDates(root)) {
    if (!date || date < HANDOFF_WARN_FROM) continue;
    const content = readFileSync(resolve(root, file), "utf8");
    const statesCount = TEST_COUNT_PATTERN.test(content) || PASS_RATIO_PATTERN.test(content);
    if (statesCount && !content.includes(`${RECEIPTS_DIR}/`)) {
      warnings.push({
        code: "HANDOFF_BARE_TEST_COUNT",
        file,
        detail: `states a test count with no ${RECEIPTS_DIR}/ link — write a receipt (npm run receipt) and cite it`,
      });
    }
  }
  return warnings;
}

/**
 * Runs every check and returns { failures, warnings, records }. This is the
 * single entry point check-receipts.mjs calls.
 */
export function checkAllReceipts(root) {
  const schema = loadSchema(root);
  const tracked = trackedFiles(root);
  const records = loadReceiptFiles(root);

  const failures = [];
  for (const record of records) {
    failures.push(...checkReceiptFile(record, { schema }));
  }
  failures.push(...findMutatedReceipts(root, tracked));
  failures.push(...findAllDanglingEvidence(root, tracked));

  const warnings = findBareTestCountHandoffs(root);

  return { failures, warnings, records };
}
