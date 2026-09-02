// Pure functions behind the T13 design-tokens contract (design/tokens/*,
// design/lint-allowlist.json). Spec: archive/sessions/2026-09-02-t13-design-tokens-plan.md
//
// Mirrors research-lib.mjs / program-tracks-lib.mjs: Ajv 2020 schema
// validation for structure, hand-written checks for relations a schema
// cannot see (one active file, promotion-requires-a-decision, the
// off-token literal lint over the internal-report consumers with a
// ratcheted allowlist).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { repoRootFrom, trackedFiles } from "./program-tracks-lib.mjs";

export { repoRootFrom, trackedFiles };

function slash(value) {
  return value.split(sep).join("/");
}

/** True when this module was invoked directly (`node scripts/x.mjs`), not imported. */
export function isDirectInvocation(importMetaUrl) {
  if (!process.argv[1]) return false;
  const invoked = slash(resolve(process.argv[1])).toLowerCase();
  const modulePath = slash(new URL(importMetaUrl).pathname.replace(/^\/([A-Za-z]:)/, "$1")).toLowerCase();
  return invoked === modulePath;
}

export const TOKENS_DIR = "design/tokens";
export const CANDIDATES_DIR = "design/tokens/candidates";
export const SCHEMA_PATH = "design/tokens/schema.json";
export const ACTIVE_PATH = "design/tokens/active.json";
export const ALLOWLIST_PATH = "design/lint-allowlist.json";
export const GENERATED_PATH = "apps/api/scripts/lib/design-tokens.generated.ts";

/** Consumer files the lint scans. design-system.ts and the generated file are the token source and are exempt. */
export const LINT_TARGETS = [
  "apps/api/scripts/ceo-dashboard.ts",
  "apps/api/src/lib/digest-formatter.ts",
  "apps/api/src/lib/interrupt-sender.ts",
];

export function loadSchema(root) {
  return JSON.parse(readFileSync(resolve(root, SCHEMA_PATH), "utf8"));
}

/** design/tokens/*.json at the top level (not candidates/), excluding schema.json. Used for the one-active-file check. */
export function listTopLevelTokenFiles(root) {
  const dir = resolve(root, TOKENS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".json") && d.name !== "schema.json")
    .map((d) => d.name)
    .sort();
}

export function listCandidateFiles(root) {
  const dir = resolve(root, CANDIDATES_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".json"))
    .map((d) => d.name)
    .sort();
}

function loadJson(root, relPath) {
  const abs = resolve(root, relPath);
  const raw = readFileSync(abs, "utf8");
  try {
    return { value: JSON.parse(raw), error: null };
  } catch (err) {
    return { value: null, error: err.message };
  }
}

const STATUS_VALUES = new Set(["exploring", "proposed", "adopted", "rejected"]);

/**
 * Schema + structural checks over every design/tokens/*.json file
 * (active.json and each candidate). Returns a list of findings.
 */
export function checkTokenFiles(root) {
  const findings = [];
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const schema = loadSchema(root);
  const validate = ajv.compile(schema);

  const topLevel = listTopLevelTokenFiles(root);
  if (topLevel.length === 0) {
    findings.push({ code: "ACTIVE_MISSING", file: ACTIVE_PATH, detail: `${ACTIVE_PATH} does not exist` });
  } else if (topLevel.length > 1) {
    findings.push({
      code: "MULTIPLE_ACTIVE_FILES",
      file: TOKENS_DIR,
      detail: `${TOKENS_DIR}/ has ${topLevel.length} top-level token files (${topLevel.join(", ")}) — only active.json belongs there`,
    });
  }

  const files = [
    ...topLevel.map((name) => `${TOKENS_DIR}/${name}`),
    ...listCandidateFiles(root).map((name) => `${CANDIDATES_DIR}/${name}`),
  ];

  for (const file of files) {
    const { value, error } = loadJson(root, file);
    if (error) {
      findings.push({ code: "INVALID_JSON", file, detail: error });
      continue;
    }
    const ok = validate(value);
    if (!ok) {
      const detail = ajv.errorsText(validate.errors, { separator: "; " });
      findings.push({ code: "SCHEMA_INVALID", file, detail });
      continue;
    }
    if (file.startsWith(`${CANDIDATES_DIR}/`) && !STATUS_VALUES.has(value.status)) {
      findings.push({
        code: "INVALID_CANDIDATE_STATUS",
        file,
        detail: `status "${value.status}" is not one of exploring | proposed | adopted | rejected`,
      });
    }
  }

  return findings;
}

