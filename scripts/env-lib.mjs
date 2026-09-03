// Pure functions behind the T14 environment manifest contract
// (config/env-manifest.yaml). Spec: archive/sessions/2026-09-02-t14-cheap-extras-plan.md
//
// Mirrors design-lib.mjs / research-lib.mjs: Ajv 2020 schema validation for
// row structure, hand-written checks for what a schema cannot see — every
// `process.env.NAME` actually read in the four scanned trees has a row,
// every row not marked retired is actually read, and the generated
// .env.example files match what the manifest would produce.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";
import { repoRootFrom } from "./program-tracks-lib.mjs";

export { repoRootFrom };

function slash(value) {
  return value.split(sep).join("/");
}

/** True when this module was invoked directly (`node scripts/x.mjs`), not imported. */
export function isDirectInvocation(importMetaUrl) {
  if (!process.argv[1]) return false;
  const invoked = slash(resolve(process.argv[1])).toLowerCase();
  const modulePath = slash(fileURLToPath(importMetaUrl)).toLowerCase();
  return invoked === modulePath;
}

export const MANIFEST_PATH = "config/env-manifest.yaml";
export const SCHEMA_PATH = "config/env-manifest.schema.json";
export const ROOT_EXAMPLE_PATH = ".env.example";
export const API_EXAMPLE_PATH = "apps/api/.env.example";

/** Trees this manifest is required to cover — the same four the plan names. */
export const SCAN_TREES = ["apps/api/src", "apps/api/scripts", "packages", "scripts"];
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
const SCAN_SKIP_DIRS = new Set(["node_modules", "dist", "build", ".next", "coverage"]);
// scripts/*.test.mjs is this repo's own contract-checker test-suite
// convention (design.test.mjs, research.test.mjs, this file's own
// env.test.mjs, ...). Those files plant fixture SOURCE CODE as string
// literals — including deliberately fake `process.env.NAME` text — so
// scanning them as if they were real reads would make this checker's own
// test suite fail its own check. No other tree under scan uses the
// *.test.mjs convention (application tests are *.test.ts); this exclusion
// is scoped to that one pattern, not to tests in general.
const SCAN_SKIP_FILE_RE = /\.test\.mjs$/i;

const ENV_DOT_RE = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
const ENV_BRACKET_RE = /process\.env\[["']([A-Z_][A-Z0-9_]*)["']\]/g;

function walkTree(absDir, relDir, out) {
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SCAN_SKIP_DIRS.has(entry.name)) continue;
      walkTree(resolve(absDir, entry.name), `${relDir}/${entry.name}`, out);
    } else if (SCAN_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf("."))) && !SCAN_SKIP_FILE_RE.test(entry.name)) {
      out.push(`${relDir}/${entry.name}`);
    }
  }
}

/** Every source file under the four scanned trees that exist in this checkout. */
export function scanTargets(root) {
  const targets = [];
  for (const tree of SCAN_TREES) {
    const abs = resolve(root, tree);
    if (existsSync(abs)) walkTree(abs, tree, targets);
  }
  return targets.sort();
}

/**
 * Strips the portion of a source line that is a real `//` line comment —
 * not part of a URL (`https://`), and not inside a quoted string — so a
 * variable name mentioned only in prose (e.g. the pattern-matching example
 * inside env-template-generate.ts, which documents `process.env.VAR_NAME`
 * as sample text for a capability that detects env vars in OTHER people's
 * code) is not counted as a real read here. Best-effort: does not track
 * multi-line block comments, which none of the four trees currently use
 * around a `process.env.` reference.
 */
export function stripLineComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "/" && line[i + 1] === "/" && line[i - 1] !== ":") {
      return line.slice(0, i);
    }
  }
  return line;
}

/**
 * Removes block comments (`/` + `*` ... `*` + `/`, including single-line
 * ones such as JSDoc) from source text, replacing each with an equal
 * number of newlines so line numbers of anything after the comment are
 * unaffected. A JSDoc example that writes out an env-var name in prose is
 * documentation, not a read.
 */
function stripBlockComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ""));
}

/**
 * Scans one file's text for real `process.env.NAME` / `process.env["NAME"]`
 * reads — outside both block and line comments. Returns a Map of name ->
 * first line number found in this file.
 */
export function scanFileForEnvNames(rawText) {
  const found = new Map();
  const text = stripBlockComments(rawText);
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const code = stripLineComment(lines[i]);
    let m;
    ENV_DOT_RE.lastIndex = 0;
    while ((m = ENV_DOT_RE.exec(code))) {
      if (!found.has(m[1])) found.set(m[1], i + 1);
    }
    ENV_BRACKET_RE.lastIndex = 0;
    while ((m = ENV_BRACKET_RE.exec(code))) {
      if (!found.has(m[1])) found.set(m[1], i + 1);
    }
  }
  return found;
}

/**
 * Every distinct process.env.NAME read across the four scanned trees,
 * mapped to its first (file, line) occurrence — enough to point at an
 * example in a finding.
 */
export function scanAllEnvUsages(root) {
  const usages = new Map();
  for (const file of scanTargets(root)) {
    const abs = resolve(root, file);
    const text = readFileSync(abs, "utf8");
    const found = scanFileForEnvNames(text);
    for (const [name, line] of found) {
      if (!usages.has(name)) usages.set(name, { file, line });
    }
  }
  return usages;
}

export function loadSchema(root) {
  return JSON.parse(readFileSync(resolve(root, SCHEMA_PATH), "utf8"));
}

export function loadManifest(root) {
  return parseYaml(readFileSync(resolve(root, MANIFEST_PATH), "utf8"));
}

