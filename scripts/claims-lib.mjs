// Pure functions behind the T14 claims register contract
// (docs/company/claims.yaml). Spec:
// archive/sessions/2026-09-02-t14-cheap-extras-plan.md (part C).
//
// Mirrors design-lib.mjs / research-lib.mjs: Ajv 2020 schema validation
// for row structure, hand-written checks for what a schema cannot see —
// evidence required for allowed/needs_evidence rows, and a scan of the
// public-facing surfaces for `forbidden` claims (fails) and
// `needs_evidence` claims whose evidence doesn't resolve (warns).
//
// Scope boundary, deliberately not duplicated here: vendor-name drift
// (e.g. a stale "OpenSanctions" mention after a vendor switch) is
// check-platform-facts-drift.ts's job — it already owns STALE_VENDORS /
// getStaleVendorNames() in apps/api/src/lib/platform-facts.ts. This
// register is for CLAIM phrasing (certifications, superlatives,
// forbidden framing), not vendor identity. Adding vendor names here
// would be the "one list, many matchers" bug this repo has hit before
// (project_one_list_many_matchers) — a second copy of the same list,
// compared differently, drifting differently.
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

export const REGISTER_PATH = "docs/company/claims.yaml";
export const SCHEMA_PATH = "docs/company/claims.schema.json";
export const VOICE_PATH = "docs/company/VOICE.md";

/**
 * Surfaces scanned for forbidden/needs_evidence claim text. Paths are
 * resolved relative to the repo root; `packages/*` and `manifests/*` are
 * globbed at scan time. FRONTEND_LLMS_TXT is read only when it exists —
 * the frontend repo is a sibling checkout, not part of this repo, and is
 * read-only (never written) from here.
 */
export const README_TARGETS = ["README.md"];
export const PACKAGES_DIR = "packages";
export const MANIFESTS_DIR = "manifests";
export const PLATFORM_FACTS_PATH = "apps/api/src/lib/platform-facts.ts";
export const FRONTEND_LLMS_TXT_ENV = "STRALE_FRONTEND_PATH";
const DEFAULT_FRONTEND_LLMS_TXT = "../strale-frontend/public/llms.txt";

export function loadSchema(root) {
  return JSON.parse(readFileSync(resolve(root, SCHEMA_PATH), "utf8"));
}

export function loadRegister(root) {
  return parseYaml(readFileSync(resolve(root, REGISTER_PATH), "utf8"));
}

export function checkSchema(root) {
  const findings = [];
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const schema = loadSchema(root);
  const validate = ajv.compile(schema);
  const register = loadRegister(root);
  const ok = validate(register);
  if (!ok) {
    for (const err of validate.errors ?? []) {
      findings.push({
        code: "SCHEMA_INVALID",
        file: REGISTER_PATH,
        detail: `${err.instancePath || "(root)"} ${err.message}`,
      });
    }
  }
  return { findings, register: Array.isArray(register) ? register : [], valid: ok };
}

/** allowed/needs_evidence rows must carry a non-empty evidence field — a schema can express "required" but not "required only for these two enum values". */
export function checkEvidenceRequired(rows) {
  const findings = [];
  for (const row of rows) {
    if ((row.status === "allowed" || row.status === "needs_evidence") && !row.evidence) {
      findings.push({
        code: "MISSING_EVIDENCE",
        file: REGISTER_PATH,
        detail: `${row.id} is status "${row.status}" but has no evidence field`,
      });
    }
  }
  return findings;
}

export function checkDuplicateIds(rows) {
  const findings = [];
  const seen = new Map();
  for (const row of rows) seen.set(row.id, (seen.get(row.id) ?? 0) + 1);
  for (const [id, count] of seen) {
    if (count > 1) {
      findings.push({ code: "DUPLICATE_CLAIM_ID", file: REGISTER_PATH, detail: `${id} appears ${count} times in ${REGISTER_PATH}` });
    }
  }
  return findings;
}

