import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";
import { decisionGeneratedFiles } from "./decision-records-lib.mjs";

export const M1_BANNER =
  "> [!CAUTION]\n" +
  "> **M1 NON-AUTHORITATIVE SKELETON — DO NOT USE AS PROJECT TRUTH.**\n" +
  "> Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain in force.";

export const M2_CANDIDATE_BANNER =
  "> [!CAUTION]\n" +
  "> **M2 CANDIDATE — NOT ACTIVE PROJECT AUTHORITY.**\n" +
  "> Review this candidate in place. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain in force until M4 cutover.";

const TEMPLATE_SENTINEL = "<!-- M1-TEMPLATE: no project truth -->";

function frontmatter(docType, extra = {}) {
  const values = {
    doc_type: docType,
    authority_scope: "none",
    status: "skeleton",
    complete: false,
    phase: "M1",
    m1_template: true,
    ...extra,
  };
  return [
    "---",
    ...Object.entries(values).map(([key, value]) => `${key}: ${String(value)}`),
    "---",
  ].join("\n");
}

function skeleton(docType, title, body, extra = {}) {
  return `${frontmatter(docType, extra)}\n\n# ${title}\n\n${M1_BANNER}\n\n${TEMPLATE_SENTINEL}\n\n${body.trim()}\n`;
}

export const SKELETON_DOCUMENTS = Object.freeze({
  "docs/project/START-HERE.md": skeleton(
    "project-navigation",
    "Start Here",
    `This file is inert during M1. No root entrypoint links here yet.

Future clean-session order (not active): PRODUCT → STATE → ROADMAP → generated
decision/recent-work views → protocol router.`,
  ),
  "docs/project/RECENT.md": skeleton(
    "generated-recent-work",
    "Recent Material Work",
    `**PARTIAL GENERATED VIEW — ` + "`complete: false`" + `.**

No authoritative recent-work feed is published during M1.`,
    { generated: true },
  ),
  "docs/project/WORKING-MODEL.md": skeleton(
    "project-working-model",
    "Working Model",
    `This template will define document contracts, promotion from evidence to
truth, update duties, and session-close behavior after cutover review.`,
  ),
  "docs/project/PROTOCOL-ROUTER.md": skeleton(
    "protocol-router",
    "Protocol Router",
    `No protocol routes are active in M1. Mandatory protocol text remains in the
existing entrypoints and Claude workflow files until it is extracted and
coverage-checked in later milestones.`,
  ),
  "docs/governance/README.md": skeleton(
    "governance-navigation",
    "Governance",
    "Existing governance documents remain at their current paths and retain their current authority.",
  ),
  "docs/governance/protocols/README.md": skeleton(
    "protocol-library-navigation",
    "Protocol Library",
    "No protocol body has moved. This directory is an inert future destination.",
  ),
});

// These files become authored candidates during M2. They are deliberately not
// returned by generatedFiles(): running context:generate must never overwrite
// reconciled project truth with the old M1 placeholders.
export const M2_CANDIDATE_DOCUMENTS = Object.freeze({
  "docs/project/PRODUCT.md": "project-product",
  "docs/project/STATE.md": "project-state",
  "docs/project/ROADMAP.md": "project-roadmap",
  "docs/decisions/README.md": "decision-system-readme",
  "docs/decisions/PENDING.md": "pending-founder-decisions",
});

export const M2_GENERATED_DOCUMENTS = Object.freeze({
  "docs/project/DECISIONS.md": "generated-decision-index",
});

export const M2_CANDIDATE_WORD_LIMITS = Object.freeze({
  "docs/project/PRODUCT.md": 1_200,
  "docs/project/STATE.md": 2_000,
  "docs/project/ROADMAP.md": 1_500,
  "docs/decisions/README.md": 1_000,
  "docs/decisions/PENDING.md": 1_000,
  "docs/project/DECISIONS.md": 1_500,
});

export const INVENTORY_TARGETS = Object.freeze([
  { path: "AGENTS.md", owner_area: "root-agent-entrypoint" },
  { path: "CLAUDE.md", owner_area: "root-agent-entrypoint" },
  { path: ".claude/PROTOCOL.md", owner_area: "claude-workflow" },
  { path: ".claude/RUNBOOK.md", owner_area: "claude-workflow" },
  { path: ".claude/WORKFLOW.md", owner_area: "claude-workflow" },
  { path: ".claude/BUILD.md", owner_area: "claude-workflow" },
  { path: ".claude/NOTION.md", owner_area: "claude-workflow" },
  { path: ".claude/DISPATCH.yaml", owner_area: "claude-workflow" },
  { path: ".claude/commands", owner_area: "claude-commands" },
  { path: ".agents/skills", owner_area: "shared-agent-skills" },
  { path: ".codex/hooks.json", owner_area: "codex-workflow" },
  { path: "docs/company", owner_area: "company-governance" },
  { path: "docs/strategy", owner_area: "strategy-evidence" },
  { path: "docs/remediation", owner_area: "remediation-program" },
  { path: "handoff", owner_area: "session-handoffs" },
]);

