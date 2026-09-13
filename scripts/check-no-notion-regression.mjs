#!/usr/bin/env node
// CLI: scans every tracked file for a reintroduced Notion credential, API
// call, SDK import, MCP tool reference, or (inside .claude/ or .agents/)
// bare instruction mention, per scripts/no-notion-regression-lib.mjs's
// header. Blocking as of M4 batch 7 (migration plan M6 fixture 4). Never
// edits a file.
//
// Usage: node scripts/check-no-notion-regression.mjs [--json]
import { checkNoNotionRegression, repoRootFrom } from "./no-notion-regression-lib.mjs";

const root = repoRootFrom(import.meta.url);
const json = process.argv.includes("--json");
const { findings } = checkNoNotionRegression(root);

if (json) {
  console.log(JSON.stringify({ ok: findings.length === 0, findings }, null, 2));
} else if (findings.length === 0) {
  console.log("ok   no Notion regression");
} else {
  console.log(`FAIL Notion regression check (${findings.length} finding${findings.length === 1 ? "" : "s"})`);
  for (const f of findings) {
    console.log(`  ${f.code} ${f.file}:${f.line}: ${f.snippet}`);
  }
}

process.exit(findings.length === 0 ? 0 : 1);