/** Does an evidence value resolve? A repo-relative path must exist on disk; anything that parses as http(s) is treated as resolvable without a network call (this is a lint, not an uptime monitor). */
export function evidenceResolves(root, evidence) {
  if (/^https?:\/\//i.test(evidence)) return true;
  return existsSync(resolve(root, evidence));
}

/** needs_evidence rows whose evidence doesn't resolve — a warning, not a build failure, per the plan. */
export function checkEvidenceResolves(root, rows) {
  const warnings = [];
  for (const row of rows) {
    if (row.status !== "needs_evidence" || !row.evidence) continue;
    if (!evidenceResolves(root, row.evidence)) {
      warnings.push({
        code: "EVIDENCE_UNRESOLVED",
        file: REGISTER_PATH,
        detail: `${row.id}: evidence "${row.evidence}" does not resolve (not a file in the repo, not an http(s) URL)`,
      });
    }
  }
  return warnings;
}

function compileMatcher(row) {
  if (row.is_regex) {
    try {
      return new RegExp(row.claim, "i");
    } catch (err) {
      return null;
    }
  }
  const escaped = row.claim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}

/** Every manifest description under manifests/*.yaml, as { file, text }. */
function loadManifestDescriptions(root) {
  const dir = resolve(root, MANIFESTS_DIR);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".yaml") && !name.endsWith(".yml")) continue;
    const rel = `${MANIFESTS_DIR}/${name}`;
    try {
      const doc = parseYaml(readFileSync(resolve(root, rel), "utf8"));
      if (doc && typeof doc.description === "string") {
        out.push({ file: rel, text: doc.description });
      }
    } catch {
      // A malformed manifest is a different check's job (validate-capability.ts); skip here.
    }
  }
  return out;
}

/** Every package's README.md under packages/, as { file, text }. */
function loadPackageReadmes(root) {
  const dir = resolve(root, PACKAGES_DIR);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const rel = `${PACKAGES_DIR}/${entry.name}/README.md`;
    const abs = resolve(root, rel);
    if (existsSync(abs)) out.push({ file: rel, text: readFileSync(abs, "utf8") });
  }
  return out;
}

function loadReadmeTargets(root) {
  const out = [];
  for (const rel of README_TARGETS) {
    const abs = resolve(root, rel);
    if (existsSync(abs)) out.push({ file: rel, text: readFileSync(abs, "utf8") });
  }
  return out;
}

function loadPlatformFacts(root) {
  const abs = resolve(root, PLATFORM_FACTS_PATH);
  if (!existsSync(abs)) return [];
  return [{ file: PLATFORM_FACTS_PATH, text: readFileSync(abs, "utf8") }];
}

/** Sibling frontend repo's public/llms.txt, read-only, only when present. Path overridable via STRALE_FRONTEND_PATH (same env var check-platform-facts-drift.ts uses) so both checkers agree on where the frontend lives. */
export function loadFrontendLlmsTxt(root) {
  const frontendRoot = process.env[FRONTEND_LLMS_TXT_ENV] ? resolve(process.env[FRONTEND_LLMS_TXT_ENV]) : resolve(root, "..", "strale-frontend");
  const abs = resolve(frontendRoot, "public/llms.txt");
  if (!existsSync(abs)) return [];
  return [{ file: "../strale-frontend/public/llms.txt", text: readFileSync(abs, "utf8") }];
}

/** Every scanned surface, as { file, text }[]. */
export function loadAllSurfaces(root) {
  return [
    ...loadReadmeTargets(root),
    ...loadPackageReadmes(root),
    ...loadManifestDescriptions(root),
    ...loadPlatformFacts(root),
    ...loadFrontendLlmsTxt(root),
  ];
}

/** FORBIDDEN_CLAIM_FOUND findings: a forbidden-status row's phrase appears in a scanned surface. */
export function checkForbiddenClaims(root, rows) {
  const findings = [];
  const surfaces = loadAllSurfaces(root);
  const forbidden = rows.filter((r) => r.status === "forbidden");
  for (const row of forbidden) {
    const matcher = compileMatcher(row);
    if (!matcher) {
      findings.push({ code: "INVALID_CLAIM_PATTERN", file: REGISTER_PATH, detail: `${row.id}: "${row.claim}" is not a valid regex` });
      continue;
    }
    for (const surface of surfaces) {
      matcher.lastIndex = 0;
      if (matcher.test(surface.text)) {
        findings.push({
          code: "FORBIDDEN_CLAIM_FOUND",
          file: surface.file,
          detail: `${surface.file} matches forbidden claim "${row.id}" (${row.claim}) — ${row.note ?? "see docs/company/claims.yaml"}`,
        });
      }
    }
  }
  return findings;
}

export function checkAllClaims(root) {
  const findings = [];
  const warnings = [];
  const { findings: schemaFindings, register: rows, valid } = checkSchema(root);
  findings.push(...schemaFindings);

  if (valid) {
    findings.push(...checkEvidenceRequired(rows));
    findings.push(...checkDuplicateIds(rows));
    findings.push(...checkForbiddenClaims(root, rows));
    warnings.push(...checkEvidenceResolves(root, rows));
  }

  return { findings, warnings, rowCount: rows.length };
}
