// Phase A0b CI lint: prevent scripts from bypassing the dispatcher gate.
//
// `apps/api/scripts/**/*.{ts,mts,mjs}` may import `getExecutor` (statically
// or via dynamic `import()`) for existence checks, but any executor
// INVOCATION must go through `guardedExecute` / `assertGuardedAllow` from
// `src/capabilities/guarded-executor.js`. This guard catches a future
// script that re-introduces the silent-bypass pattern.
//
// Strengthened 2026-08-17 (Codex review of the Phase 2 T2.2 PR — the v1
// version of this guard was itself an instance of the disease Phase 2
// exists to cure: it matched only static named imports, scanned only .ts,
// treated import-presence as sufficient, and passed clean despite
// smoke-openapi-resolver.ts dynamically importing getExecutor and invoking
// it directly on a paid live path). v2 uses the TypeScript compiler API
// (already a devDependency) instead of regex for the parts that actually
// need real parsing:
//   - scans .ts, .mts, .mjs (non-archive)
//   - detects both static `import { getExecutor } from "...capabilities/index.js"`
//     and dynamic `const { getExecutor } = await import("...capabilities/index.js")`,
//     at any `../` depth (subdirectories like validate-phase-3/ need an extra level)
//   - flags actual INVOCATION: a variable assigned from `getExecutor(...)`
//     that is later called as a function, or the inline `getExecutor(x)(y)`
//     pattern — not merely importing the name
//
// Exempting a file (existence-check-only, or a deliberate operator tool
// that must invoke outside the gate) requires an inline marker comment,
// greppable and visible in the offending file itself:
//
//   // dispatcher-gate-exempt: <reason>
//
// A marker with no invocation clears the file outright (existence checks
// only). A marker on a file that DOES invoke clears it ONLY if the
// filename is ALSO in OPERATOR_TOOL_ALLOWLIST below — the double-gate
// means a new invoking bypass is a reviewed diff to this guard, not just a
// comment dropped in the offending file. Remove either half (the marker,
// or the allowlist entry) and the checker fails again — that is the
// intended trip-wire.
//
// Exit codes:
//   0 — clean
//   1 — at least one script imports getExecutor without clearing via the
//       guarded-executor import, or invokes it without a marker + (for
//       invoking files) the matching allowlist entry.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import ts from "typescript";

const SCRIPTS_DIR = resolve(import.meta.dirname, ".");
const EXEMPT_MARKER = "dispatcher-gate-exempt";

// Operator tools that invoke executors deliberately, under documented cost
// controls (denylist / budget cap / flag-gating / unclassified-cost-class
// analysis — see each file's header). The marker alone does NOT exempt an
// invoking script — the filename must ALSO be on this list, so adding a
// new bypass is a visible diff to this guard, not just a comment.
const OPERATOR_TOOL_ALLOWLIST = new Set([
  "sweep-paid-fixtures.ts",
  "capture-tier-fixtures.ts",
  "smoke-openapi-resolver.ts",
]);

const CAPABILITIES_INDEX_RE = /^(\.\.\/)+src\/capabilities\/index(\.js)?$/;
const GUARDED_EXECUTOR_RE = /^(\.\.\/)+src\/capabilities\/guarded-executor(\.js)?$/;
const SOURCE_EXTS = [".ts", ".mts", ".mjs"];

function listSourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "archive") continue; // archived scripts are not part of CI
      if (entry === "node_modules") continue;
      listSourceFiles(full, acc);
    } else if (SOURCE_EXTS.some((ext) => entry.endsWith(ext))) {
      acc.push(full);
    }
  }
  return acc;
}

function unwrap(node) {
  while (
    node &&
    (ts.isAsExpression(node) ||
      ts.isParenthesizedExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isSatisfiesExpression?.(node))
  ) {
    node = node.expression;
  }
  return node;
}

/**
 * Parses one file and reports whether it imports getExecutor (statically or
 * dynamically) from the capabilities registry module, whether it also
 * clears via the guarded-executor import, and whether it actually invokes
 * the executor it obtained (as opposed to only checking for existence).
 */
