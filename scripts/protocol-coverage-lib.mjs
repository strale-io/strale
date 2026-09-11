/**
 * Protocol coverage manifest check (T6 M3 batch 7).
 *
 * docs/project/protocol-coverage.yaml maps every mandatory protocol/rule
 * currently governing this repository -- the ten CLAUDE.md protocols/rules
 * mirrored under docs/governance/protocols/ (batches 6a, 6b, 7) plus
 * production authority (full text in docs/company/CHARTER.md) -- to its
 * trigger, full-body path, governing decision, decision record, and
 * enforcing code/tests. This library validates the manifest against its
 * schema, proves every referenced path exists, and proves nothing that
 * ought to be in the manifest was left out: every mirror file under
 * docs/governance/protocols/ that carries the BEGIN/END VERBATIM markers
 * has a row (MIRROR_UNCOVERED), and every CLAUDE.md heading that names a
 * "... Protocol" or was already mirrored has a row (HEADING_UNCOVERED). It
 * also proves docs/project/PROTOCOL-ROUTER.md -- generated from this
 * manifest by protocolRouterMarkdown/protocolRouterGeneratedFiles below --
 * is up to date (ROUTER_STALE).
 *
 * A single check runs as a warning rather than a blocking finding today, per the
 * migration plan (docs/strategy/2026-08-31-repo-native-operating-model-
 * migration.md, M3 exit criteria): DECISION_ID_UNCOVERED, a decision id
 * CLAUDE.md names inside a protocol's own section, or that apps/api/src
 * code cites next to the word "protocol", with no manifest row citing it.
 * This warning becomes a blocking finding at the M4 cutover, when the full
 * guard in item 16 of the plan's blocking-checks list goes live.
 *
 * authority_active in the manifest stays false throughout: this check
 * proves internal consistency of an inactive coverage record. It never
 * edits CLAUDE.md, a mirror file, or the manifest.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";
import {
  CLAUDE_MD_PATH,
  listCandidateProtocolFiles,
  splitFrontmatter,
} from "./protocol-extraction-lib.mjs";

export function repoRootFrom(importMetaUrl) {
  return resolve(dirname(fileURLToPath(importMetaUrl)), "..");
}

export const MANIFEST_PATH = "docs/project/protocol-coverage.yaml";
export const SCHEMA_PATH = "docs/project/protocol-coverage.schema.json";
export const ROUTER_PATH = "docs/project/PROTOCOL-ROUTER.md";
export const ROUTER_WORD_TARGET = 1_200;

function normalizeEol(text) {
  return text.replace(/\r\n/g, "\n");
}

function readNormalized(root, relPath) {
  return normalizeEol(readFileSync(resolve(root, relPath), "utf8"));
}

// ── loading and schema ──────────────────────────────────────────────────

export function loadSchema(root) {
  return JSON.parse(readFileSync(resolve(root, SCHEMA_PATH), "utf8"));
}

export function loadManifest(root) {
  return parseYaml(readNormalized(root, MANIFEST_PATH));
}

/** Schema-valid manifest only (findings otherwise). Mirrors scheduled-reachability-lib.mjs's checkSchema shape. */
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
  return { findings, manifest: ok ? manifest : null, valid: ok };
}

// ── heading helpers ──────────────────────────────────────────────────────

