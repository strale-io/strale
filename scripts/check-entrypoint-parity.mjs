#!/usr/bin/env node
// CLI: entrypoint parity check (M4 batch 3, scripts/entrypoint-parity-lib.mjs).
// Proves CLAUDE.md and AGENTS.md point at the same project map and protocol
// router, that every docs/project/protocol-coverage.yaml row is reachable
// from both, that neither carries a mutable project fact outside its named
// allowlist, and that neither references a still-inactive document (reusing
// scripts/check-project-context.mjs's checkPrecutoverEntrypoint). Exit 1 on
// any finding. Never edits CLAUDE.md, AGENTS.md, or the manifest.
//
// Usage: node scripts/check-entrypoint-parity.mjs [--json]
import { checkEntrypointParity, repoRootFrom } from "./entrypoint-parity-lib.mjs";

const root = repoRootFrom(import.meta.url);
const json = process.argv.includes("--json");
const { findings } = checkEntrypointParity(root);

if (json) {
  console.log(JSON.stringify({ ok: findings.length === 0, findings }, null, 2));
} else {
  console.log("checked CLAUDE.md and AGENTS.md for entrypoint parity");
  if (findings.length === 0) {
    console.log("ok   entrypoint parity");
  } else {
    console.log(`FAIL entrypoint parity (${findings.length} finding${findings.length === 1 ? "" : "s"})`);
    for (const f of findings) console.log(`  ${f.code} ${f.file}: ${f.detail}`);
  }
}

process.exit(findings.length === 0 ? 0 : 1);
