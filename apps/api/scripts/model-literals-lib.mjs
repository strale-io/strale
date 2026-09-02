// Pure functions behind the T14 model-registry contract
// (apps/api/src/lib/models.ts). Spec:
// archive/sessions/2026-09-02-t14-cheap-extras-plan.md (part B).
//
// apps/api/src/lib/models.ts is the only place a model id we CALL is
// allowed to live. This scans apps/api/src for a literal matching the
// vendor-id shape outside that file and outside *.test.ts.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

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

/** apps/api/scripts -> apps/api -> repo root. */
export function repoRootFrom(metaUrl) {
  return resolve(dirname(fileURLToPath(metaUrl)), "../../..");
}

export const MODELS_PATH = "apps/api/src/lib/models.ts";
export const SCAN_ROOT = "apps/api/src";
const SCAN_EXTENSIONS = new Set([".ts", ".tsx"]);
const SCAN_SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage"]);

// Matches a real vendor model-id shape: a dated Claude snapshot, an
// undated Claude alias (haiku/sonnet/opus + a version), a GPT id, a
// Voyage id, or a text-embedding id. The GPT/Voyage branches require a
// digit somewhere in the tail so an unrelated identifier that merely
// starts with "gpt-" or "voyage-" (a log-event name, a referral-source
// key) doesn't false-positive — every real GPT/Voyage model id contains a
// version number; "gpt-referral" and "voyage-rate-limited" don't.
export const MODEL_LITERAL_RE =
  /claude-[a-z0-9.-]+-\d{8}|claude-(?:haiku|sonnet|opus)-[0-9][a-z0-9.-]*|gpt-(?=[a-z0-9.-]*\d)[a-z0-9.-]+|voyage-(?=[a-z0-9.-]*\d)[a-z0-9.-]+|text-embedding-[a-z0-9-]+/g;

/**
 * Files that legitimately contain OTHER vendors'/versions' model-id
 * strings as DATA (a pricing or context-window reference table a
 * capability returns to the caller), not as an id Strale itself calls.
 * Each entry needs a one-line reason; keep this list short and reviewed —
 * it is the same shape as design-lib.mjs's LINT_TARGETS/allowlist idea,
 * inverted (an allowlist of files the check does NOT enforce on, rather
 * than files it does).
 */
export const DATA_FILE_ALLOWLIST = {
  "apps/api/src/capabilities/llm-cost-calculate.ts":
    "Public per-1K-token pricing table across many vendors' models, for a capability that answers 'what would this cost'. Not a model Strale calls.",
  "apps/api/src/capabilities/token-count.ts":
    "Context-window/pricing reference table across many vendors' models, for a capability that estimates token counts against a NAMED model. Not a model Strale calls.",
};

function walkTree(absDir, relDir, out) {
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SCAN_SKIP_DIRS.has(entry.name)) continue;
      walkTree(resolve(absDir, entry.name), `${relDir}/${entry.name}`, out);
    } else if (SCAN_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      out.push(`${relDir}/${entry.name}`);
    }
  }
}

/** Every .ts/.tsx file under apps/api/src, excluding *.test.ts, models.ts, and the data-file allowlist. */
export function scanTargets(root) {
  const out = [];
  const abs = resolve(root, SCAN_ROOT);
  if (existsSync(abs)) walkTree(abs, SCAN_ROOT, out);
  return out
    .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))
    .filter((f) => f !== MODELS_PATH)
    .filter((f) => !(f in DATA_FILE_ALLOWLIST))
    .sort();
}

// Strips block comments and line comments, same approach as
// scripts/env-lib.mjs (stripBlockComments + stripLineComment): a doc
// comment naming a model id in prose is not a call site.
function stripComments(text) {
  const noBlocks = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""));
  return noBlocks
    .split("\n")
    .map((line) => {
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
    })
    .join("\n");
}

