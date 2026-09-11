/**
 * The shadow vendor register (M3 batch 3, T6).
 *
 * config/vendors.yaml is not authoritative (authority_active: false) until
 * the founder-gated M4 cutover. This library validates its own shape
 * (schema, id/alias uniqueness, lifecycle ordering, decision/evidence path
 * existence) and cross-checks it against the surfaces the design document
 * names: apps/api/src/lib/dependency-manifest.ts PROVIDERS,
 * apps/api/coverage-matrix/*.yaml, and config/env-manifest.yaml. History
 * rules protect the register against the base branch the same way
 * codex-backlog-lib.mjs protects docs/programs/codex-review-backlog.yaml:
 * no vendor removed, no id changed, no existing lifecycle entry rewritten
 * only appending is allowed.
 *
 * See docs/strategy/2026-09-10-m3-vendor-state-model.md for the design and
 * archive/sessions/2026-09-10-m3-vendor-state-inventory.md for the surface
 * inventory this register was populated from.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import ts from "typescript";
import { parse as parseYaml } from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import { repoRootFrom } from "./program-tracks-lib.mjs";

export { repoRootFrom };

export const REGISTER_PATH = "config/vendors.yaml";
export const SCHEMA_PATH = "config/vendors.schema.json";
export const DEPENDENCY_MANIFEST_PATH = "apps/api/src/lib/dependency-manifest.ts";
export const AUTO_REGISTER_PATH = "apps/api/src/capabilities/auto-register.ts";
export const COVERAGE_MATRIX_DIR = "apps/api/coverage-matrix";
export const ENV_MANIFEST_PATH = "config/env-manifest.yaml";
export const DECISIONS_DIR = "docs/decisions/records";
export const PLATFORM_FACTS_PATH = "apps/api/src/lib/platform-facts.ts";
export const STARTUP_MIGRATIONS_PATH = "apps/api/src/lib/startup-migrations.ts";

const RETIRED_STATES = new Set(["retired", "deprecated"]);
const ACTIVE_STATES = new Set(["active", "fallback"]);
const HELD_STATES = new Set(["held"]);
/** States a STALE_VENDORS-named vendor's current lifecycle state is allowed
 * to be in (T6 batch 4a, item 1). active/fallback/unknown are excluded: a
 * vendor Strale is actually using, or whose state is not recorded, has no
 * business being on the never-active-in-customer-copy list. */
const STALE_ALLOWED_STATES = new Set(["candidate", "evaluating", "held", "rejected", "deprecated", "retired"]);
/** States that make a register vendor a candidate for the STALE_VENDOR_LIST_MISSING warning. */
const STALE_LIST_CANDIDATE_STATES = new Set(["rejected", "deprecated", "retired"]);
/** dependency-manifest.ts tiers the boot-time sync in startup-migrations.ts
 * actually loops over (T6 batch 4a, item 2). Every other tier is skipped by
 * construction, never by the register's own choice. */
const SYNCED_TIERS = new Set(["paid", "self-hosted"]);
/** Forward-only lifecycle-state ordering is not required by the design (a
 * vendor can go active -> held -> active again), so history rule 8 checks
 * only that existing entries are byte-identical and in place, never that
 * states move in one direction. */

// ── loading ──────────────────────────────────────────────────────────────

export function loadSchema(root) {
  return JSON.parse(readFileSync(resolve(root, SCHEMA_PATH), "utf8"));
}

export function loadRegister(root) {
  return parseYaml(readFileSync(resolve(root, REGISTER_PATH), "utf8"));
}

/** Schema-valid register only (findings otherwise). Mirrors env-lib.mjs's checkSchema shape. */
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

// ── PROVIDERS extraction (TypeScript compiler API, not regex) ───────────

function unwrapObjectLiteral(node) {
  while (node && (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node))) {
    node = node.expression;
  }
  return node;
}

function stringArrayLiteral(sf, initializer) {
  const node = unwrapObjectLiteral(initializer);
  if (!node || !ts.isArrayLiteralExpression(node)) return [];
  return node.elements
    .filter((el) => ts.isStringLiteralLike(el))
    .map((el) => el.text);
}

/**
 * Parses apps/api/src/lib/dependency-manifest.ts with the TypeScript
 * compiler API and extracts each PROVIDERS entry's name, retired flag,
 * capabilities and fallbackCapabilities. Never a regex over the object
 * literal, the same discipline
 * apps/api/scripts/check-no-direct-getexecutor-in-scripts.mjs applies to
 * this same file's sibling constructs.
 */