export const PROJECT_DOCUMENT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Project document front matter",
  type: "object",
  additionalProperties: true,
  required: ["doc_type", "authority_scope", "status", "complete", "phase"],
  properties: {
    doc_type: { type: "string", minLength: 1 },
    authority_scope: { const: "none" },
    status: { enum: ["skeleton", "candidate"] },
    complete: { const: false },
    phase: { enum: ["M1", "M2"] },
    m1_template: { type: "boolean" },
    authority_active: { type: "boolean" },
    verified_at: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  },
  oneOf: [
    {
      required: ["m1_template"],
      properties: {
        status: { const: "skeleton" },
        phase: { const: "M1" },
        m1_template: { const: true },
      },
    },
    {
      required: ["m1_template", "authority_active", "verified_at"],
      properties: {
        status: { const: "candidate" },
        phase: { const: "M2" },
        m1_template: { const: false },
        authority_active: { const: false },
        verified_at: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      },
    },
  ],
  allOf: [
    {
      if: {
        required: ["doc_type"],
        properties: { doc_type: { const: "project-state" } },
      },
      then: {
        required: [
          "backend_reviewed_ref",
          "production_observed_ref",
          "production_observed_at",
          "production_status",
          "frontend_main_ref",
          "frontend_redesign_ref",
          "state_evidence_ref",
        ],
        properties: {
          backend_reviewed_ref: { type: "string", pattern: "^[a-f0-9]{40}$" },
          production_observed_ref: { type: "string", pattern: "^[a-f0-9]{7,40}$" },
          production_observed_at: {
            type: "string",
            pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z$",
          },
          production_status: { const: "ok" },
          frontend_main_ref: { type: "string", pattern: "^[a-f0-9]{40}$" },
          frontend_redesign_ref: { type: "string", pattern: "^[a-f0-9]{40}$" },
          state_evidence_ref: {
            type: "string",
            pattern: "^archive/sessions/[a-zA-Z0-9._/-]+\\.json$",
          },
        },
      },
    },
  ],
};

export const OPERATOR_ACTIONS_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Inactive M2 operator-action registry",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "doc_type",
    "authority_scope",
    "status",
    "complete",
    "phase",
    "authority_active",
    "verified_at",
    "actions",
  ],
  properties: {
    schema_version: { const: 1 },
    doc_type: { const: "operator-actions" },
    authority_scope: { const: "none" },
    status: { const: "candidate" },
    complete: { const: false },
    phase: { const: "M2" },
    authority_active: { const: false },
    verified_at: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "subject",
          "status",
          "authority",
          "authority_purpose",
          "prepared_ref",
          "preflight_evidence_ref",
          "prepared_at",
          "executed_at",
          "execution_evidence",
          "reconciled_at",
          "reconciliation_evidence",
          "cancelled_at",
          "cancellation_reason",
          "cancellation_evidence",
          "blocks_acceptance_of",
          "targets",
          "next_step",
        ],
        properties: {
          id: { type: "string", pattern: "^OA-\\d{8}-[A-Z0-9-]+$" },
          subject: { type: "string", minLength: 1 },
          status: { enum: ["prepared", "executed", "reconciled", "cancelled"] },
          authority: {
            enum: ["approval_required", "preauthorized_notice", "system_acting"],
          },
          authority_purpose: { type: "string", pattern: "^[a-z0-9_]+$" },
          prepared_ref: {
            type: "string",
            pattern: "^[0-9a-f]{40}:[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*$",
          },
          preflight_evidence_ref: {
            type: "string",
            pattern: "^archive/sessions/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_.-]+)*\\.json$",
          },
          prepared_at: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          executed_at: {
            type: ["string", "null"],
            pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z$",
          },
          execution_evidence: {
            type: ["string", "null"],
            pattern: "^archive/sessions/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]+\\.json$",
          },
          reconciled_at: {
            type: ["string", "null"],
            pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z$",
          },
          reconciliation_evidence: {
            type: ["string", "null"],
            pattern: "^archive/sessions/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]+\\.json$",
          },
          cancelled_at: {
            type: ["string", "null"],
            pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z$",
          },
          cancellation_reason: { type: ["string", "null"], minLength: 1 },
          cancellation_evidence: {
            type: ["string", "null"],
            pattern: "^archive/sessions/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]+\\.json$",
          },
          blocks_acceptance_of: {
            type: "array",
            minItems: 1,
            uniqueItems: true,
            items: {
              type: "string",
              pattern: "^docs/[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*\\.md#[a-z0-9-]+$",
            },
          },
          targets: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["key", "current", "desired"],
              properties: {
                key: { type: "string", minLength: 1 },
                current: { type: ["string", "number", "null"] },
                desired: { type: ["string", "number", "null"] },
              },
            },
          },
          next_step: { type: "string", minLength: 1 },
        },
        allOf: [
          {
            if: { properties: { status: { const: "prepared" } }, required: ["status"] },
            then: {
              properties: {
                executed_at: { const: null },
                execution_evidence: { const: null },
                reconciled_at: { const: null },
                reconciliation_evidence: { const: null },
                cancelled_at: { const: null },
                cancellation_reason: { const: null },
                cancellation_evidence: { const: null },
              },
            },
          },
          {
            if: { properties: { status: { const: "executed" } }, required: ["status"] },
            then: {
              properties: {
                executed_at: { type: "string" },
                execution_evidence: { type: "string" },
                reconciled_at: { const: null },
                reconciliation_evidence: { const: null },
                cancelled_at: { const: null },
                cancellation_reason: { const: null },
                cancellation_evidence: { const: null },
              },
            },
          },
          {
            if: { properties: { status: { const: "reconciled" } }, required: ["status"] },
            then: {
              properties: {
                executed_at: { type: "string" },
                execution_evidence: { type: "string" },
                reconciled_at: { type: "string" },
                reconciliation_evidence: { type: "string" },
                cancelled_at: { const: null },
                cancellation_reason: { const: null },
                cancellation_evidence: { const: null },
              },
            },
          },
          {
            if: { properties: { status: { const: "cancelled" } }, required: ["status"] },
            then: {
              properties: {
                executed_at: { const: null },
                execution_evidence: { const: null },
                reconciled_at: { const: null },
                reconciliation_evidence: { const: null },
                cancelled_at: { type: "string" },
                cancellation_reason: { type: "string" },
                cancellation_evidence: { type: "string" },
              },
            },
          },
        ],
      },
    },
  },
};