const CLAUDE_HEADING_RE = /^(#{1,6})\s+(.*)$/;
const SOURCE_HEADING_PREFIX = "CLAUDE.md heading: ";

/** Every heading line in CLAUDE.md, as { level, text }. */
function claudeHeadings(root) {
  const text = readNormalized(root, CLAUDE_MD_PATH);
  const headings = [];
  for (const line of text.split("\n")) {
    const m = CLAUDE_HEADING_RE.exec(line);
    if (m) headings.push({ level: m[1].length, text: m[2].trim() });
  }
  return headings;
}

/** The CLAUDE.md heading text a manifest row claims to mirror, or null for
 * a row sourced elsewhere (e.g. production authority's CHARTER.md heading). */
function rowClaudeHeading(row) {
  if (!row.source || !row.source.startsWith(SOURCE_HEADING_PREFIX)) return null;
  return row.source.slice(SOURCE_HEADING_PREFIX.length).trim();
}

/** source_heading of every mirror file under docs/governance/protocols/ that
 * carries a verbatim marker, keyed by relative file path. */
function mirrorSourceHeadings(root) {
  const map = new Map(); // relPath -> source_heading (or null if unreadable)
  for (const rel of listCandidateProtocolFiles(root)) {
    const content = readNormalized(root, rel);
    const { frontmatter } = splitFrontmatter(content);
    map.set(rel, frontmatter && typeof frontmatter.source_heading === "string" ? frontmatter.source_heading : null);
  }
  return map;
}

/** Every CLAUDE.md heading that names a protocol this manifest ought to
 * cover: a heading containing the word "Protocol" (the five DEC-numbered
 * protocols), plus every mirror file's own source_heading (covers the
 * non-"Protocol"-named rules: Session contract, Shared-Checkout Rule,
 * Worktree node_modules Hazard, Test Infrastructure Cost Principles,
 * Wire-shape rule). */
function expectedHeadings(root) {
  const set = new Set();
  for (const { level, text } of claudeHeadings(root)) {
    // Level 3 ("### ...") only: every mandatory protocol section in
    // CLAUDE.md is a "###" heading. A shallower heading like the top-level
    // "## Workflow Protocol" that merely groups unrelated subsections is
    // not itself a protocol and would otherwise false-positive here.
    if (level === 3 && /\bProtocol\b/.test(text)) set.add(text);
  }
  for (const heading of mirrorSourceHeadings(root).values()) {
    if (heading) set.add(heading);
  }
  return set;
}

// ── router generation ────────────────────────────────────────────────────

// Byte-identical to project-context-lib.mjs's M2_CANDIDATE_BANNER, the same
// duplication decision-records-lib.mjs already makes for its own
// DECISION_INDEX_CANDIDATE_BANNER (see that file's header comment) rather
// than importing it, which would make this module and project-context-lib.mjs
// import each other. check-project-context.mjs's CANDIDATE_BANNER_MISSING
// check compares against the literal text, not a shared reference.
const ROUTER_CANDIDATE_BANNER =
  "> [!CAUTION]\n" +
  "> **M2 CANDIDATE — NOT ACTIVE PROJECT AUTHORITY.**\n" +
  "> Review this candidate in place. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain in force until M4 cutover.";

const ROUTER_EXTRA_CAUTION =
  "Every full protocol body linked below is itself an inactive mirror " +
  "(`authority_active: false`); `CLAUDE.md` remains the sole authority for " +
  "the ten mirrored rows and `docs/company/CHARTER.md` for production " +
  "authority. This router is not mandatory startup context until the " +
  "founder-gated M4 cutover activates it.";

/** Generates docs/project/PROTOCOL-ROUTER.md's Markdown body from a
 * schema-valid manifest. Deterministic: the same manifest always produces
 * byte-identical output, so two runs of `npm run context:generate` never
 * diff. */
export function protocolRouterMarkdown(manifest) {
  const rows = [...manifest.protocols].sort((a, b) => a.id.localeCompare(b.id));
  const routerDir = dirname(ROUTER_PATH); // "docs/project"
  const tableRows = rows.map((row) => {
    const link = relative(routerDir, row.full_body).split("\\").join(posix.sep);
    return `| ${row.trigger.trim().replace(/\s+/g, " ")} | [${row.name}](${link}) | \`${row.full_body}\` |`;
  });
  return `---
doc_type: protocol-router
authority_scope: none
status: candidate
complete: false
phase: M2
m1_template: false
authority_active: false
verified_at: 2026-09-11
generated: true
---

# Protocol Router (Candidate)

${ROUTER_CANDIDATE_BANNER}

${ROUTER_EXTRA_CAUTION}

**PARTIAL GENERATED VIEW.** Generated from \`docs/project/protocol-coverage.yaml\`
by \`scripts/protocol-coverage-lib.mjs\` (\`npm run context:generate\`); checked
for drift by \`npm run protocols:coverage\`. Do not hand-edit this file --
change the manifest and regenerate.

| Trigger | Protocol | Full body |
|---|---|---|
${tableRows.join("\n")}
`;
}

/** { "docs/project/PROTOCOL-ROUTER.md": <markdown> }, wired into
 * generatedFiles() in project-context-lib.mjs the same way
 * decisionGeneratedFiles() is. Throws (never silently emits a stale or
 * schema-invalid router) if the manifest fails schema validation. */
export function protocolRouterGeneratedFiles(root) {
  const { manifest, valid, findings } = checkSchema(root);
  if (!valid) {
    throw new Error(
      `cannot generate ${ROUTER_PATH}: ${MANIFEST_PATH} fails schema validation (${findings.map((f) => f.code).join(", ")})`,
    );
  }
  return { [ROUTER_PATH]: protocolRouterMarkdown(manifest) };
}

// ── decision references (report-only, becomes blocking at M4) ───────────

const CLAUDE_DECISION_RE = /\bDEC-\d{8}(?:-[A-Za-z0-9]+)*\b/g;

/** Decision ids CLAUDE.md names inside one of the ten protocol sections
 * (the section owned by a heading in expectedHeadings), plus decision ids
 * apps/api/src code cites on a line that also contains the word
 * "protocol" (case-insensitive). Used only for the DECISION_ID_UNCOVERED
 * warning; never for a blocking finding. */
function decisionIdsNamedByProtocolSections(root) {
  const text = readNormalized(root, CLAUDE_MD_PATH);
  const lines = text.split("\n");
  const headings = expectedHeadings(root);
  const ids = new Set();
  let inSection = false;
  let sectionLevel = 0;
  for (const line of lines) {
    const m = CLAUDE_HEADING_RE.exec(line);
    if (m) {
      const level = m[1].length;
      const text2 = m[2].trim();
      if (inSection && level <= sectionLevel) inSection = false;
      if (headings.has(text2)) {
        inSection = true;
        sectionLevel = level;
        continue; // the heading line itself is excluded from the id scan
      }
    }
    if (inSection) {
      for (const match of line.matchAll(CLAUDE_DECISION_RE)) ids.add(match[0]);
    }
  }
  return ids;
}

function listApiSourceFiles(root) {
  const dir = resolve(root, "apps/api/src");
  const out = [];
  const walk = (abs, rel) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const absChild = resolve(abs, entry.name);
      const relChild = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(absChild, relChild);
      } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
        out.push(`apps/api/src/${relChild}`);
      }
    }
  };
  if (existsSync(dir)) walk(dir, "");
  return out;
}