export function extractProviders(root) {
  const filePath = resolve(root, DEPENDENCY_MANIFEST_PATH);
  const text = readFileSync(filePath, "utf8");
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  let providersArrayNode = null;
  function findProviders(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "PROVIDERS" &&
      node.initializer
    ) {
      const init = unwrapObjectLiteral(node.initializer);
      if (ts.isArrayLiteralExpression(init)) providersArrayNode = init;
    }
    ts.forEachChild(node, findProviders);
  }
  findProviders(sf);
  if (!providersArrayNode) {
    throw new Error(`could not find PROVIDERS array literal in ${DEPENDENCY_MANIFEST_PATH}`);
  }

  const providers = [];
  for (const el of providersArrayNode.elements) {
    const obj = unwrapObjectLiteral(el);
    if (!obj || !ts.isObjectLiteralExpression(obj)) continue;
    const rec = { name: null, retired: false, tier: null, capabilities: [], fallbackCapabilities: [] };
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
      const key = prop.name.text;
      if (key === "name" && ts.isStringLiteralLike(prop.initializer)) {
        rec.name = prop.initializer.text;
      } else if (key === "retired") {
        const init = unwrapObjectLiteral(prop.initializer);
        rec.retired = init?.kind === ts.SyntaxKind.TrueKeyword;
      } else if (key === "tier" && ts.isStringLiteralLike(prop.initializer)) {
        rec.tier = prop.initializer.text;
      } else if (key === "capabilities") {
        rec.capabilities = stringArrayLiteral(sf, prop.initializer);
      } else if (key === "fallbackCapabilities") {
        rec.fallbackCapabilities = stringArrayLiteral(sf, prop.initializer);
      }
    }
    if (rec.name) providers.push(rec);
  }
  return providers;
}

/**
 * Parses apps/api/src/lib/platform-facts.ts with the TypeScript compiler API
 * and returns the string literals in the `STALE_VENDORS` array (an
 * `as const` wrapper, if present, is unwrapped). Any element that is not a
 * plain string literal is a finding, never silently skipped: a computed or
 * templated entry would make a stale-vendor name invisible to the
 * cross-check.
 */
export function extractStaleVendors(root) {
  const filePath = resolve(root, PLATFORM_FACTS_PATH);
  const text = readFileSync(filePath, "utf8");
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  let arrayNode = null;
  function find(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "STALE_VENDORS" &&
      node.initializer
    ) {
      const init = unwrapObjectLiteral(node.initializer);
      if (ts.isArrayLiteralExpression(init)) arrayNode = init;
    }
    ts.forEachChild(node, find);
  }
  find(sf);
  if (!arrayNode) {
    throw new Error(`could not find STALE_VENDORS array literal in ${PLATFORM_FACTS_PATH}`);
  }

  const names = [];
  for (const el of arrayNode.elements) {
    if (!ts.isStringLiteralLike(el)) {
      const { line } = sf.getLineAndCharacterOfPosition(el.getStart(sf));
      throw new Error(`unrecognised STALE_VENDORS element shape at ${PLATFORM_FACTS_PATH}:${line + 1}`);
    }
    names.push(el.text);
  }
  return names;
}

/**
 * Parses apps/api/src/lib/startup-migrations.ts with the TypeScript compiler
 * API, locates the `sql` tagged template containing the
 * `INSERT INTO vendor_accounts (...) VALUES ...` statement, and returns the
 * first (provider_name) value of every top-level VALUES tuple. The tuple
 * text itself is split by balanced-paren scanning of the isolated template
 * literal, never by a regex over the whole file. Any shape the parser does
 * not recognise (no such tagged template, no VALUES keyword, a tuple whose
 * first value is not a plain string literal) throws, so a future rewrite of
 * this statement fails the check instead of silently reporting zero seeded
 * providers.
 */
