// Phase A0b CI lint: prevent scripts from bypassing the dispatcher gate.
//
// `apps/api/scripts/*.ts` may import `getExecutor` for existence checks
// (using a `// guarded-executor-exempt:` comment near the import), but
// any executor invocation MUST go through `guardedExecute` / `assertGuardedAllow`
// from `../src/capabilities/guarded-executor.js`. This guard catches a future
// script that re-introduces the silent-bypass pattern.
//
// Exit codes:
//   0 — clean
//   1 — at least one script imports `getExecutor` directly without the
//       exempt marker and without also importing the guarded helper.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const SCRIPTS_DIR = resolve(import.meta.dirname, ".");
const EXEMPT_MARKER = "guarded-executor-exempt";
// Operator tools that invoke executors deliberately, under documented cost
// controls (denylist / budget cap / flag-gating). The marker alone does NOT
// exempt an invoking script — the filename must ALSO be on this list, so
// adding a new bypass is a visible diff to this guard, not just a comment.
const OPERATOR_TOOL_ALLOWLIST = new Set([
  "sweep-paid-fixtures.ts",
  "capture-tier-fixtures.ts",
]);
const GUARDED_IMPORT_RE = /from\s+["']\.\.\/src\/capabilities\/guarded-executor(\.js)?["']/;
const GET_EXECUTOR_IMPORT_RE =
  /import\s*\{[^}]*\bgetExecutor\b[^}]*\}\s*from\s+["']\.\.\/src\/capabilities\/(index(\.js)?)["']/;

function listTsFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "archive") continue; // archived scripts are not part of CI
      listTsFiles(full, acc);
    } else if (entry.endsWith(".ts")) {
      acc.push(full);
    }
  }
  return acc;
}

const offenders = [];

for (const file of listTsFiles(SCRIPTS_DIR)) {
  const content = readFileSync(file, "utf8");
  if (!GET_EXECUTOR_IMPORT_RE.test(content)) continue;

  // Has getExecutor import. OK if also imports the guarded helper.
  if (GUARDED_IMPORT_RE.test(content)) continue;

  // OK if the file is marked exempt AND either (a) it only does existence
  // checks, or (b) it is a pinned operator tool. `executor(` / direct call
  // detection is unreliable statically, so the allowlist is the gate for
  // invoking scripts — a marker alone does not clear a new invoker.
  const fileName = file.split(/[\\/]/).pop();
  if (content.includes(EXEMPT_MARKER)) {
    const invokes = /getExecutor\([^)]*\)\s*(?:as\s+\w+\s*)?[;,)]?[\s\S]*?\b(?:executor|fn)\s*\(/.test(content);
    if (!invokes || OPERATOR_TOOL_ALLOWLIST.has(fileName)) continue;
  }

  offenders.push(file);
}

if (offenders.length === 0) {
  console.log("[lint] No scripts bypass the dispatcher gate.");
  process.exit(0);
}

console.error("[lint] The following scripts import getExecutor without a paired");
console.error("[lint] guarded-executor import or `guarded-executor-exempt` marker:");
for (const f of offenders) console.error(`  - ${f}`);
console.error("");
console.error("[lint] Either:");
console.error("[lint]   (a) import { guardedExecute } from '../src/capabilities/guarded-executor.js'");
console.error("[lint]       and route every executor invocation through it, OR");
console.error("[lint]   (b) add a `// guarded-executor-exempt: <reason>` comment near the import");
console.error("[lint]       if the file only does existence checks (no executor() calls), OR");
console.error("[lint]   (c) for a deliberate operator-supervised tool that DOES invoke executors:");
console.error("[lint]       add the marker AND add the filename to OPERATOR_TOOL_ALLOWLIST in this");
console.error("[lint]       guard, with documented cost controls (denylist, budget cap, flag-gating)");
console.error("[lint]       in the tool's header. The allowlist makes each new bypass a reviewed");
console.error("[lint]       diff to this guard, not just a comment in the offending file.");
process.exit(1);