const operatorActionsAjv = new Ajv2020({
  allErrors: true,
  strict: true,
  allowUnionTypes: true,
});
const validateOperatorActionsSchema = operatorActionsAjv.compile(OPERATOR_ACTIONS_SCHEMA);

export const INVENTORY_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "M1 legacy authority bare-enumeration manifest",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "mode", "complete", "entries"],
  properties: {
    schema_version: { const: 1 },
    mode: { const: "bare-enumeration" },
    complete: { const: false },
    entries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "path",
          "owner_area",
          "sha256",
          "detected_references",
        ],
        properties: {
          path: { type: "string" },
          owner_area: { type: "string" },
          sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
          detected_references: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
  },
};

const TEXT_EXTENSIONS = new Set([
  "",
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function trackedFiles(root) {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  });
  return output.split("\0").filter(Boolean).sort();
}

function slash(value) {
  return value.split(sep).join("/");
}

function filesForTarget(root, target, allTracked) {
  const absolute = resolve(root, target);
  if (!existsSync(absolute)) throw new Error(`inventory target is missing: ${target}`);
  if (statSync(absolute).isFile()) return [target];
  const prefix = `${target.replace(/\/$/, "")}/`;
  const files = allTracked.filter((file) => file.startsWith(prefix));
  if (files.length === 0) throw new Error(`inventory directory has no tracked files: ${target}`);
  return files;
}

function indexedBlobIds(root) {
  const output = execFileSync("git", ["ls-files", "-s", "-z"], {
    cwd: root,
    encoding: "utf8",
  });
  const ids = new Map();
  for (const entry of output.split("\0").filter(Boolean)) {
    const tab = entry.indexOf("\t");
    if (tab < 0) continue;
    const [mode, objectId, stage] = entry.slice(0, tab).split(" ");
    const file = entry.slice(tab + 1);
    if (mode && objectId && stage === "0") ids.set(file, objectId);
  }
  return ids;
}