export function extractVendorAccountsSeed(root) {
  const filePath = resolve(root, STARTUP_MIGRATIONS_PATH);
  const text = readFileSync(filePath, "utf8");
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  let templateText = null;
  function find(node) {
    if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && node.tag.text === "sql") {
      const template = node.template;
      if (ts.isNoSubstitutionTemplateLiteral(template) && template.text.includes("INSERT INTO vendor_accounts")) {
        templateText = template.text;
      }
    }
    ts.forEachChild(node, find);
  }
  find(sf);
  if (templateText === null) {
    throw new Error(`could not find a sql\`INSERT INTO vendor_accounts (...) VALUES ...\` tagged template in ${STARTUP_MIGRATIONS_PATH}`);
  }

  const valuesMatch = /\bVALUES\b/i.exec(templateText);
  if (!valuesMatch) {
    throw new Error(`the INSERT INTO vendor_accounts statement in ${STARTUP_MIGRATIONS_PATH} has no VALUES keyword`);
  }
  let tuplesText = templateText.slice(valuesMatch.index + valuesMatch[0].length);
  // The tuple list ends at "ON CONFLICT" (its "(provider_name)" column list is
  // not a data tuple); cut there when present so the scan below never walks
  // past the last real VALUES tuple.
  const onConflictMatch = /\bON\s+CONFLICT\b/i.exec(tuplesText);
  if (onConflictMatch) tuplesText = tuplesText.slice(0, onConflictMatch.index);

  // Balanced-paren scan: each top-level "(...)" after VALUES is one tuple.
  const tuples = [];
  let i = 0;
  while (i < tuplesText.length) {
    if (tuplesText[i] === "(") {
      let depth = 1;
      let j = i + 1;
      while (j < tuplesText.length && depth > 0) {
        if (tuplesText[j] === "(") depth++;
        else if (tuplesText[j] === ")") depth--;
        j++;
      }
      if (depth !== 0) {
        throw new Error(`unbalanced parentheses in the INSERT INTO vendor_accounts statement in ${STARTUP_MIGRATIONS_PATH}`);
      }
      tuples.push(tuplesText.slice(i + 1, j - 1));
      i = j;
    } else {
      i++;
    }
  }
  if (tuples.length === 0) {
    throw new Error(`found no VALUES tuples in the INSERT INTO vendor_accounts statement in ${STARTUP_MIGRATIONS_PATH}`);
  }

  const names = [];
  for (const tuple of tuples) {
    const m = /^\s*'([^']*)'/.exec(tuple);
    if (!m) {
      throw new Error(`a VALUES tuple in the INSERT INTO vendor_accounts statement in ${STARTUP_MIGRATIONS_PATH} does not start with a plain string literal: ${tuple.slice(0, 40)}`);
    }
    names.push(m[1]);
  }
  return names;
}

/**
 * The capability slugs in apps/api/src/capabilities/auto-register.ts's
 * DEACTIVATED map (`new Map([[slug, reason], ...])`), read with the
 * TypeScript compiler API. A capability in that map is never registered, so
 * a provider whose every capability is there is not in use.
 */
export function extractDeactivated(root) {
  const filePath = resolve(root, AUTO_REGISTER_PATH);
  const text = readFileSync(filePath, "utf8");
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let mapArray = null;
  function find(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "DEACTIVATED" &&
      node.initializer &&
      ts.isNewExpression(node.initializer) &&
      node.initializer.arguments?.length &&
      ts.isArrayLiteralExpression(node.initializer.arguments[0])
    ) {
      mapArray = node.initializer.arguments[0];
    }
    ts.forEachChild(node, find);
  }
  find(sf);
  if (!mapArray) throw new Error(`could not find the DEACTIVATED new Map([...]) literal in ${AUTO_REGISTER_PATH}`);
  // Two entry shapes occur: a literal pair `[slug, reason]`, and a spread
  // `...[slug, slug].map((slug) => [slug, reason])` sharing one reason. Any
  // other shape is an error, never skipped: a silently missed entry would
  // make a deactivated provider read as live.
  const slugs = new Set();
  for (const el of mapArray.elements) {
    if (ts.isArrayLiteralExpression(el) && el.elements.length > 0 && ts.isStringLiteralLike(el.elements[0])) {
      slugs.add(el.elements[0].text);
      continue;
    }
    if (
      ts.isSpreadElement(el) &&
      ts.isCallExpression(el.expression) &&
      ts.isPropertyAccessExpression(el.expression.expression) &&
      el.expression.expression.name.text === "map" &&
      ts.isArrayLiteralExpression(el.expression.expression.expression) &&
      el.expression.expression.expression.elements.every((e) => ts.isStringLiteralLike(e))
    ) {
      for (const e of el.expression.expression.expression.elements) slugs.add(e.text);
      continue;
    }
    const { line } = sf.getLineAndCharacterOfPosition(el.getStart(sf));
    throw new Error(`unrecognised DEACTIVATED entry shape at ${AUTO_REGISTER_PATH}:${line + 1}`);
  }
  return slugs;
}

// ── coverage matrix + env manifest provider extraction ──────────────────

/** Every apps/api/coverage-matrix/*.yaml row's provider field, with the file it came from. */
export function extractCoverageMatrixProviders(root) {
  const dir = resolve(root, COVERAGE_MATRIX_DIR);
  const rows = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".yaml")) continue;
    if (entry === "schema.json") continue;
    const relPath = `${COVERAGE_MATRIX_DIR}/${entry}`;
    const doc = parseYaml(readFileSync(resolve(dir, entry), "utf8"));
    if (doc && typeof doc.provider === "string") {
      rows.push({ file: relPath, provider: doc.provider });
    }
  }
  return rows.sort((a, b) => a.file.localeCompare(b.file));
}

