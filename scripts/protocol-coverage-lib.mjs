/**
 * Protocol coverage manifest check (T6 M3 batch 7; review round 1 replaces
 * the heading-coverage rule with excluded_sections/HEADING_UNCLASSIFIED and
 * reads verified_at from the manifest).
 *
 * docs/project/protocol-coverage.yaml maps every mandatory protocol/rule
 * currently governing this repository -- the CLAUDE.md protocols/rules
 * mirrored under docs/governance/protocols/ (batches 6a, 6b, 7) plus
 * production authority (full text in docs/company/CHARTER.md) -- to its
 * trigger, full-body path, governing decision, decision record, and
 * enforcing code/tests. This library validates the manifest against its
 * schema, proves every referenced path exists, and proves nothing that
 * ought to be in the manifest was left out: every mirror file under
 * docs/governance/protocols/ that carries the BEGIN/END VERBATIM markers
 * has a row (MIRROR_UNCOVERED), and every level-2 or level-3 CLAUDE.md
 * heading is either covered by a row or listed in the manifest's
 * excluded_sections with a reason (HEADING_UNCLASSIFIED when it is
 * neither; EXCLUSION_STALE when an excluded_sections entry names a heading
 * no longer in CLAUDE.md). Review round 1 replaced the previous
 * "heading contains the word Protocol" heuristic, which silently left
 * code-enforced sections like "Review routing" (npm run codex:check) and
 * "Drift-prevention surfaces" (check-platform-facts-drift.ts) uncovered. It
 * also proves docs/project/PROTOCOL-ROUTER.md -- generated from this
 * manifest by protocolRouterMarkdown/protocolRouterGeneratedFiles below --
 * is up to date (ROUTER_STALE).
 *
 * A single check runs as a warning rather than a blocking finding today, per the
 * migration plan (docs/strategy/2026-08-31-repo-native-operating-model-
 * migration.md, M3 exit criteria): DECISION_ID_UNCOVERED, a decision id
 * CLAUDE.md names inside a covered protocol's own section, or that
 * apps/api/src code cites next to the word "protocol", with no manifest row
 * citing it. This warning becomes a blocking finding at the M4 cutover, when
 * the full guard in item 16 of the plan's blocking-checks list goes live.
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

/** Every level-2 ("## ...") or level-3 ("### ...") CLAUDE.md heading text.
 * These are the two heading levels the manifest's classification rule
 * covers: every one of them must be either a row (covered) or an
 * excluded_sections entry (excluded) -- HEADING_UNCLASSIFIED/EXCLUSION_STALE
 * below prove there is no third state. A level-4+ heading (the dated
 * decision-log subsections, the pipeline's flag/template subsections) is
 * out of scope by rule, not by name: it sits inside an already-classified
 * level-2/3 section. */
function classifiableHeadings(root) {
  const set = new Set();
  for (const { level, text } of claudeHeadings(root)) {
    if (level === 2 || level === 3) set.add(text);
  }
  return set;
}

/** The CLAUDE.md heading text a manifest row claims to mirror, or null for
 * a row sourced elsewhere (e.g. production authority's CHARTER.md heading). */
function rowClaudeHeading(row) {
  if (!row.source || !row.source.startsWith(SOURCE_HEADING_PREFIX)) return null;
  return row.source.slice(SOURCE_HEADING_PREFIX.length).trim();
}

// ── router generation ────────────────────────────────────────────────────

// M4 batch 1d activated docs/project/PROTOCOL-ROUTER.md. Byte-identical to
// project-context-lib.mjs's M4_ACTIVE_BANNER, the same duplication
// decision-records-lib.mjs already makes for its own
// DECISION_INDEX_ACTIVE_BANNER (see that file's header comment) rather
// than importing it, which would make this module and project-context-lib.mjs
// import each other. check-project-context.mjs's ACTIVE_BANNER_MISSING
// check compares against the literal text, not a shared reference.
const ROUTER_ACTIVE_BANNER =
  "> [!NOTE]\n" +
  "> **ACTIVE PROJECT AUTHORITY (M4).**\n" +
  "> This document is authoritative repo-native project truth on the `m4/cutover` integration branch. `AGENTS.md` and `CLAUDE.md` on `main` remain authoritative until the single M4 cutover merge folds this branch in.";

const ROUTER_MIRROR_NOTE =
  "Every full protocol body linked below is, for now, an inactive mirror " +
  "(`authority_active: false`) under `docs/governance/protocols/`; " +
  "`CLAUDE.md` remains the authoritative full text for each mirrored row " +
  "and `docs/company/CHARTER.md` for production authority, until a later " +
  "batch migrates them. This router itself is the active navigation index " +
  "from trigger to full body.";

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
status: active
complete: true
phase: M4
m1_template: false
authority_active: true
verified_at: ${manifest.verified_at}
generated: true
---

# Protocol Router

${ROUTER_ACTIVE_BANNER}

${ROUTER_MIRROR_NOTE}

**Generated router.** Generated from \`docs/project/protocol-coverage.yaml\`
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

/** Decision ids CLAUDE.md names inside one of the covered protocol sections
 * (the section owned by a heading a manifest row claims, per
 * `coveredHeadings`), plus decision ids apps/api/src code cites on a line
 * that also contains the word "protocol" (case-insensitive). Used only for
 * the DECISION_ID_UNCOVERED warning; never for a blocking finding. */
function decisionIdsNamedByProtocolSections(root, coveredHeadings) {
  const text = readNormalized(root, CLAUDE_MD_PATH);
  const lines = text.split("\n");
  const headings = coveredHeadings;
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

  // Every level-2 or level-3 CLAUDE.md heading is either covered by a row
  // or listed in excluded_sections -- there is no third state.
  const coveredHeadings = new Set(rows.map(rowClaudeHeading).filter(Boolean));
  const excludedSections = manifest.excluded_sections ?? [];
  const excludedHeadings = new Set(excludedSections.map((entry) => entry.heading));
  const actualHeadings = classifiableHeadings(root);

  for (const heading of actualHeadings) {
    if (!coveredHeadings.has(heading) && !excludedHeadings.has(heading)) {
      findings.push({
        code: "HEADING_UNCLASSIFIED",
        file: CLAUDE_MD_PATH,
        detail: `heading "${heading}" has no ${MANIFEST_PATH} row and is not in excluded_sections`,
      });
    }
  }
  for (const entry of excludedSections) {
    if (!actualHeadings.has(entry.heading)) {
      findings.push({
        code: "EXCLUSION_STALE",
        file: MANIFEST_PATH,
        detail: `excluded_sections heading "${entry.heading}" is no longer a level-2/3 heading in CLAUDE.md`,
      });
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
  const namedInClaude = decisionIdsNamedByProtocolSections(root, coveredHeadings);
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
