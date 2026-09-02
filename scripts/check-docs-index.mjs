#!/usr/bin/env node
// Validates docs/README.md against the real docs/ subtree list (T5
// CTO-readable structure). Spec:
// archive/sessions/2026-09-02-t5-cto-readable-structure-plan.md
//
// The only relation checked is set equality between:
//   - every top-level directory under docs/ (a "subtree")
//   - every subtree name referenced in a docs/README.md table row, read as
//     the first `` `name/` `` backtick span found on a line starting with
//     `| `
//
// Prose accuracy of each line (is the authority status actually right) is a
// human judgement call, not something a checker can verify — this only
// catches the mechanical failure mode: a subtree with no line, or a line
// for a subtree that no longer exists.
//
// Usage: node scripts/check-docs-index.mjs [--json]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DOCS_DIR = "docs";
export const DOCS_README_PATH = "docs/README.md";

const SUBTREE_REF = /^\|\s*(?:\[)?`([a-zA-Z0-9_.-]+)\/`/;

export function repoRootFrom(importMetaUrl) {
  return resolve(dirname(fileURLToPath(importMetaUrl)), "..");
}

export function isDirectInvocation(importMetaUrl) {
  if (!process.argv[1]) return false;
  const invoked = resolve(process.argv[1]).toLowerCase();
  const modulePath = fileURLToPath(importMetaUrl).toLowerCase();
  return invoked === modulePath;
}

/** Top-level directories directly under docs/, sorted. */
export function listDocsSubtrees(root) {
  const dir = resolve(root, DOCS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/** Subtree names referenced in docs/README.md's table rows, in file order (may contain duplicates). */
export function listReferencedSubtrees(readmeContent) {
  const out = [];
  for (const line of readmeContent.split(/\r?\n/)) {
    const match = SUBTREE_REF.exec(line);
    if (match) out.push(match[1]);
  }
  return out;
}

function finding(code, path, detail) {
  return { code, path, ...(detail ? { detail } : {}) };
}

/**
 * Compares the real docs/ subtree list against docs/README.md's table.
 * Returns { findings, actual, referenced }.
 */
export function checkDocsIndex(root) {
  const findings = [];
  const readmePath = resolve(root, DOCS_README_PATH);
  if (!existsSync(readmePath)) {
    return { findings: [finding("DOCS_README_MISSING", DOCS_README_PATH)], actual: [], referenced: [] };
  }

  const actual = listDocsSubtrees(root);
  const referenced = listReferencedSubtrees(readFileSync(readmePath, "utf8"));
  const referencedSet = new Set(referenced);
  const actualSet = new Set(actual);

  for (const subtree of actual) {
    if (!referencedSet.has(subtree)) {
      findings.push(finding("DOCS_SUBTREE_UNDOCUMENTED", `${DOCS_DIR}/${subtree}/`, "exists on disk but has no line in docs/README.md"));
    }
  }
  for (const subtree of referencedSet) {
    if (!actualSet.has(subtree)) {
      findings.push(finding("DOCS_SUBTREE_VANISHED", `${DOCS_DIR}/${subtree}/`, "listed in docs/README.md but no longer exists"));
    }
  }

  return { findings, actual, referenced };
}

if (isDirectInvocation(import.meta.url)) {
  const root = repoRootFrom(import.meta.url);
  const json = process.argv.includes("--json");
  const { findings, actual } = checkDocsIndex(root);

  if (json) {
    console.log(JSON.stringify({ ok: findings.length === 0, findings, subtree_count: actual.length }, null, 2));
  } else {
    console.log(`checked ${actual.length} docs/ subtrees against docs/README.md`);
    if (findings.length === 0) {
      console.log("ok   docs/README.md index");
    } else {
      console.log(`FAIL docs/README.md index (${findings.length} finding${findings.length === 1 ? "" : "s"})`);
      for (const f of findings) console.log(`  ${f.code} ${f.path}${f.detail ? ` — ${f.detail}` : ""}`);
    }
  }
  process.exit(findings.length === 0 ? 0 : 1);
}