/**
 * Reads design/tokens/active.json as committed on `origin/main`, via
 * `git show`. Returns null when the ref doesn't resolve (no network / no
 * fetch — caller should warn, not fail) or the file doesn't exist there yet
 * (a real "this PR creates it" case, also not a failure).
 */
export function readActiveJsonAtOriginMain(root) {
  try {
    execFileSync("git", ["-C", root, "rev-parse", "--verify", "origin/main"], { stdio: "pipe" });
  } catch {
    return { available: false, content: null };
  }
  try {
    const raw = execFileSync("git", ["-C", root, "show", `origin/main:${ACTIVE_PATH}`], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { available: true, content: raw };
  } catch {
    // ref resolves but the path doesn't exist at that ref — new file, not a failure.
    return { available: true, content: null };
  }
}

/**
 * "active change without decision": if active.json differs from
 * origin/main and no surface's adopted_by also differs, that's a promotion
 * without a decision record. Absent-on-origin/main is a pass (this PR
 * creates the file). Ref-unavailable is a pass with a warning (no network,
 * or a shallow local clone).
 */
export function checkPromotionRequiresDecision(root) {
  const findings = [];
  const warnings = [];
  const remote = readActiveJsonAtOriginMain(root);

  if (!remote.available) {
    warnings.push({
      code: "ORIGIN_MAIN_UNAVAILABLE",
      file: ACTIVE_PATH,
      detail: "origin/main does not resolve locally — skipping the promotion-requires-a-decision check. CI has fetch-depth: 0 and will run it.",
    });
    return { findings, warnings };
  }
  if (remote.content === null) {
    // New file — nothing to compare against.
    return { findings, warnings };
  }

  const localRaw = readFileSync(resolve(root, ACTIVE_PATH), "utf8");
  const normalize = (s) => s.replace(/\r\n/g, "\n").trim();
  if (normalize(localRaw) === normalize(remote.content)) {
    return { findings, warnings };
  }

  let local, remoteParsed;
  try {
    local = JSON.parse(localRaw);
    remoteParsed = JSON.parse(remote.content);
  } catch (err) {
    findings.push({ code: "ACTIVE_JSON_UNPARSEABLE", file: ACTIVE_PATH, detail: err.message });
    return { findings, warnings };
  }

  const localSurfaces = local.surfaces ?? {};
  const remoteSurfaces = remoteParsed.surfaces ?? {};
  const surfaceNames = new Set([...Object.keys(localSurfaces), ...Object.keys(remoteSurfaces)]);
  let anyAdoptedByChanged = false;
  for (const name of surfaceNames) {
    const localAdopted = localSurfaces[name]?.adopted_by;
    const remoteAdopted = remoteSurfaces[name]?.adopted_by;
    if (localAdopted !== remoteAdopted) {
      anyAdoptedByChanged = true;
      break;
    }
  }

  if (!anyAdoptedByChanged) {
    findings.push({
      code: "PROMOTION_WITHOUT_DECISION",
      file: ACTIVE_PATH,
      detail: `${ACTIVE_PATH} differs from origin/main but no surface's adopted_by changed — promotion requires a decision record. If a surface's values legitimately changed, its adopted_by must change too.`,
    });
  }

  return { findings, warnings };
}

// ─── Off-token literal lint ────────────────────────────────────────────────

// Excludes HTML numeric character references (&#128202;) — an entity whose
// digits happen to all be valid hex digits (e.g. &#128202;) would otherwise
// false-positive as a six-digit hex color.
// A hex colour anywhere: in a CSS declaration (`color:#2563EB;`), a quoted TS
// string, or a template literal. Not preceded by `&` (HTML entities such as
// `&#128202;`) and not part of a longer hex run.
const HEX_RE = /(?<![&0-9A-Za-z])#[0-9A-Fa-f]{6}(?![0-9A-Za-z])/g;
const RGB_HSL_RE = /\b(rgb|hsl)a?\s*\(/g;
const FONT_FAMILY_RE = /font-family\s*:/g;
// Box-model properties whose px literals are judged against the spacing
// scale, and border-radius against the radii scale. Deliberately narrow —
// the plan's "px/rem value not on the surface's spacing/radii scale" is a
// spacing/radii check, not a blanket ban on every px number (font-size is
// governed by the type scale, not spacing/radii, and isn't checked here).
const SPACING_PROP_RE = /\b(?:margin|padding|gap)\s*:\s*([^;{}]+);/g;
const RADIUS_PROP_RE = /\bborder-radius\s*:\s*([^;{}]+);/g;
const PX_RE = /(-?\d+(?:\.\d+)?)px/g;

function loadInternalReportsScale(root) {
  const abs = resolve(root, ACTIVE_PATH);
  if (!existsSync(abs)) return { spacing: new Set(), radii: new Set(), radiiStrings: new Set() };
  let active;
  try {
    active = JSON.parse(readFileSync(abs, "utf8"));
  } catch {
    return { spacing: new Set(), radii: new Set(), radiiStrings: new Set() };
  }
  const surface = active.surfaces?.["internal-reports"];
  const spacing = new Set((surface?.spacing ?? []).map(Number));
  const radii = new Set((surface?.radii ?? []).filter((v) => typeof v === "number"));
  const radiiStrings = new Set((surface?.radii ?? []).filter((v) => typeof v === "string"));
  return { spacing, radii, radiiStrings };
}

function findPxViolations(text, propRe, scaleNumbers, scaleStrings, kind) {
  const violations = [];
  let m;
  propRe.lastIndex = 0;
  while ((m = propRe.exec(text))) {
    const valueText = m[1];
    if (scaleStrings?.has(valueText.trim())) continue;
    let n;
    PX_RE.lastIndex = 0;
    while ((n = PX_RE.exec(valueText))) {
      const num = parseFloat(n[1]);
      if (!scaleNumbers.has(num)) {
        violations.push({ kind, value: `${num}px` });
      }
    }
  }
  return violations;
}

/**
 * Scans one consumer file's raw text for off-token literals. Returns a list
 * of { kind, value } — deduplicated by (kind, value) is the caller's job
 * (the allowlist keys on file+kind+value, not raw occurrence count).
 */
export function scanFileForLiterals(text, scale) {
  const found = [];

  let m;
  HEX_RE.lastIndex = 0;
  while ((m = HEX_RE.exec(text))) found.push({ kind: "hex", value: m[0] });

  RGB_HSL_RE.lastIndex = 0;
  while ((m = RGB_HSL_RE.exec(text))) found.push({ kind: "rgb-hsl", value: m[0].replace(/\s+/g, "") });

  FONT_FAMILY_RE.lastIndex = 0;
  while ((m = FONT_FAMILY_RE.exec(text))) found.push({ kind: "font-family", value: "font-family:" });

  found.push(...findPxViolations(text, SPACING_PROP_RE, scale.spacing, null, "spacing-px"));
  found.push(...findPxViolations(text, RADIUS_PROP_RE, scale.radii, scale.radiiStrings, "radius-px"));

  return found;
}

function dedupeKey(entry) {
  return `${entry.file}|${entry.kind}|${entry.value}`;
}

/** Every off-token literal currently in the lint targets, deduplicated by (file, kind, value). Also returns the raw (non-deduplicated) count. */
export function scanAllLintTargets(root) {
  const scale = loadInternalReportsScale(root);
  const entries = [];
  let rawCount = 0;
  for (const file of LINT_TARGETS) {
    const abs = resolve(root, file);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, "utf8");
    const found = scanFileForLiterals(text, scale);
    rawCount += found.length;
    for (const f of found) entries.push({ file, kind: f.kind, value: f.value });
  }
  const seen = new Map();
  for (const e of entries) seen.set(dedupeKey(e), e);
  return { unique: [...seen.values()].sort((a, b) => dedupeKey(a).localeCompare(dedupeKey(b))), rawCount };
}

export function loadAllowlist(root) {
  const abs = resolve(root, ALLOWLIST_PATH);
  if (!existsSync(abs)) return [];
  const data = JSON.parse(readFileSync(abs, "utf8"));
  if (!Array.isArray(data)) throw new Error(`${ALLOWLIST_PATH} must be a JSON array`);
  return data;
}

/**
 * The allowlist ratchet: compares the committed lint-allowlist.json against
 * origin/main. Any entry present locally but absent on origin/main is
 * growth — the whole point of the allowlist is that it only ever shrinks,
 * so a new entry defeats it exactly as much as an unallowed literal would.
 * Absent-on-origin/main (this PR creates the file) and ref-unavailable are
 * both a pass, mirroring checkPromotionRequiresDecision.
 */
export function checkAllowlistRatchet(root) {
  const findings = [];
  const warnings = [];

  let refAvailable = true;
  try {
    execFileSync("git", ["-C", root, "rev-parse", "--verify", "origin/main"], { stdio: "pipe" });
  } catch {
    refAvailable = false;
  }
  if (!refAvailable) {
    warnings.push({
      code: "ORIGIN_MAIN_UNAVAILABLE",
      file: ALLOWLIST_PATH,
      detail: "origin/main does not resolve locally — skipping the allowlist-growth check. CI has fetch-depth: 0 and will run it.",
    });
    return { findings, warnings };
  }

  let remoteRaw = null;
  try {
    remoteRaw = execFileSync("git", ["-C", root, "show", `origin/main:${ALLOWLIST_PATH}`], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    // Not present on origin/main yet — this PR creates it. Nothing to compare.
    return { findings, warnings };
  }

  let remoteEntries;
  try {
    remoteEntries = JSON.parse(remoteRaw);
  } catch (err) {
    findings.push({ code: "ALLOWLIST_UNPARSEABLE_ON_MAIN", file: ALLOWLIST_PATH, detail: err.message });
    return { findings, warnings };
  }

  const remoteKeys = new Set((remoteEntries ?? []).map((e) => dedupeKey(e)));
  const local = loadAllowlist(root);
  for (const entry of local) {
    if (!remoteKeys.has(dedupeKey(entry))) {
      findings.push({
        code: "ALLOWLIST_GROWTH",
        file: entry.file,
        detail: `${ALLOWLIST_PATH} gained ${entry.kind} ${entry.value} in ${entry.file}, not present on origin/main — the allowlist may only shrink; fix the literal instead of allowlisting it`,
      });
    }
  }

  return { findings, warnings };
}

/**
 * Compares today's off-token literals against design/lint-allowlist.json.
 * Findings:
 *   - LINT_VIOLATION: an off-token literal not in the allowlist (new code, or the allowlist wasn't updated).
 *   - ALLOWLIST_STALE_ENTRY: an allowlist entry whose (file, kind, value) no longer appears anywhere in that file — must be removed.
 * See checkAllowlistRatchet for the separate "allowlist may only shrink versus origin/main" check.
 */
export function checkLint(root) {
  const findings = [];
  const { unique: current, rawCount } = scanAllLintTargets(root);
  const allowlist = loadAllowlist(root);

  const allowedKeys = new Set(allowlist.map((e) => dedupeKey(e)));
  const currentKeys = new Set(current.map((e) => dedupeKey(e)));

  for (const entry of current) {
    if (!allowedKeys.has(dedupeKey(entry))) {
      findings.push({
        code: "LINT_VIOLATION",
        file: entry.file,
        detail: `off-token ${entry.kind} literal ${entry.value} is not in ${ALLOWLIST_PATH} — add the token instead, or if this is pre-existing, add it to the allowlist`,
      });
    }
  }

  for (const entry of allowlist) {
    if (!currentKeys.has(dedupeKey(entry))) {
      findings.push({
        code: "ALLOWLIST_STALE_ENTRY",
        file: entry.file,
        detail: `${ALLOWLIST_PATH} lists ${entry.kind} ${entry.value} in ${entry.file}, which no longer appears there — remove the entry`,
      });
    }
  }

  return { findings, currentCount: current.length, rawCount, allowlistCount: allowlist.length };
}

/** Runs every T13 design check. Returns { failures, warnings, tokenFileCount }. */
export function checkAllDesign(root) {
  const failures = [];
  const warnings = [];

  failures.push(...checkTokenFiles(root));

  const promotion = checkPromotionRequiresDecision(root);
  failures.push(...promotion.findings);
  warnings.push(...promotion.warnings);

  const lint = checkLint(root);
  failures.push(...lint.findings);

  const ratchet = checkAllowlistRatchet(root);
  failures.push(...ratchet.findings);
  warnings.push(...ratchet.warnings);

  return {
    failures,
    warnings,
    tokenFileCount: listTopLevelTokenFiles(root).length + listCandidateFiles(root).length,
    lintCurrentCount: lint.currentCount,
    lintRawCount: lint.rawCount,
    lintAllowlistCount: lint.allowlistCount,
  };
}