function analyzeFile(filePath, content) {
  const scriptKind = filePath.endsWith(".mjs")
    ? ts.ScriptKind.JS
    : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKind,
  );

  const getExecutorNames = new Set();
  let hasGuardedImport = false;

  function collectFromModuleSpecifier(spec, bindingNames) {
    if (GUARDED_EXECUTOR_RE.test(spec)) hasGuardedImport = true;
    if (CAPABILITIES_INDEX_RE.test(spec)) {
      for (const name of bindingNames) getExecutorNames.add(name);
    }
  }

  function namedImportBindings(namedBindings) {
    const names = [];
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const el of namedBindings.elements) {
        const importedName = (el.propertyName ?? el.name).text;
        if (importedName === "getExecutor") names.push(el.name.text);
      }
    }
    return names;
  }

  function objectBindingNames(bindingName) {
    const names = [];
    if (ts.isObjectBindingPattern(bindingName)) {
      for (const el of bindingName.elements) {
        const propName = el.propertyName ?? el.name;
        if (ts.isIdentifier(propName) && propName.text === "getExecutor" && ts.isIdentifier(el.name)) {
          names.push(el.name.text);
        }
      }
    }
    return names;
  }

  function visitImports(node) {
    // Static: import { getExecutor } from "...capabilities/index.js"
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      collectFromModuleSpecifier(spec, namedImportBindings(node.importClause?.namedBindings));
    }

    // Dynamic: const { getExecutor } = await import("...capabilities/index.js")
    // (also matches without `await` — `.then(({getExecutor}) => ...)` isn't
    // handled here since this codebase's dynamic imports are all top-level
    // await; a bare `import(...)` module specifier is still caught below
    // for the guarded-executor half of the check even without destructuring.)
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        const spec = arg.text;
        if (GUARDED_EXECUTOR_RE.test(spec)) hasGuardedImport = true;
        if (CAPABILITIES_INDEX_RE.test(spec)) {
          // Find the enclosing variable declaration (import(...) is always
          // wrapped in an AwaitExpression as the initializer in this repo).
          let decl = node.parent;
          while (decl && !ts.isVariableDeclaration(decl)) decl = decl.parent;
          if (decl && ts.isVariableDeclaration(decl)) {
            for (const name of objectBindingNames(decl.name)) getExecutorNames.add(name);
          }
        }
      }
    }

    ts.forEachChild(node, visitImports);
  }
  visitImports(sourceFile);

  if (getExecutorNames.size === 0) {
    return { hasGetExecutorImport: false, hasGuardedImport, invokes: false };
  }

  // Pass 2: variables assigned directly from getExecutor(...).
  const assignedVars = new Set();
  let inlineInvocation = false;

  function visitAssignments(node) {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
      const init = unwrap(node.initializer);
      if (ts.isCallExpression(init) && ts.isIdentifier(init.expression) && getExecutorNames.has(init.expression.text)) {
        assignedVars.add(node.name.text);
      }
    }
    // Inline pattern: getExecutor(slug)(input) — no intermediate variable.
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      if (ts.isCallExpression(callee) && ts.isIdentifier(callee.expression) && getExecutorNames.has(callee.expression.text)) {
        inlineInvocation = true;
      }
    }
    ts.forEachChild(node, visitAssignments);
  }
  visitAssignments(sourceFile);

  // Pass 3: is any assigned-from-getExecutor variable later CALLED?
  let laterInvocation = false;
  function visitCalls(node) {
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      if (ts.isIdentifier(callee) && assignedVars.has(callee.text)) laterInvocation = true;
    }
    ts.forEachChild(node, visitCalls);
  }
  if (assignedVars.size > 0) visitCalls(sourceFile);

  return {
    hasGetExecutorImport: true,
    hasGuardedImport,
    invokes: inlineInvocation || laterInvocation,
  };
}

const offenders = [];      // imports getExecutor, no clearing path at all
const unlistedInvokers = []; // marker present, invokes, but not on the allowlist

for (const file of listSourceFiles(SCRIPTS_DIR)) {
  const content = readFileSync(file, "utf8");
  const { hasGetExecutorImport, hasGuardedImport, invokes } = analyzeFile(file, content);
  if (!hasGetExecutorImport) continue;

  // Clears via the guarded-executor import (any invocation elsewhere in
  // the file is assumed routed through guardedExecute/assertGuardedAllow;
  // this guard doesn't try to prove that separately).
  if (hasGuardedImport) continue;

  const fileName = relative(SCRIPTS_DIR, file).split(/[\\/]/).join("/");
  const baseName = fileName.split("/").pop();
  const marked = content.includes(EXEMPT_MARKER);

  if (marked && !invokes) continue; // existence-check-only, marker is enough
  if (marked && invokes && OPERATOR_TOOL_ALLOWLIST.has(baseName)) continue; // sanctioned invoker

  if (marked && invokes && !OPERATOR_TOOL_ALLOWLIST.has(baseName)) {
    unlistedInvokers.push(fileName);
    continue;
  }

  offenders.push(fileName);
}

if (offenders.length === 0 && unlistedInvokers.length === 0) {
  console.log("[lint] No scripts bypass the dispatcher gate.");
  process.exit(0);
}

if (offenders.length > 0) {
  console.error("[lint] The following scripts import getExecutor without a paired");
  console.error(`[lint] guarded-executor import or a \`${EXEMPT_MARKER}\` marker:`);
  for (const f of offenders) console.error(`  - ${f}`);
  console.error("");
}
if (unlistedInvokers.length > 0) {
  console.error("[lint] The following scripts are marked exempt AND actually invoke the");
  console.error("[lint] executor they obtain, but are not on OPERATOR_TOOL_ALLOWLIST in");
  console.error("[lint] this guard — a marker comment alone is not enough to invoke:");
  for (const f of unlistedInvokers) console.error(`  - ${f}`);
  console.error("");
}
console.error("[lint] Either:");
console.error("[lint]   (a) import { guardedExecute } from '<relative>/src/capabilities/guarded-executor.js'");
console.error("[lint]       and route every executor invocation through it, OR");
console.error(`[lint]   (b) add a \`// ${EXEMPT_MARKER}: <reason>\` comment near the import`);
console.error("[lint]       if the file only does existence checks (no invocation), OR");
console.error("[lint]   (c) for a deliberate operator-supervised tool that DOES invoke executors:");
console.error(`[lint]       add the marker AND add the filename to OPERATOR_TOOL_ALLOWLIST in this`);
console.error("[lint]       guard, with documented cost controls (denylist, budget cap, flag-gating,");
console.error("[lint]       or an explicit cost-class analysis) in the tool's header. The allowlist");
console.error("[lint]       makes each new bypass a reviewed diff to this guard, not just a comment");
console.error("[lint]       in the offending file.");
process.exit(1);