/** Model-id-shaped literals found in one file's text, outside comments. Returns [{ match, line }]. */
export function scanFileForLiterals(rawText) {
  const text = stripComments(rawText);
  const found = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    MODEL_LITERAL_RE.lastIndex = 0;
    let m;
    while ((m = MODEL_LITERAL_RE.exec(lines[i]))) {
      found.push({ match: m[0], line: i + 1 });
    }
  }
  return found;
}

/** LITERAL_OUTSIDE_REGISTRY findings: a model-id-shaped string outside models.ts, *.test.ts, and the data-file allowlist. */
export function checkLiterals(root) {
  const findings = [];
  for (const file of scanTargets(root)) {
    const text = readFileSync(resolve(root, file), "utf8");
    for (const { match, line } of scanFileForLiterals(text)) {
      findings.push({
        code: "LITERAL_OUTSIDE_REGISTRY",
        file,
        detail: `${file}:${line} hardcodes "${match}" — import the role from ${MODELS_PATH} instead (MODELS.<role>.id)`,
      });
    }
  }
  return findings;
}

/** Loads MODELS from apps/api/src/lib/models.ts via a lightweight regex parse (no TS compile needed for a structural check — we only need id/pinned_at/decision presence per role block). */
export function loadModelsSource(root) {
  return readFileSync(resolve(root, MODELS_PATH), "utf8");
}

const ROLE_BLOCK_RE = /(\w+):\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
const FIELD_RE = /(\w+):\s*"([^"]*)"/g;

/**
 * REGISTRY_MISSING_FIELD findings: parses the `export const MODELS = { ... }
 * as const satisfies ...` object literal in models.ts and checks every
 * top-level role entry has non-empty id, pinned_at (a real calendar date),
 * and decision fields. A regex parse, not a TS compile, is enough — this
 * only needs to see string field values inside a known-shaped object
 * literal, and running the TypeScript compiler from a lint script is the
 * kind of complexity DEC-20260320-B-style checks avoid when a schema (or
 * here, a narrow parse) can see the same thing.
 */
export function checkRegistryEntries(root) {
  const findings = [];
  const source = loadModelsSource(root);
  const objectMatch = source.match(/export const MODELS = \{([\s\S]*?)\} as const satisfies/);
  if (!objectMatch) {
    findings.push({
      code: "REGISTRY_UNPARSEABLE",
      file: MODELS_PATH,
      detail: `Could not find 'export const MODELS = { ... } as const satisfies ...' in ${MODELS_PATH}`,
    });
    return findings;
  }
  const body = objectMatch[1];
  ROLE_BLOCK_RE.lastIndex = 0;
  let m;
  let roleCount = 0;
  while ((m = ROLE_BLOCK_RE.exec(body))) {
    const role = m[1];
    const block = m[2];
    roleCount++;
    const fields = {};
    FIELD_RE.lastIndex = 0;
    let fm;
    while ((fm = FIELD_RE.exec(block))) fields[fm[1]] = fm[2];

    for (const required of ["id", "pinned_at", "decision"]) {
      if (!fields[required] || fields[required].trim() === "") {
        findings.push({
          code: "REGISTRY_MISSING_FIELD",
          file: MODELS_PATH,
          detail: `MODELS.${role} is missing a non-empty "${required}" field`,
        });
      }
    }
    if (fields.pinned_at && !/^\d{4}-\d{2}-\d{2}$/.test(fields.pinned_at)) {
      findings.push({
        code: "REGISTRY_INVALID_DATE",
        file: MODELS_PATH,
        detail: `MODELS.${role}.pinned_at "${fields.pinned_at}" is not a YYYY-MM-DD calendar date`,
      });
    }
  }
  if (roleCount === 0) {
    findings.push({ code: "REGISTRY_EMPTY", file: MODELS_PATH, detail: `${MODELS_PATH} defines no MODELS roles` });
  }
  return findings;
}

export function checkAllModels(root) {
  const findings = [...checkLiterals(root), ...checkRegistryEntries(root)];
  return { findings, scannedFileCount: scanTargets(root).length };
}