function hashFiles(files, blobIds) {
  const hash = createHash("sha256");
  for (const file of files) {
    const objectId = blobIds.get(file);
    if (!objectId) throw new Error(`inventory file is not staged or tracked: ${file}`);
    hash.update(file);
    hash.update("\0");
    // Hash the canonical Git object identity, not working-tree bytes. This
    // prevents CRLF checkout conversion from changing generated inventory.
    hash.update(objectId);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function searchableFiles(root, allTracked) {
  return allTracked.filter((file) => {
    if (
      file.startsWith("docs/project/") ||
      file.startsWith("docs/decisions/") ||
      file.startsWith("docs/governance/") ||
      file === "scripts/project-context-lib.mjs" ||
      file === "scripts/generate-project-context.mjs" ||
      file === "scripts/check-project-context.mjs" ||
      file === "scripts/check-project-context.test.mjs"
    ) {
      return false;
    }
    const absolute = resolve(root, file);
    if (!existsSync(absolute) || statSync(absolute).size > 1_000_000) return false;
    return TEXT_EXTENSIONS.has(extname(file).toLowerCase());
  }).map((file) => ({
    file,
    content: readFileSync(resolve(root, file), "utf8"),
  }));
}

function detectReferences(target, textFiles) {
  const needles = [target];
  if (!target.includes("/")) needles.push(target.split("/").at(-1));
  return textFiles
    .filter(({ file }) => file !== target && !file.startsWith(`${target}/`))
    .filter(({ content }) => needles.some((needle) => content.includes(needle)))
    .map(({ file }) => file)
    .sort();
}

export function buildInventory(root) {
  const allTracked = trackedFiles(root);
  const blobIds = indexedBlobIds(root);
  const textFiles = searchableFiles(root, allTracked);
  const entries = INVENTORY_TARGETS.map((target) => {
    const files = filesForTarget(root, target.path, allTracked);
    return {
      path: target.path,
      owner_area: target.owner_area,
      sha256: hashFiles(files, blobIds),
      detected_references: detectReferences(target.path, textFiles),
    };
  });
  return {
    schema_version: 1,
    mode: "bare-enumeration",
    complete: false,
    entries,
  };
}

export function generatedFiles(root) {
  return {
    ...SKELETON_DOCUMENTS,
    ...decisionGeneratedFiles(root),
    "docs/project/schemas/project-document.schema.json":
      `${JSON.stringify(PROJECT_DOCUMENT_SCHEMA, null, 2)}\n`,
    "docs/project/schemas/operator-actions.schema.json":
      `${JSON.stringify(OPERATOR_ACTIONS_SCHEMA, null, 2)}\n`,
    "docs/project/schemas/legacy-authority-inventory.schema.json":
      `${JSON.stringify(INVENTORY_SCHEMA, null, 2)}\n`,
    "docs/project/legacy-authority-inventory.json":
      `${JSON.stringify(buildInventory(root), null, 2)}\n`,
  };
}

export function writeGeneratedFiles(root) {
  const files = generatedFiles(root);
  for (const [file, content] of Object.entries(files)) {
    const absolute = resolve(root, file);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }
  return Object.keys(files).sort();
}

export function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const values = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    values[key] = raw === "true" ? true : raw === "false" ? false : raw;
  }
  return values;
}

export function validateSkeletonDocument(file, actual, expected) {
  const findings = [];
  const meta = parseFrontmatter(actual);
  if (!meta) {
    findings.push({ code: "SKELETON_FRONTMATTER_MISSING", path: file });
    return findings;
  }
  for (const [key, value] of Object.entries({
    authority_scope: "none",
    status: "skeleton",
    complete: false,
    phase: "M1",
    m1_template: true,
  })) {
    if (meta[key] !== value) {
      findings.push({ code: "SKELETON_MARKER_INVALID", path: file, detail: key });
    }
  }
  if (!actual.includes(M1_BANNER)) {
    findings.push({ code: "SKELETON_BANNER_MISSING", path: file });
  }
  if (!actual.includes(TEMPLATE_SENTINEL)) {
    findings.push({ code: "SKELETON_SENTINEL_MISSING", path: file });
  }
  if (actual !== expected) {
    findings.push({ code: "SKELETON_TEMPLATE_DRIFT", path: file });
  }
  return findings;
}

export function validateCandidateDocument(file, actual, expectedDocType) {
  const findings = [];
  const meta = parseFrontmatter(actual);
  if (!meta) {
    findings.push({ code: "CANDIDATE_FRONTMATTER_MISSING", path: file });
    return findings;
  }
  for (const [key, value] of Object.entries({
    doc_type: expectedDocType,
    authority_scope: "none",
    status: "candidate",
    complete: false,
    phase: "M2",
    m1_template: false,
    authority_active: false,
  })) {
    if (meta[key] !== value) {
      findings.push({ code: "CANDIDATE_MARKER_INVALID", path: file, detail: key });
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(meta.verified_at ?? ""))) {
    findings.push({ code: "CANDIDATE_VERIFIED_AT_INVALID", path: file });
  }
  if (expectedDocType === "project-state") {
    const stateFields = {
      backend_reviewed_ref: /^[a-f0-9]{40}$/,
      production_observed_ref: /^[a-f0-9]{7,40}$/,
      production_observed_at: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/,
      production_status: /^ok$/,
      frontend_main_ref: /^[a-f0-9]{40}$/,
      frontend_redesign_ref: /^[a-f0-9]{40}$/,
      state_evidence_ref: /^archive\/sessions\/[a-zA-Z0-9._/-]+\.json$/,
    };
    for (const [field, pattern] of Object.entries(stateFields)) {
      if (!pattern.test(String(meta[field] ?? ""))) {
        findings.push({ code: "STATE_VERIFICATION_REF_INVALID", path: file, detail: field });
      }
    }
  }
  if (!actual.includes(M2_CANDIDATE_BANNER)) {
    findings.push({ code: "CANDIDATE_BANNER_MISSING", path: file });
  }
  if (actual.includes(TEMPLATE_SENTINEL) || actual.includes(M1_BANNER)) {
    findings.push({ code: "CANDIDATE_CONTAINS_M1_TEMPLATE", path: file });
  }
  const wordLimit = M2_CANDIDATE_WORD_LIMITS[file];
  const wordCount = actual.trim().split(/\s+/).filter(Boolean).length;
  if (wordLimit && wordCount > wordLimit) {
    findings.push({
      code: "CANDIDATE_WORD_BUDGET_EXCEEDED",
      path: file,
      detail: `${wordCount}/${wordLimit}`,
    });
  }
  return findings;
}