/** Every config/env-manifest.yaml row's provider field. */
export function extractEnvManifestProviders(root) {
  const doc = parseYaml(readFileSync(resolve(root, ENV_MANIFEST_PATH), "utf8"));
  const rows = [];
  if (Array.isArray(doc)) {
    for (const row of doc) {
      if (row && typeof row.provider === "string" && typeof row.name === "string") {
        rows.push({ envVar: row.name, provider: row.provider });
      }
    }
  }
  return rows;
}

// ── resolution ────────────────────────────────────────────────────────

/** Map from every id/name/alias string to the vendor that owns it, plus a set of duplicate strings. */
function buildResolutionIndex(vendors) {
  const owners = new Map(); // string -> Set of vendor ids
  const record = (str, vendorId) => {
    if (typeof str !== "string" || str.length === 0) return;
    if (!owners.has(str)) owners.set(str, new Set());
    owners.get(str).add(vendorId);
  };
  for (const v of vendors) {
    record(v.id, v.id);
    record(v.name, v.id);
    for (const a of v.aliases ?? []) record(a, v.id);
  }
  return owners;
}

/** Resolves a raw provider string to exactly one vendor id, or null if it resolves to zero or more than one. */
function resolveOne(owners, str) {
  const set = owners.get(str);
  if (!set || set.size !== 1) return null;
  return [...set][0];
}

// ── rule 2: uniqueness ───────────────────────────────────────────────────

export function checkUniqueness(register) {
  const findings = [];
  const vendors = register.vendors ?? [];
  const idCounts = new Map();
  for (const v of vendors) idCounts.set(v.id, (idCounts.get(v.id) ?? 0) + 1);
  for (const [id, count] of idCounts) {
    if (count > 1) findings.push({ code: "DUPLICATE_VENDOR_ID", file: REGISTER_PATH, detail: `vendor id ${id} appears ${count} times` });
  }

  const owners = buildResolutionIndex(vendors);
  for (const [str, ownerSet] of owners) {
    if (ownerSet.size > 1) {
      findings.push({
        code: "AMBIGUOUS_IDENTIFIER",
        file: REGISTER_PATH,
        detail: `"${str}" is used as an id, name, or alias by more than one vendor (${[...ownerSet].join(", ")}); every alias must resolve to exactly one vendor`,
      });
    }
  }

  const ids = new Set(vendors.map((v) => v.id));
  for (const v of vendors) {
    for (const a of v.aliases ?? []) {
      if (a !== v.id && ids.has(a) && a !== v.name) {
        // alias equal to ANOTHER vendor's id (equal to its own id is redundant, not an error)
        for (const other of vendors) {
          if (other.id === a && other.id !== v.id) {
            findings.push({
              code: "ALIAS_EQUALS_ANOTHER_ID",
              file: REGISTER_PATH,
              detail: `${v.id}'s alias "${a}" is equal to vendor ${other.id}'s id`,
            });
          }
        }
      }
    }
  }
  return findings;
}

// ── rule 3: lifecycle ordering ───────────────────────────────────────────

export function checkLifecycleOrdering(register) {
  const findings = [];
  for (const v of register.vendors ?? []) {
    const entries = v.lifecycle ?? [];
    if (entries.length === 0) {
      findings.push({ code: "LIFECYCLE_EMPTY", file: REGISTER_PATH, detail: `${v.id} has no lifecycle entries` });
      continue;
    }
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].date < entries[i - 1].date) {
        findings.push({
          code: "LIFECYCLE_DATES_DECREASING",
          file: REGISTER_PATH,
          detail: `${v.id}'s lifecycle entry ${i} (${entries[i].date}) is earlier than entry ${i - 1} (${entries[i - 1].date}); history is append-only, oldest first`,
        });
      }
    }
  }
  return findings;
}

// ── rule 4: decision + evidence + source paths resolve ──────────────────

export function decisionRecordExists(root, key) {
  if (key === "unknown") return true;
  return existsSync(resolve(root, DECISIONS_DIR, `${key}.md`));
}

