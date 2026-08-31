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

export const M1_BANNER =
  "> [!CAUTION]\n" +
  "> **M1 NON-AUTHORITATIVE SKELETON — DO NOT USE AS PROJECT TRUTH.**\n" +
  "> Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain in force.";

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
  "docs/project/PRODUCT.md": skeleton(
    "project-product",
    "Product",
    "Product identity, ICP, positioning, principles, and durable targets will be reconciled in M2.",
  ),
  "docs/project/STATE.md": skeleton(
    "project-state",
    "Current State",
    "Current facts, active work, blockers, and verification refs will be reconciled in M2.",
  ),
  "docs/project/ROADMAP.md": skeleton(
    "project-roadmap",
    "Roadmap",
    "Ordered outcomes and execution links will be reconciled in M2.",
  ),
  "docs/project/DECISIONS.md": skeleton(
    "generated-decision-index",
    "Active Decisions",
    `**PARTIAL GENERATED VIEW — ` + "`complete: false`" + `.**

No authoritative decision index is published during M1.`,
    { generated: true },
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
  "docs/decisions/README.md": skeleton(
    "decision-system-readme",
    "Decision Records",
    "The record contract and generated inverse views will be activated after M0 and M2 review.",
  ),
  "docs/decisions/PENDING.md": skeleton(
    "pending-founder-decisions",
    "Pending Founder Decisions",
    "No pending decisions are migrated or created during M1.",
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
  title: "M1 project document front matter",
  type: "object",
  additionalProperties: true,
  required: [
    "doc_type",
    "authority_scope",
    "status",
    "complete",
    "phase",
    "m1_template",
  ],
  properties: {
    doc_type: { type: "string", minLength: 1 },
    authority_scope: { const: "none" },
    status: { const: "skeleton" },
    complete: { const: false },
    phase: { const: "M1" },
    m1_template: { const: true },
  },
};

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
      file === "docs/decisions/README.md" ||
      file === "docs/decisions/PENDING.md" ||
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
    "docs/project/schemas/project-document.schema.json":
      `${JSON.stringify(PROJECT_DOCUMENT_SCHEMA, null, 2)}\n`,
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