export function validateStateEvidence(root, file, actual) {
  const findings = [];
  const meta = parseFrontmatter(actual);
  const evidenceRef = String(meta?.state_evidence_ref ?? "");
  if (!/^archive\/sessions\/[a-zA-Z0-9._/-]+\.json$/.test(evidenceRef)) {
    return [{ code: "STATE_EVIDENCE_REF_INVALID", path: file }];
  }
  const evidencePath = resolve(root, evidenceRef);
  if (!existsSync(evidencePath)) {
    return [{ code: "STATE_EVIDENCE_MISSING", path: file, detail: evidenceRef }];
  }
  let evidence;
  try {
    evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch (error) {
    return [{ code: "STATE_EVIDENCE_INVALID", path: file, detail: error.message }];
  }
  for (const field of [
    "backend_reviewed_ref",
    "production_observed_ref",
    "production_observed_at",
    "production_status",
    "frontend_main_ref",
    "frontend_redesign_ref",
  ]) {
    if (meta?.[field] !== evidence.state_frontmatter?.[field]) {
      findings.push({ code: "STATE_EVIDENCE_MISMATCH", path: file, detail: field });
    }
  }
  return findings;
}

export function validateOperatorActionTransition(previousStatus, nextStatus) {
  const allowed = {
    prepared: new Set(["prepared", "executed", "cancelled"]),
    executed: new Set(["executed", "reconciled"]),
    reconciled: new Set(["reconciled"]),
    cancelled: new Set(["cancelled"]),
  };
  return allowed[previousStatus]?.has(nextStatus) === true;
}

function validDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseOperatorActions(file, actual) {
  try {
    const registry = parseYaml(actual);
    if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
      return { finding: { code: "OPERATOR_ACTIONS_INVALID_ROOT", path: file } };
    }
    return { registry };
  } catch (error) {
    return {
      finding: { code: "OPERATOR_ACTIONS_INVALID_YAML", path: file, detail: error.message },
    };
  }
}

export function validateOperatorActions(file, actual) {
  const findings = [];
  const parsed = parseOperatorActions(file, actual);
  if (parsed.finding) return [parsed.finding];
  const { registry } = parsed;

  if (!validateOperatorActionsSchema(registry)) {
    for (const error of validateOperatorActionsSchema.errors ?? []) {
      findings.push({
        code: "OPERATOR_ACTIONS_SCHEMA_INVALID",
        path: file,
        detail: `${error.instancePath || "/"} ${error.message}`,
      });
    }
  }
  if (!validDateOnly(registry.verified_at)) {
    findings.push({ code: "OPERATOR_ACTIONS_VERIFIED_AT_INVALID", path: file });
  }
  if (!Array.isArray(registry.actions) || registry.actions.length === 0) {
    findings.push({ code: "OPERATOR_ACTIONS_EMPTY", path: file });
    return findings;
  }

  const ids = new Set();
  for (const action of registry.actions) {
    const id = String(action?.id ?? "");
    if (ids.has(id)) {
      findings.push({ code: "OPERATOR_ACTION_ID_DUPLICATE", path: file, detail: id });
    }
    ids.add(id);
    if (!validDateOnly(action?.prepared_at)) {
      findings.push({ code: "OPERATOR_ACTION_PREPARED_AT_INVALID", path: file, detail: id });
    }
    const preparedAt = Date.parse(`${action?.prepared_at}T00:00:00.000Z`);
    const executedAt = action?.executed_at == null ? null : Date.parse(action.executed_at);
    const reconciledAt = action?.reconciled_at == null ? null : Date.parse(action.reconciled_at);
    const cancelledAt = action?.cancelled_at == null ? null : Date.parse(action.cancelled_at);
    if (executedAt != null && (!Number.isFinite(executedAt) || executedAt < preparedAt)) {
      findings.push({ code: "OPERATOR_ACTION_TIME_ORDER_INVALID", path: file, detail: `${id}:executed_at` });
    }
    if (reconciledAt != null && (!Number.isFinite(reconciledAt) || executedAt == null || reconciledAt < executedAt)) {
      findings.push({ code: "OPERATOR_ACTION_TIME_ORDER_INVALID", path: file, detail: `${id}:reconciled_at` });
    }
    if (cancelledAt != null && (!Number.isFinite(cancelledAt) || cancelledAt < preparedAt)) {
      findings.push({ code: "OPERATOR_ACTION_TIME_ORDER_INVALID", path: file, detail: `${id}:cancelled_at` });
    }
  }
  return findings;
}