export function checkReferences(root, register) {
  const findings = [];
  for (const v of register.vendors ?? []) {
    for (const entry of v.lifecycle ?? []) {
      if (!decisionRecordExists(root, entry.decision)) {
        findings.push({
          code: "DECISION_RECORD_MISSING",
          file: REGISTER_PATH,
          detail: `${v.id}'s lifecycle entry (${entry.date}, ${entry.state}) cites decision ${entry.decision}, which does not resolve to ${DECISIONS_DIR}/${entry.decision}.md`,
        });
      }
    }
    for (const trig of v.reevaluation_triggers ?? []) {
      if (!existsSync(resolve(root, trig.source))) {
        findings.push({
          code: "EVIDENCE_PATH_MISSING",
          file: REGISTER_PATH,
          detail: `${v.id}'s re-evaluation trigger (${trig.kind}) cites source ${trig.source}, which does not exist`,
        });
      }
    }
    for (const key of ["terms", "pricing", "licensing", "redistribution"]) {
      const field = v.verification?.[key];
      if (field?.evidence && !existsSync(resolve(root, field.evidence))) {
        findings.push({
          code: "EVIDENCE_PATH_MISSING",
          file: REGISTER_PATH,
          detail: `${v.id}'s verification.${key}.evidence cites ${field.evidence}, which does not exist`,
        });
      }
    }
    if (v.authorization?.evidence && !existsSync(resolve(root, v.authorization.evidence))) {
      findings.push({
        code: "EVIDENCE_PATH_MISSING",
        file: REGISTER_PATH,
        detail: `${v.id}'s authorization.evidence cites ${v.authorization.evidence}, which does not exist`,
      });
    }
  }
  return findings;
}

// ── rule 5: PROVIDERS resolve + state ────────────────────────────────────

export function checkProvidersCrossCheck(root, register) {
  const findings = [];
  const vendors = register.vendors ?? [];
  const owners = buildResolutionIndex(vendors);
  const byId = new Map(vendors.map((v) => [v.id, v]));

  let providers;
  try {
    providers = extractProviders(root);
  } catch (error) {
    findings.push({ code: "PROVIDERS_UNREADABLE", file: DEPENDENCY_MANIFEST_PATH, detail: String(error) });
    return findings;
  }
  let deactivated;
  try {
    deactivated = extractDeactivated(root);
  } catch (error) {
    findings.push({ code: "DEACTIVATED_UNREADABLE", file: AUTO_REGISTER_PATH, detail: String(error) });
    return findings;
  }

  for (const p of providers) {
    const vendorId = resolveOne(owners, p.name);
    if (!vendorId) {
      findings.push({
        code: "PROVIDER_VENDOR_MISSING",
        file: DEPENDENCY_MANIFEST_PATH,
        detail: `PROVIDERS entry "${p.name}" has no matching vendor id in ${REGISTER_PATH}`,
      });
      continue;
    }
    const vendor = byId.get(vendorId);
    const lifecycle = vendor.lifecycle ?? [];
    const currentState = lifecycle[lifecycle.length - 1]?.state;
    const isFallbackOnly = (p.fallbackCapabilities?.length ?? 0) > 0 && (p.capabilities?.length ?? 0) === 0;
    // A provider kept in PROVIDERS (for example for its health probe) whose
    // every capability is in DEACTIVATED is held, not active; and held is
    // accepted only then, so the state stays tied to what the code runs.
    const allDeactivated = (p.capabilities?.length ?? 0) > 0 && p.capabilities.every((c) => deactivated.has(c));
    if (!p.retired) {
      const expectSet = allDeactivated ? HELD_STATES : isFallbackOnly ? new Set(["fallback"]) : ACTIVE_STATES;
      if (!expectSet.has(currentState)) {
        findings.push({
          code: "PROVIDER_STATE_MISMATCH",
          file: REGISTER_PATH,
          detail: `${vendorId} is a non-retired PROVIDERS entry ("${p.name}")${allDeactivated ? " whose every capability is in DEACTIVATED" : ""} but its current lifecycle state is "${currentState}", expected one of [${[...expectSet].join(", ")}]`,
        });
      }
    } else if (!RETIRED_STATES.has(currentState)) {
      findings.push({
        code: "PROVIDER_STATE_MISMATCH",
        file: REGISTER_PATH,
        detail: `${vendorId} is a retired PROVIDERS entry ("${p.name}") but its current lifecycle state is "${currentState}", expected retired or deprecated`,
      });
    }
  }
  return findings;
}

// ── rule 5b: STALE_VENDORS resolve + state (T6 batch 4a, item 1) ────────

