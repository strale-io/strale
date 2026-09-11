/**
 * The shadow distribution-surfaces register (M3 batch 3, T6).
 *
 * docs/operations/distribution-registry.yaml is not authoritative
 * (authority_active: false) until the founder-gated M4 cutover. This
 * library validates its own shape (schema, unique ids, authority_active,
 * evidence paths, status_date not in the future) and provides the
 * repo-native reader and comparison used by scripts/digest-shadow.mjs to
 * shadow-compare against apps/api/src/lib/daily-digest/fetch-notion.ts's
 * getDistributionSurfaces().
 *
 * See docs/operations/distribution-registry.md for the design, the
 * sources this register was populated from, and the social-media-post
 * tracking decision.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import { repoRootFrom } from "./program-tracks-lib.mjs";

export { repoRootFrom };

export const REGISTER_PATH = "docs/operations/distribution-registry.yaml";
export const SCHEMA_PATH = "docs/operations/distribution-registry.schema.json";

const URL_RE = /^https?:\/\/[^\s]+$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── loading ──────────────────────────────────────────────────────────────

export function loadSchema(root) {
  return JSON.parse(readFileSync(resolve(root, SCHEMA_PATH), "utf8"));
}

export function loadRegister(root) {
  return parseYaml(readFileSync(resolve(root, REGISTER_PATH), "utf8"));
}

/** Schema-valid register only (findings otherwise). */
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
  return { findings, register: ok ? register : null, valid: ok };
}

/** Every surface id is unique. */
export function checkUniqueIds(register) {
  const findings = [];
  const seen = new Map();
  for (const surface of register.surfaces ?? []) {
    if (seen.has(surface.id)) {
      findings.push({
        code: "DUPLICATE_ID",
        file: REGISTER_PATH,
        detail: `id "${surface.id}" appears more than once (also at index ${seen.get(surface.id)})`,
      });
    } else {
      seen.set(surface.id, register.surfaces.indexOf(surface));
    }
  }
  return findings;
}

/** authority_active must be false. Schema already enforces this via `const`,
 * but this check gives it its own finding code so a caller that only reads
 * the register (not the schema-validated object) can still assert on it. */
export function checkAuthorityActiveFalse(register) {
  if (register.authority_active !== false) {
    return [
      {
        code: "AUTHORITY_ACTIVE_NOT_FALSE",
        file: REGISTER_PATH,
        detail: `authority_active must be false until the founder-gated M4 cutover; found ${JSON.stringify(register.authority_active)}`,
      },
    ];
  }
  return [];
}

/** Every evidence value is either a well-formed URL (format-checked only,
 * never fetched in CI) or a repository path that exists on disk. */
export function checkEvidenceExists(root, register) {
  const findings = [];
  for (const surface of register.surfaces ?? []) {
    const evidence = surface.evidence;
    if (typeof evidence !== "string" || evidence.length === 0) continue;
    if (URL_RE.test(evidence)) continue;
    if (!existsSync(resolve(root, evidence))) {
      findings.push({
        code: "EVIDENCE_PATH_MISSING",
        file: REGISTER_PATH,
        detail: `surface "${surface.id}": evidence path does not exist: ${evidence}`,
      });
    }
  }
  return findings;
}

/** No surface's status_date is in the future (relative to `now`). */
export function checkStatusDateNotFuture(register, { now = new Date() } = {}) {
  const findings = [];
  const todayIso = now.toISOString().slice(0, 10);
  for (const surface of register.surfaces ?? []) {
    const date = surface.status_date;
    if (typeof date !== "string" || !ISO_DATE_RE.test(date)) continue;
    if (date > todayIso) {
      findings.push({
        code: "STATUS_DATE_IN_FUTURE",
        file: REGISTER_PATH,
        detail: `surface "${surface.id}": status_date ${date} is after today (${todayIso})`,
      });
    }
  }
  return findings;
}

/** Runs every check. Schema validity gates the rest: if the register does
 * not parse against the schema, only SCHEMA_INVALID findings are returned
 * (the other checks need a schema-valid shape to walk safely). */
export function checkAllDistribution(root, { now = new Date() } = {}) {
  const { findings: schemaFindings, register, valid } = checkSchema(root);
  if (!valid) {
    return { findings: schemaFindings, warnings: [], surfaceCount: 0 };
  }

  const findings = [
    ...checkUniqueIds(register),
    ...checkAuthorityActiveFalse(register),
    ...checkEvidenceExists(root, register),
    ...checkStatusDateNotFuture(register, { now }),
  ];

  return { findings, warnings: [], surfaceCount: register.surfaces.length };
}

// ── repo-native reader and shadow comparison ────────────────────────────

/**
 * The repo-native distribution surfaces: the register's own rows, mapped
 * to the { name, status } shape comparable with fetch-notion.ts's
 * getDistributionSurfaces() ({ name, status, daysPending, url }).
 */
export function repoNativeDistributionSurfaces(root) {
  const register = loadRegister(root);
  return (register.surfaces ?? []).map((s) => ({ name: s.surface, status: s.status }));
}

function normalizeName(name) {
  return (name ?? "").trim().toLowerCase();
}

/**
 * Counts and names side by side between the repo-native register and the
 * live Notion distribution surfaces (fetch-notion.ts's
 * getDistributionSurfaces()), matched case-insensitively after trimming.
 * Report data only -- no verdict, no exit code, nothing that decides which
 * side is right. Mirrors digest-repo-native-lib.mjs's comparePriorities.
 */
export function compareDistributionSurfaces(repo, notion) {
  const repoNames = new Set(repo.map((s) => normalizeName(s.name)));
  const notionNames = new Set(notion.map((s) => normalizeName(s.name)));
  return {
    repoCount: repo.length,
    notionCount: notion.length,
    repoOnly: repo.filter((s) => !notionNames.has(normalizeName(s.name))).map((s) => s.name),
    notionOnly: notion.filter((s) => !repoNames.has(normalizeName(s.name))).map((s) => s.name),
  };
}