export function validateOperatorActionHistory(file, previousActual, actual) {
  const previousParsed = parseOperatorActions(file, previousActual);
  const currentParsed = parseOperatorActions(file, actual);
  if (previousParsed.finding || currentParsed.finding) return [];
  const findings = [];
  const current = new Map(currentParsed.registry.actions.map((action) => [action.id, action]));
  const immutable = [
    "id",
    "subject",
    "authority",
    "authority_purpose",
    "prepared_ref",
    "preflight_evidence_ref",
    "prepared_at",
    "blocks_acceptance_of",
    "targets",
  ];
  for (const before of previousParsed.registry.actions ?? []) {
    const after = current.get(before.id);
    if (!after) {
      findings.push({ code: "OPERATOR_ACTION_DELETED", path: file, detail: before.id });
      continue;
    }
    if (!validateOperatorActionTransition(before.status, after.status)) {
      findings.push({
        code: "OPERATOR_ACTION_STATUS_REGRESSION",
        path: file,
        detail: `${before.id}:${before.status}->${after.status}`,
      });
    }
    if (JSON.stringify(before.blocks_acceptance_of) !== JSON.stringify(after.blocks_acceptance_of)) {
      findings.push({
        code: "OPERATOR_ACTION_IMMUTABLE_FIELD_CHANGED",
        path: file,
        detail: `${before.id}:blocks_acceptance_of`,
      });
    }
    if (!(before.status === "prepared" && after.status === "prepared")) {
      for (const field of immutable) {
        if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
          findings.push({
            code: "OPERATOR_ACTION_IMMUTABLE_FIELD_CHANGED",
            path: file,
            detail: `${before.id}:${field}`,
          });
        }
      }
    }
    for (const field of [
      "executed_at",
      "execution_evidence",
      "reconciled_at",
      "reconciliation_evidence",
      "cancelled_at",
      "cancellation_reason",
      "cancellation_evidence",
    ]) {
      if (before[field] != null && before[field] !== after[field]) {
        findings.push({
          code: "OPERATOR_ACTION_EVIDENCE_CHANGED",
          path: file,
          detail: `${before.id}:${field}`,
        });
      }
    }
  }
  return findings;
}