/**
 * Every apps/api/src/lib/platform-facts.ts STALE_VENDORS string must resolve
 * to exactly one register vendor (STALE_VENDOR_UNREGISTERED otherwise), and
 * that vendor's current lifecycle state must be one of the "not in use"
 * states (STALE_VENDOR_STATE_MISMATCH otherwise). Separately, every register
 * vendor whose current state is rejected/deprecated/retired but whose name
 * and aliases are all absent from STALE_VENDORS is reported as a warning
 * (STALE_VENDOR_LIST_MISSING) - closing that gap means editing
 * platform-facts.ts, which is runtime tooling and waits for M4.
 */
export function checkStaleVendorsCrossCheck(root, register) {
  const findings = [];
  const warnings = [];
  const vendors = register.vendors ?? [];
  const owners = buildResolutionIndex(vendors);
  const byId = new Map(vendors.map((v) => [v.id, v]));

  let staleNames;
  try {
    staleNames = extractStaleVendors(root);
  } catch (error) {
    findings.push({ code: "STALE_VENDORS_UNREADABLE", file: PLATFORM_FACTS_PATH, detail: String(error) });
    return { findings, warnings };
  }

  const staleSet = new Set(staleNames);

  for (const name of staleNames) {
    const vendorId = resolveOne(owners, name);
    if (!vendorId) {
      findings.push({
        code: "STALE_VENDOR_UNREGISTERED",
        file: PLATFORM_FACTS_PATH,
        detail: `STALE_VENDORS entry "${name}" has no matching vendor id, name, or alias in ${REGISTER_PATH}`,
      });
      continue;
    }
    const vendor = byId.get(vendorId);
    const lifecycle = vendor.lifecycle ?? [];
    const currentState = lifecycle[lifecycle.length - 1]?.state;
    if (!STALE_ALLOWED_STATES.has(currentState)) {
      findings.push({
        code: "STALE_VENDOR_STATE_MISMATCH",
        file: REGISTER_PATH,
        detail: `${vendorId} is named in STALE_VENDORS ("${name}") but its current lifecycle state is "${currentState}", expected one of [${[...STALE_ALLOWED_STATES].join(", ")}]`,
      });
    }
  }

  for (const v of vendors) {
    const lifecycle = v.lifecycle ?? [];
    const currentState = lifecycle[lifecycle.length - 1]?.state;
    if (!STALE_LIST_CANDIDATE_STATES.has(currentState)) continue;
    const namesToCheck = [v.name, ...(v.aliases ?? [])];
    if (!namesToCheck.some((n) => staleSet.has(n))) {
      warnings.push({
        code: "STALE_VENDOR_LIST_MISSING",
        file: PLATFORM_FACTS_PATH,
        detail: `${v.id} is currently "${currentState}" but neither its name nor any of its aliases appears in STALE_VENDORS`,
      });
    }
  }

  return { findings, warnings };
}

// ── rule 5c: providers the boot-time dependency sync skips (T6 batch 4a, item 2) ─

/**
 * The loop in startup-migrations.ts that upserts vendor_capability_dependencies
 * from PROVIDERS only runs for providers whose tier is paid or self-hosted
 * AND which have a vendor_accounts row seeded by that same file's
 * INSERT INTO vendor_accounts statement. A non-retired provider outside that
 * set is reported (DEPENDENCY_SYNC_SKIPPED, warning): its capability edges
 * are never written, so vendor-control-tower.ts (which reads that table to
 * decide which capabilities/solutions to suspend) suspends nothing if this
 * provider fails.
 */
export function checkDependencySyncSkipped(root) {
  const findings = [];
  const warnings = [];

  let providers;
  try {
    providers = extractProviders(root);
  } catch (error) {
    findings.push({ code: "PROVIDERS_UNREADABLE", file: DEPENDENCY_MANIFEST_PATH, detail: String(error) });
    return { findings, warnings };
  }

  let seededNames;
  try {
    seededNames = new Set(extractVendorAccountsSeed(root));
  } catch (error) {
    findings.push({ code: "VENDOR_ACCOUNTS_SEED_UNREADABLE", file: STARTUP_MIGRATIONS_PATH, detail: String(error) });
    return { findings, warnings };
  }

  for (const p of providers) {
    if (p.retired) continue;
    const hasDependencies = (p.capabilities?.length ?? 0) > 0 || (p.fallbackCapabilities?.length ?? 0) > 0;
    if (!hasDependencies) continue;

    if (!SYNCED_TIERS.has(p.tier)) {
      warnings.push({
        code: "DEPENDENCY_SYNC_SKIPPED",
        file: DEPENDENCY_MANIFEST_PATH,
        detail: `${p.name}: tier "${p.tier}" is not paid or self-hosted, so the boot-time sync in ${STARTUP_MIGRATIONS_PATH} never writes its vendor_capability_dependencies rows`,
      });
      continue;
    }
    if (!seededNames.has(p.name)) {
      warnings.push({
        code: "DEPENDENCY_SYNC_SKIPPED",
        file: DEPENDENCY_MANIFEST_PATH,
        detail: `${p.name}: tier "${p.tier}" but not seeded at boot by ${STARTUP_MIGRATIONS_PATH}'s INSERT INTO vendor_accounts, so the sync's JOIN to vendor_accounts matches no rows for it`,
      });
    }
  }

  return { findings, warnings };
}

