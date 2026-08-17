// Syntax-level floor for the .mjs files tsconfig.scripts.json declares it
// does NOT type-check (Codex review, 2026-08-17 — see the DECLARED BOUNDARY
// comment in tsconfig.scripts.json). This is deliberately shallow: it only
// proves each file parses as valid ESM, the same guarantee `node --check`
// gives any script. It catches a stray syntax error before it ships; it
// does NOT catch type errors, undefined variables, or logic bugs the way
// checkJs would. Full .mjs coverage (convert to .mts, or add JSDoc +
// per-file checkJs) is open Phase 3 debt, not closed by this script.
//
// Usage: node apps/api/scripts/check-mjs-syntax.mjs
// Exit codes: 0 — every non-archived .mjs parses cleanly. 1 — at least one
// syntax error (or the syntax-check subprocess itself failed to run).

import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPTS_DIR = resolve(import.meta.dirname, ".");

function listMjsFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "archive") continue; // archived scripts are not part of CI
      if (entry === "node_modules") continue;
      listMjsFiles(full, acc);
    } else if (entry.endsWith(".mjs")) {
      acc.push(full);
    }
  }
  return acc;
}

const files = listMjsFiles(SCRIPTS_DIR).sort();
const failures = [];

for (const file of files) {
  // `node --check` parses the file as a module (matching .mjs semantics)
  // without executing it — a syntax-only pass, same guarantee `tsc` gives
  // for free on .ts files.
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    failures.push({ file, stderr: result.stderr?.trim() || result.error?.message || "unknown error" });
  }
}

console.log(`[check-mjs-syntax] ${files.length} .mjs file(s) checked (syntax-only — see script header for scope).`);

if (failures.length === 0) {
  console.log("[check-mjs-syntax] All clean.");
  process.exit(0);
}

console.error(`\n[check-mjs-syntax] ${failures.length} file(s) failed to parse:`);
for (const { file, stderr } of failures) {
  console.error(`\n  - ${file}`);
  console.error(`    ${stderr.split("\n").join("\n    ")}`);
}
process.exit(1);