export function validateOperatorActionHistoryAgainstGit(root, file, actual, baseRef = "origin/main") {
  try {
    execFileSync("git", ["rev-parse", "--verify", `${baseRef}^{commit}`], {
      cwd: root,
      stdio: "ignore",
    });
  } catch {
    return [{ code: "OPERATOR_ACTION_HISTORY_BASE_UNAVAILABLE", path: file, detail: baseRef }];
  }
  let previous;
  try {
    previous = execFileSync("git", ["show", `${baseRef}:${file}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    try {
      const listed = execFileSync("git", ["ls-tree", "-r", "--name-only", baseRef, "--", file], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (listed === "") return [];
    } catch {
      // Fall through: history enforcement must not disappear silently.
    }
    return [{ code: "OPERATOR_ACTION_HISTORY_READ_FAILED", path: file, detail: baseRef }];
  }
  return validateOperatorActionHistory(file, previous, actual);
}

function markdownSectionForAnchor(content, wanted) {
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/^#{1,6}\s+/.test(line)) continue;
    const depth = line.match(/^#+/)[0].length;
    const anchor = line
      .replace(/^#{1,6}\s+/, "")
      .trim()
      .toLowerCase()
      .replace(/[`*_]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    if (anchor !== wanted) continue;
    let end = index + 1;
    while (end < lines.length) {
      const next = lines[end].match(/^(#{1,6})\s+/);
      if (next && next[1].length <= depth) break;
      end += 1;
    }
    return lines.slice(index, end).join("\n");
  }
  return null;
}

function preparedArtifact(root, preparedRef) {
  const match = String(preparedRef ?? "").match(
    /^([0-9a-f]{40}):([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*)$/,
  );
  if (!match) return null;
  try {
    return execFileSync("git", ["show", `${match[1]}:${match[2]}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

export function validateOperatorActionEvidence(root, file, actual) {
  const parsed = parseOperatorActions(file, actual);
  if (parsed.finding) return [parsed.finding];
  const { registry } = parsed;
  const findings = [];
  for (const action of registry?.actions ?? []) {
    const evidenceRef = String(action?.preflight_evidence_ref ?? "");
    if (!/^archive\/sessions\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*\.json$/.test(evidenceRef)) {
      findings.push({ code: "OPERATOR_ACTION_EVIDENCE_REF_INVALID", path: file, detail: action?.id });
      continue;
    }
    const evidencePath = resolve(root, evidenceRef);
    const evidenceRoot = resolve(root, "archive/sessions");
    if (!evidencePath.startsWith(`${evidenceRoot}${sep}`) || !existsSync(evidencePath)) {
      findings.push({ code: "OPERATOR_ACTION_EVIDENCE_MISSING", path: file, detail: evidenceRef });
      continue;
    }
    let evidence;
    try {
      evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    } catch (error) {
      findings.push({ code: "OPERATOR_ACTION_EVIDENCE_INVALID", path: file, detail: error.message });
      continue;
    }
    if (
      evidence.schema_version !== 1 ||
      typeof evidence.source !== "string" ||
      !/read-only/i.test(evidence.source) ||
      typeof evidence.queried_at !== "string" ||
      Number.isNaN(Date.parse(evidence.queried_at)) ||
      typeof evidence.query !== "string" ||
      !/select/i.test(evidence.query) ||
      !Array.isArray(evidence.rows)
    ) {
      findings.push({ code: "OPERATOR_ACTION_EVIDENCE_CONTRACT_INVALID", path: file, detail: evidenceRef });
      continue;
    }

    const artifact = preparedArtifact(root, action.prepared_ref);
    if (artifact == null) {
      findings.push({ code: "OPERATOR_ACTION_PREPARED_REF_INVALID", path: file, detail: action.id });
    } else {
      const escapedPurpose = String(action.authority_purpose).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const authorityPattern =
        action.authority === "approval_required"
          ? new RegExp(`requireFounderGrant\\(\\s*["']${escapedPurpose}["']\\s*\\)`)
          : new RegExp(`autonomousAuthority\\(\\s*["']${escapedPurpose}["']\\s*,`);
      if (!authorityPattern.test(artifact)) {
        findings.push({ code: "OPERATOR_ACTION_AUTHORITY_BINDING_MISMATCH", path: file, detail: action.id });
      }
    }
    const targetKeys = new Set();
    for (const target of action?.targets ?? []) {
      if (targetKeys.has(target?.key)) {
        findings.push({ code: "OPERATOR_ACTION_TARGET_DUPLICATE", path: file, detail: `${action.id}:${target?.key}` });
      }
      targetKeys.add(target?.key);
      const match = String(target?.key ?? "").match(/^capabilities\.([a-z0-9-]+)\.avg_latency_ms$/);
      if (!match) {
        findings.push({ code: "OPERATOR_ACTION_TARGET_UNSUPPORTED", path: file, detail: `${action.id}:${target?.key}` });
        continue;
      }
      const row = evidence.rows?.find((item) => item.slug === match[1]);
      if (!row || row.avg_latency_ms !== target.current) {
        findings.push({
          code: "OPERATOR_ACTION_PREFLIGHT_MISMATCH",
          path: file,
          detail: `${action.id}:${target.key}`,
        });
      }
      if (artifact != null) {
        const from = target.current === null ? "null" : String(target.current);
        const tuple = new RegExp(
          `\\{\\s*slug:\\s*["']${match[1]}["']\\s*,\\s*from:\\s*${from}\\s*,\\s*to:\\s*${String(target.desired)}\\s*\\}`,
        );
        if (!tuple.test(artifact)) {
          findings.push({ code: "OPERATOR_ACTION_TARGET_BINDING_MISMATCH", path: file, detail: `${action.id}:${target.key}` });
        }
      }
      if (!evidence.query.includes(match[1]) || !/avg_latency_ms/i.test(evidence.query)) {
        findings.push({ code: "OPERATOR_ACTION_EVIDENCE_QUERY_MISMATCH", path: file, detail: `${action.id}:${target.key}` });
      }
    }
    for (const acceptanceRef of action?.blocks_acceptance_of ?? []) {
      const match = String(acceptanceRef).match(/^([^#]+\.md)#([a-z0-9-]+)$/);
      const acceptancePath = match ? resolve(root, match[1]) : "";
      const acceptanceContent = existsSync(acceptancePath)
        ? readFileSync(acceptancePath, "utf8")
        : "";
      const acceptanceSection = match
        ? markdownSectionForAnchor(acceptanceContent, match[2])
        : null;
      if (
        !match ||
        !acceptancePath.startsWith(`${resolve(root, "docs")}${sep}`) ||
        !existsSync(acceptancePath) ||
        acceptanceSection == null
      ) {
        findings.push({ code: "OPERATOR_ACTION_ACCEPTANCE_REF_INVALID", path: file, detail: acceptanceRef });
      } else if (
        action.status !== "reconciled" &&
        action.status !== "cancelled" &&
        !acceptanceSection.includes(`<!-- acceptance-blocked: ${action.id} -->`)
      ) {
        findings.push({ code: "OPERATOR_ACTION_ACCEPTANCE_BLOCK_MISSING", path: file, detail: acceptanceRef });
      }
    }
    for (const [evidenceField, contract] of Object.entries({
      execution_evidence: { kind: "execution", timestamp: "executed_at" },
      reconciliation_evidence: { kind: "reconciliation", timestamp: "reconciled_at" },
      cancellation_evidence: { kind: "cancellation", timestamp: "cancelled_at" },
    })) {
      const lifecycleRef = action?.[evidenceField];
      if (lifecycleRef == null) continue;
      const lifecyclePath = resolve(root, lifecycleRef);
      if (
        !/^archive\/sessions\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.json$/.test(lifecycleRef) ||
        !lifecyclePath.startsWith(`${resolve(root, "archive/sessions")}${sep}`) ||
        !existsSync(lifecyclePath) ||
        !statSync(lifecyclePath).isFile()
      ) {
        findings.push({
          code: "OPERATOR_ACTION_LIFECYCLE_EVIDENCE_MISSING",
          path: file,
          detail: `${action.id}:${evidenceField}`,
        });
        continue;
      }
      try {
        const lifecycleEvidence = JSON.parse(readFileSync(lifecyclePath, "utf8"));
        if (
          lifecycleEvidence.schema_version !== 1 ||
          lifecycleEvidence.evidence_kind !== contract.kind ||
          lifecycleEvidence.action_id !== action.id ||
          typeof lifecycleEvidence.recorded_at !== "string" ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(lifecycleEvidence.recorded_at) ||
          lifecycleEvidence.recorded_at !== action[contract.timestamp] ||
          (contract.kind === "reconciliation" && lifecycleEvidence.read_only !== true)
        ) {
          findings.push({
            code: "OPERATOR_ACTION_LIFECYCLE_EVIDENCE_INVALID",
            path: file,
            detail: `${action.id}:${evidenceField}`,
          });
        }
      } catch {
        findings.push({
          code: "OPERATOR_ACTION_LIFECYCLE_EVIDENCE_INVALID",
          path: file,
          detail: `${action.id}:${evidenceField}`,
        });
      }
    }
  }
  return findings;
}

export function validatePendingFounderDecisions(file, actual) {
  const findings = [];
  if (!actual.includes("## Decision-ready now")) {
    findings.push({ code: "PENDING_DECISION_READY_SECTION_MISSING", path: file });
  }
  if (/\b(?:AUTHORIZATION_UNAVAILABLE|SYSTEM_ACTING)\b/.test(actual)) {
    findings.push({ code: "PENDING_CONTAINS_OPERATOR_STATUS", path: file });
  }
  const topics = [
    ...actual.matchAll(
      /^### (FD-\d{8}-[A-Z0-9-]+)\b[\s\S]*?(?=^### |^## |$(?![\s\S]))/gm,
    ),
  ];
  const ids = new Set();
  for (const topic of topics) {
    const id = topic[1];
    if (ids.has(id)) findings.push({ code: "PENDING_DECISION_ID_DUPLICATE", path: file, detail: id });
    ids.add(id);
    for (const label of [
      "**State:**",
      "**Reserved boundary:**",
      "**Reserved class:**",
      "**Established:**",
      "**Recommendation until ready:**",
      "**Founder action now:**",
    ]) {
      if (!topic[0].includes(label)) {
        findings.push({ code: "PENDING_DECISION_FIELD_MISSING", path: file, detail: `${id}:${label}` });
      }
    }
    const reservedClass = topic[0].match(/\*\*Reserved class:\*\*\s*([a-z-]+)\./)?.[1];
    if (!new Set([
      "spend-above-envelope",
      "legal-or-company-binding",
      "vendor-or-license-commitment",
      "one-way-public-act",
      "outward-facing-act",
      "pricing-outside-band",
      "new-capability",
      "deactivate-revenue-earner",
      "regulatory-grade-build",
      "external-claim",
      "legal-or-grey-zone",
      "customer-data-boundary",
    ]).has(reservedClass)) {
      findings.push({ code: "PENDING_DECISION_CLASS_INVALID", path: file, detail: id });
    }
    if (!/\*\*Founder action now:\*\*\s*(?:none|decide|approve|decline)\b/i.test(topic[0])) {
      findings.push({ code: "PENDING_FOUNDER_ACTION_UNBOUNDED", path: file, detail: id });
    }
  }
  if (topics.length === 0) {
    findings.push({ code: "PENDING_DECISION_TOPICS_EMPTY", path: file });
  }
  return findings;
}

export function validateInventory(inventory) {
  const findings = [];
  if (inventory.mode !== "bare-enumeration" || inventory.complete !== false) {
    findings.push({ code: "INVENTORY_MODE_INVALID", path: "docs/project/legacy-authority-inventory.json" });
  }
  const allowed = new Set(["path", "owner_area", "sha256", "detected_references"]);
  for (const [index, entry] of (inventory.entries ?? []).entries()) {
    for (const key of Object.keys(entry)) {
      if (!allowed.has(key)) {
        findings.push({
          code: "INVENTORY_FIELD_OUT_OF_SCOPE",
          path: `docs/project/legacy-authority-inventory.json#entries[${index}]`,
          detail: key,
        });
      }
    }
  }
  return findings;
}

export function repoRootFrom(importMetaUrl) {
  const scriptPath = new URL(importMetaUrl).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  return resolve(dirname(scriptPath), "..");
}

export function isDirectInvocation(importMetaUrl) {
  if (!process.argv[1]) return false;
  const invoked = slash(resolve(process.argv[1])).toLowerCase();
  const modulePath = slash(new URL(importMetaUrl).pathname.replace(/^\/([A-Za-z]:)/, "$1")).toLowerCase();
  return invoked === modulePath;
}

export function assertIsolatedWorktree(root) {
  const gitDir = slash(git(root, "rev-parse", "--absolute-git-dir")).toLowerCase();
  const commonDir = slash(
    git(root, "rev-parse", "--path-format=absolute", "--git-common-dir"),
  ).toLowerCase();
  if (gitDir === commonDir) {
    throw new Error("refusing to generate project context in the shared primary worktree");
  }
}