/** Schema-valid rows only (empty array on any schema violation — see checkSchema for findings). */
export function checkSchema(root) {
  const findings = [];
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const schema = loadSchema(root);
  const validate = ajv.compile(schema);
  const manifest = loadManifest(root);
  const ok = validate(manifest);
  if (!ok) {
    for (const err of validate.errors ?? []) {
      findings.push({
        code: "SCHEMA_INVALID",
        file: MANIFEST_PATH,
        detail: `${err.instancePath || "(root)"} ${err.message}`,
      });
    }
  }
  return { findings, manifest: Array.isArray(manifest) ? manifest : [], valid: ok };
}

/** Names read in code with no manifest row at all. */
export function checkUndocumented(usages, rows) {
  const findings = [];
  const documented = new Set(rows.map((r) => r.name));
  for (const [name, loc] of usages) {
    if (!documented.has(name)) {
      findings.push({
        code: "UNDOCUMENTED_ENV_VAR",
        file: loc.file,
        detail: `process.env.${name} is read at ${loc.file}:${loc.line} but has no row in ${MANIFEST_PATH}`,
      });
    }
  }
  return findings;
}

/** Manifest rows for a name no code reads, unless marked retired. */
export function checkDeadRows(usages, rows) {
  const findings = [];
  for (const row of rows) {
    if (row.retired || row.read_indirectly) continue;
    if (!usages.has(row.name)) {
      findings.push({
        code: "DEAD_ENV_ROW",
        file: MANIFEST_PATH,
        detail: `${MANIFEST_PATH} documents ${row.name} but no code under ${SCAN_TREES.join(", ")} reads it — mark it retired: <date> or remove the row`,
      });
    }
  }
  return findings;
}

/**
 * Internal contradictions between a row's own fields.
 *
 * `set_in` is free-form data no check ever read, and it drifted: on 2026-09-02
 * an audit of `railway variables` found 43 of 127 rows claiming
 * `set_in: [railway]` for a variable Railway does not hold, several of them
 * carrying a `cost_note` in the same row that said so in words. A register
 * nothing verifies is a register that will be wrong.
 *
 * These four are the contradictions provable from the file alone. Membership
 * of `railway` cannot be checked in CI — that needs a credential CI must not
 * have — so it stays an operator audit, dated in the manifest header.
 *
 * SET_IN_NONE_BUT_REQUIRED catches only the literal `set_in: [none]` case; the
 * commoner real mistake is a variable required in production and configured
 * only on a developer machine, which is why
 * REQUIRED_IN_PRODUCTION_BUT_NOT_SET_THERE exists alongside it. Found by the
 * independent review of #494 as a false negative in the first version.
 */
export function checkRowContradictions(rows) {
  const findings = [];
  for (const row of rows) {
    const setIn = row.set_in ?? [];
    const requiredIn = row.required_in ?? [];
    const nowhere = setIn.length === 1 && setIn[0] === "none";

    if (nowhere && requiredIn.length > 0) {
      findings.push({
        code: "SET_IN_NONE_BUT_REQUIRED",
        file: MANIFEST_PATH,
        detail: `${row.name} is set_in: [none] but required_in: [${requiredIn.join(", ")}] — nothing configures it, yet the register says something fails without it. One of the two is wrong.`,
      });
    }

    if (setIn.includes("none") && setIn.length > 1) {
      findings.push({
        code: "SET_IN_NONE_WITH_OTHERS",
        file: MANIFEST_PATH,
        detail: `${row.name} has set_in: [${setIn.join(", ")}] — 'none' means configured nowhere and cannot be combined with a place. Drop 'none', or drop the rest.`,
      });
    }

    if (requiredIn.includes("production") && !setIn.includes("railway")) {
      findings.push({
        code: "REQUIRED_IN_PRODUCTION_BUT_NOT_SET_THERE",
        file: MANIFEST_PATH,
        detail: `${row.name} is required_in: [production] but set_in: [${setIn.join(", ")}] — production runs on Railway, so a variable it needs must be set there. Either it is not really required in production, or production is missing it.`,
      });
    }

    if (row.retired && requiredIn.length > 0) {
      findings.push({
        code: "RETIRED_BUT_REQUIRED",
        file: MANIFEST_PATH,
        detail: `${row.name} is retired: ${row.retired} but required_in: [${requiredIn.join(", ")}] — a retired variable is one no code reads, so nothing can require it.`,
      });
    }
  }
  return findings;
}

/** Duplicate names within the manifest itself — a schema can't see this (each row is independently valid). */
export function checkDuplicateNames(rows) {
  const findings = [];
  const seen = new Map();
  for (const row of rows) {
    seen.set(row.name, (seen.get(row.name) ?? 0) + 1);
  }
  for (const [name, count] of seen) {
    if (count > 1) {
      findings.push({
        code: "DUPLICATE_ENV_ROW",
        file: MANIFEST_PATH,
        detail: `${name} appears ${count} times in ${MANIFEST_PATH} — one row per variable`,
      });
    }
  }
  return findings;
}

/** Runs every T14 environment-manifest check (schema + undocumented + dead rows + duplicates + row contradictions). Example-file staleness is checked separately by the CLI, which also regenerates. */
export function checkAllEnv(root) {
  const findings = [];
  const { findings: schemaFindings, manifest: rows, valid } = checkSchema(root);
  findings.push(...schemaFindings);

  const usages = scanAllEnvUsages(root);

  if (valid) {
    findings.push(...checkUndocumented(usages, rows));
    findings.push(...checkDeadRows(usages, rows));
    findings.push(...checkDuplicateNames(rows));
    findings.push(...checkRowContradictions(rows));
  }

  return { findings, usageCount: usages.size, rowCount: rows.length };
}