// ── rule 6: coverage-matrix + env-manifest resolution ────────────────────

export function checkCoverageMatrixCrossCheck(root, register) {
  const findings = [];
  const vendors = register.vendors ?? [];
  const owners = buildResolutionIndex(vendors);
  const sentinels = new Set(register.non_vendor_sentinels ?? []);
  for (const row of extractCoverageMatrixProviders(root)) {
    if (sentinels.has(row.provider)) continue;
    const vendorId = resolveOne(owners, row.provider);
    if (!vendorId) {
      findings.push({
        code: "COVERAGE_MATRIX_PROVIDER_UNRESOLVED",
        file: row.file,
        detail: `provider "${row.provider}" does not resolve to exactly one vendor id/name/alias in ${REGISTER_PATH} and is not a listed sentinel`,
      });
    }
  }
  return findings;
}

export function checkEnvManifestCrossCheck(root, register) {
  const findings = [];
  const vendors = register.vendors ?? [];
  const owners = buildResolutionIndex(vendors);
  const sentinels = new Set(register.non_vendor_sentinels ?? []);
  for (const row of extractEnvManifestProviders(root)) {
    if (sentinels.has(row.provider)) continue;
    const vendorId = resolveOne(owners, row.provider);
    if (!vendorId) {
      findings.push({
        code: "ENV_MANIFEST_PROVIDER_UNRESOLVED",
        file: ENV_MANIFEST_PATH,
        detail: `${row.envVar}'s provider "${row.provider}" does not resolve to exactly one vendor id/name/alias in ${REGISTER_PATH} and is not a listed sentinel`,
      });
    }
  }
  return findings;
}

// ── rule 7: dead alias / sentinel ────────────────────────────────────────

export function checkDeadAliasesAndSentinels(root, register) {
  const findings = [];
  const vendors = register.vendors ?? [];
  const sentinels = register.non_vendor_sentinels ?? [];

  const surfaceStrings = new Set();
  let providers = [];
  try {
    providers = extractProviders(root);
  } catch {
    /* PROVIDERS_UNREADABLE already reported by rule 5 */
  }
  for (const p of providers) surfaceStrings.add(p.name);
  for (const row of extractCoverageMatrixProviders(root)) surfaceStrings.add(row.provider);
  for (const row of extractEnvManifestProviders(root)) surfaceStrings.add(row.provider);
  try {
    for (const name of extractStaleVendors(root)) surfaceStrings.add(name);
  } catch {
    /* STALE_VENDORS_UNREADABLE already reported by the STALE_VENDORS cross-check */
  }

  for (const v of vendors) {
    for (const a of v.aliases ?? []) {
      if (!surfaceStrings.has(a) && a !== v.id && a !== v.name) {
        findings.push({
          code: "DEAD_ALIAS",
          file: REGISTER_PATH,
          detail: `${v.id}'s alias "${a}" does not currently appear on any surface (PROVIDERS name, coverage-matrix provider, or env-manifest provider)`,
        });
      }
    }
  }
  for (const s of sentinels) {
    if (!surfaceStrings.has(s)) {
      findings.push({
        code: "DEAD_SENTINEL",
        file: REGISTER_PATH,
        detail: `non_vendor_sentinels entry "${s}" does not currently appear on any surface`,
      });
    }
  }
  return findings;
}

// ── rule 8: history against the base branch ──────────────────────────────

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

/**
 * The register as it stood at the merge-base with the base branch, or
 * `null` when there is no base to compare against. Mirrors
 * codex-backlog-lib.mjs's loadBaseBacklog, same git-fact discipline.
 */
export function loadBaseRegister(root, baseRef) {
  const candidates = baseRef ? [baseRef] : ["origin/main", "main"];
  for (const ref of candidates) {
    let base;
    try {
      base = git(root, ["merge-base", "HEAD", ref]);
    } catch {
      continue;
    }
    try {
      const text = git(root, ["show", `${base}:${REGISTER_PATH}`]);
      return { ref, base, doc: parseYaml(text) };
    } catch {
      // Ref exists but the file did not at that point: first introduction.
      return { ref, base, doc: null };
    }
  }
  return null;
}

