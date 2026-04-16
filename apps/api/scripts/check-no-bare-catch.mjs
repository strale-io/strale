#!/usr/bin/env node
/**
 * F-0-009 guard: refuse PRs that reintroduce `.catch(() => {})`.
 *
 * The brief asked for an ESLint rule; this repo doesn't have ESLint
 * wired up at the root, and standing up ESLint for a single rule drags
 * in style-nitpick decisions on ~300 capability files. A grep-based
 * script hits the same goal (CI fails on reintroduction) without that
 * cost. If ESLint is adopted later, the same matcher moves into a
 * `no-restricted-syntax` rule (the `selector` is the AST pattern for
 * this grep; comment at the bottom of this file shows it).
 *
 * Usage (run from repo root or apps/api):
 *   node apps/api/scripts/check-no-bare-catch.mjs
 *
 * Exits 0 clean; exits 1 with a list of offending lines on match.
 * Wired into .github/workflows/ci.yml.
 *
 * The ONE exception: lib/fire-and-forget.ts contains the literal
 * `.catch(() => {})` string inside a documentation comment. The
 * matcher allowlist handles it.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.argv[2] ?? "apps/api/src";
// The exact anti-pattern F-0-009 forbids.
const PATTERN = /\.catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/;
const ALLOWLIST_FILES = new Set([
  // The helper's doc comment describes the pattern — unavoidable.
  "apps/api/src/lib/fire-and-forget.ts",
  "apps/api/src/lib/fire-and-forget.test.ts",
  // This script itself contains the pattern in comments + the regex.
  "apps/api/scripts/check-no-bare-catch.mjs",
]);
// `storeIntegrityHash(...).catch(() => {})` is tracked separately by
// F-0-009 Stage 2 and is intentionally left in place until that fix
// lands. Once Stage 2 ships these disappear; then remove the allowance.
const STORE_INTEGRITY_ALLOWED_PREFIX = "    storeIntegrityHash(";

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts") && !full.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

const offenders = [];
for (const file of walk(ROOT)) {
  const rel = file.replace(/\\/g, "/");
  if ([...ALLOWLIST_FILES].some((p) => rel.endsWith(p))) continue;
  const raw = readFileSync(file, "utf-8");
  // Preserve line numbers: strip comments in-place so offsets still match.
  const cleaned = raw
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_, p) => p + " ");
  const lines = cleaned.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!PATTERN.test(line)) continue;
    const rawLine = raw.split(/\r?\n/)[i];
    if (rawLine.startsWith(STORE_INTEGRITY_ALLOWED_PREFIX)) continue;
    offenders.push({ file: rel, line: i + 1, text: rawLine.trim() });
  }
}

if (offenders.length === 0) {
  console.log("F-0-009 guard: no bare `.catch(() => {})` found.");
  process.exit(0);
}

console.error(
  "F-0-009: bare `.catch(() => {})` is forbidden. Use " +
    "`fireAndForget(fn, { label, context })` from `lib/fire-and-forget.js` " +
    "for non-awaited work, or `.catch((err) => logError(\"label\", err, ctx))` " +
    "for awaited silencing. Offenders:",
);
for (const o of offenders) {
  console.error(`  ${o.file}:${o.line}: ${o.text}`);
}
process.exit(1);

/* Equivalent ESLint `no-restricted-syntax` selector, kept here for the
   day ESLint lands:

{
  "selector":
    "CallExpression[callee.property.name='catch']" +
    "[arguments.0.type='ArrowFunctionExpression']" +
    "[arguments.0.body.type='BlockStatement']" +
    "[arguments.0.body.body.length=0]",
  "message":
    "Use fireAndForget({ label, context }) instead of bare " +
    ".catch(() => {}) — see F-0-009."
}
*/