function decisionIdsCitedNextToProtocolInCode(root) {
  const ids = new Set();
  for (const rel of listApiSourceFiles(root)) {
    const content = readFileSync(resolve(root, rel), "utf8");
    for (const line of content.split(/\r?\n/)) {
      if (!/protocol/i.test(line)) continue;
      for (const match of line.matchAll(CLAUDE_DECISION_RE)) ids.add(match[0]);
    }
  }
  return ids;
}

// ── the full check ───────────────────────────────────────────────────────

/** Runs every check and returns { findings, warnings, protocolCount }. Schema
 * validity gates the rest, same discipline as scheduled-reachability-lib.mjs
 * and vendors-lib.mjs: an invalid manifest returns only SCHEMA_INVALID. */
export function checkAllProtocolCoverage(root) {
  const { findings: schemaFindings, manifest, valid } = checkSchema(root);
  if (!valid) {
    return { findings: schemaFindings, warnings: [], protocolCount: 0 };
  }

  const findings = [];
  const warnings = [];
  const rows = manifest.protocols;

  // Duplicate ids.
  const seenIds = new Map();
  for (const row of rows) {
    if (seenIds.has(row.id)) {
      findings.push({ code: "DUPLICATE_ID", file: MANIFEST_PATH, detail: `id "${row.id}" appears more than once` });
    }
    seenIds.set(row.id, row);
  }

  // Referenced paths must exist.
  for (const row of rows) {
    if (!existsSync(resolve(root, row.full_body))) {
      findings.push({ code: "FULL_BODY_MISSING", file: MANIFEST_PATH, detail: `row "${row.id}": full_body "${row.full_body}" does not exist` });
    }
    if (row.decision_record !== null && !existsSync(resolve(root, row.decision_record))) {
      findings.push({ code: "DECISION_RECORD_MISSING", file: MANIFEST_PATH, detail: `row "${row.id}": decision_record "${row.decision_record}" does not exist` });
    }
    for (const path of row.enforced_by ?? []) {
      if (!existsSync(resolve(root, path))) {
        findings.push({ code: "ENFORCED_BY_MISSING", file: MANIFEST_PATH, detail: `row "${row.id}": enforced_by path "${path}" does not exist` });
      }
    }
  }

  // Every mirror file under docs/governance/protocols/ must have a row.
  const coveredFullBodies = new Set(rows.map((row) => row.full_body));
  for (const rel of listCandidateProtocolFiles(root)) {
    if (!coveredFullBodies.has(rel)) {
      findings.push({ code: "MIRROR_UNCOVERED", file: rel, detail: `no ${MANIFEST_PATH} row has full_body "${rel}"` });
    }
  }

  // Every protocol-shaped or already-mirrored CLAUDE.md heading must have a row.
  const coveredHeadings = new Set(rows.map(rowClaudeHeading).filter(Boolean));
  for (const heading of expectedHeadings(root)) {
    if (!coveredHeadings.has(heading)) {
      findings.push({ code: "HEADING_UNCOVERED", file: CLAUDE_MD_PATH, detail: `heading "${heading}" has no ${MANIFEST_PATH} row` });
    }
  }

  // Router must be up to date with the manifest.
  const expectedRouter = protocolRouterMarkdown(manifest);
  const routerAbsolute = resolve(root, ROUTER_PATH);
  if (!existsSync(routerAbsolute)) {
    findings.push({ code: "ROUTER_STALE", file: ROUTER_PATH, detail: "file does not exist" });
  } else if (readNormalized(root, ROUTER_PATH) !== normalizeEol(expectedRouter)) {
    findings.push({ code: "ROUTER_STALE", file: ROUTER_PATH, detail: "router content does not match docs/project/protocol-coverage.yaml; run npm run context:generate" });
  }

  // Report-only: a decision id named inside a covered protocol section, or
  // cited next to "protocol" in apps/api/src code, with no manifest row.
  // Becomes a blocking finding at the M4 cutover (see this file's header).
  const coveredDecisions = new Set(rows.map((row) => row.decision).filter((d) => d !== "none"));
  const namedInClaude = decisionIdsNamedByProtocolSections(root);
  const namedInCode = decisionIdsCitedNextToProtocolInCode(root);
  for (const id of new Set([...namedInClaude, ...namedInCode])) {
    if (!coveredDecisions.has(id)) {
      warnings.push({
        code: "DECISION_ID_UNCOVERED",
        file: namedInClaude.has(id) ? CLAUDE_MD_PATH : "apps/api/src",
        detail: `decision id "${id}" is named next to a protocol but no ${MANIFEST_PATH} row cites it as its decision`,
      });
    }
  }

  return { findings, warnings, protocolCount: rows.length };
}