function gitAvailable(root) {
  try {
    git(root, ["rev-parse", "--git-dir"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} root
 * @param {object} register - the head register (already schema-valid)
 * @param {{ baseRegister?: object|null, baseRef?: string, skipHistory?: boolean }} [options]
 *   `baseRegister` lets a test pass an explicit base document rather than
 *   letting this function read the live merge-base; required so history
 *   tests are not broken by a future merge moving the base out from under
 *   them (the exact failure class this repository hit before: tests green
 *   on a branch, red on main once the branch's own merge became the base).
 */
export function checkHistory(root, register, options = {}) {
  const findings = [];
  const warnings = [];

  let base;
  if (Object.prototype.hasOwnProperty.call(options, "baseRegister")) {
    base = { doc: options.baseRegister };
  } else if (options.skipHistory) {
    return { findings, warnings };
  } else if (!gitAvailable(root)) {
    warnings.push({ code: "GIT_UNREACHABLE", file: REGISTER_PATH, detail: "git is not available in this checkout; history rules (removal, id change, lifecycle rewrite) were not checked" });
    return { findings, warnings };
  } else {
    base = loadBaseRegister(root, options.baseRef);
    if (!base) {
      warnings.push({ code: "HISTORY_UNAVAILABLE", file: REGISTER_PATH, detail: "no origin/main or main to compare against; history rules were not checked" });
      return { findings, warnings };
    }
  }

  if (!base.doc || typeof base.doc !== "object" || !Array.isArray(base.doc.vendors)) {
    // No register file at the base (first introduction): history rules pass.
    return { findings, warnings };
  }

  const headById = new Map((register.vendors ?? []).map((v) => [v.id, v]));
  for (const prevVendor of base.doc.vendors) {
    if (!prevVendor || typeof prevVendor !== "object" || !prevVendor.id) continue;
    const nextVendor = headById.get(prevVendor.id);
    if (!nextVendor) {
      findings.push({
        code: "VENDOR_REMOVED",
        file: REGISTER_PATH,
        detail: `vendor ${prevVendor.id} existed at the base and is gone from HEAD; a vendor is never removed or renamed, only its lifecycle appended to`,
      });
      continue;
    }
    const prevEntries = prevVendor.lifecycle ?? [];
    const nextEntries = nextVendor.lifecycle ?? [];
    if (nextEntries.length < prevEntries.length) {
      findings.push({
        code: "LIFECYCLE_ENTRY_CHANGED",
        file: REGISTER_PATH,
        detail: `${prevVendor.id} had ${prevEntries.length} lifecycle entries at the base and now has fewer (${nextEntries.length}); history is append-only`,
      });
      continue;
    }
    for (let i = 0; i < prevEntries.length; i++) {
      if (JSON.stringify(prevEntries[i]) !== JSON.stringify(nextEntries[i])) {
        findings.push({
          code: "LIFECYCLE_ENTRY_CHANGED",
          file: REGISTER_PATH,
          detail: `${prevVendor.id}'s lifecycle entry ${i} changed from ${JSON.stringify(prevEntries[i])} to ${JSON.stringify(nextEntries[i])}; an existing entry is never edited, only appended after`,
        });
      }
    }
  }
  return { findings, warnings };
}

// ── everything together ──────────────────────────────────────────────────

/**
 * @param {string} root
 * @param {{ baseRegister?: object|null, baseRef?: string, skipHistory?: boolean }} [options]
 */
export function checkAllVendors(root, options = {}) {
  const findings = [];
  const warnings = [];

  const { findings: schemaFindings, register, valid } = checkSchema(root);
  findings.push(...schemaFindings);
  if (!valid) return { findings, warnings, vendorCount: 0 };

  findings.push(...checkUniqueness(register));
  findings.push(...checkLifecycleOrdering(register));
  findings.push(...checkReferences(root, register));
  findings.push(...checkProvidersCrossCheck(root, register));
  const staleResult = checkStaleVendorsCrossCheck(root, register);
  findings.push(...staleResult.findings);
  warnings.push(...staleResult.warnings);
  const syncResult = checkDependencySyncSkipped(root);
  findings.push(...syncResult.findings);
  warnings.push(...syncResult.warnings);
  findings.push(...checkCoverageMatrixCrossCheck(root, register));
  findings.push(...checkEnvManifestCrossCheck(root, register));
  findings.push(...checkDeadAliasesAndSentinels(root, register));

  const history = checkHistory(root, register, options);
  findings.push(...history.findings);
  warnings.push(...history.warnings);

  return { findings, warnings, vendorCount: register.vendors?.length ?? 0 };
}
