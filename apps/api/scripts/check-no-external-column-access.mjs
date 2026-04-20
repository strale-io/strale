#!/usr/bin/env node
/**
 * SCF-3 guard: forbid API code from reading or writing
 * `transactions.integrity_hash_status`.
 *
 * That column exists on prod and is owned by an untracked external
 * workflow that tags transactions as 'customer' / 'test' for analytics.
 * Strale's own integrity-hash chain lives in `compliance_hash_state`
 * (migration 0047). Mixing the two breaks both: the external workflow
 * stops being able to tag, and the integrity chain gets gaps.
 *
 * The column is declared in schema.ts only to prevent
 * `drizzle-kit generate` from proposing a destructive DROP. This guard
 * stops anyone from accidentally wiring the declared column into code.
 *
 * Usage (run from repo root or apps/api):
 *   node apps/api/scripts/check-no-external-column-access.mjs
 *
 * Exits 0 clean; exits 1 with a list of offending lines on match.
 * Wired into .github/workflows/ci.yml.
 *
 * Allowlist:
 *   - apps/api/src/db/schema.ts — the declaration itself.
 *   - apps/api/scripts/verify-phase-c-state.mjs — the bake monitor that
 *     asserts the external workflow's row counts haven't changed
 *     (read-only diagnostic, not API code).
 *   - This script itself.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.argv[2] ?? "apps/api/src";
// Match either snake_case (raw SQL) or camelCase (Drizzle) reference.
const PATTERN = /integrity_hash_status|integrityHashStatus/;
const ALLOWLIST_FILES = new Set([
  // The schema declaration — the whole point is for it to live here.
  "apps/api/src/db/schema.ts",
  // The Phase C bake monitor reads the external workflow's row counts
  // as a cross-check that Phase C didn't accidentally mutate it. Read
  // only, diagnostic, not API code.
  "apps/api/scripts/verify-phase-c-state.mjs",
  // The integrity-hash worker mentions the column in a comment to
  // explain what NOT to use — defensive documentation, not access.
  "apps/api/src/jobs/integrity-hash-retry.ts",
  // Schema-validator mentions it in a comment for the same reason.
  "apps/api/src/lib/schema-validator.ts",
  // This script itself contains the pattern in comments + the regex.
  "apps/api/scripts/check-no-external-column-access.mjs",
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if ((full.endsWith(".ts") || full.endsWith(".mjs")) && !full.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

const offenders = [];
for (const file of walk(ROOT)) {
  const rel = file.replace(/\\/g, "/");
  if ([...ALLOWLIST_FILES].some((p) => rel.endsWith(p))) continue;
  const raw = readFileSync(file, "utf-8");
  // Strip comments so doc-prose and TODO mentions don't trip the guard.
  const cleaned = raw
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_, p) => p + " ");
  const lines = cleaned.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!PATTERN.test(lines[i])) continue;
    const rawLine = raw.split(/\r?\n/)[i];
    offenders.push({ file: rel, line: i + 1, text: rawLine.trim() });
  }
}

if (offenders.length === 0) {
  console.log("SCF-3 guard: no API access to integrity_hash_status found.");
  process.exit(0);
}

console.error(
  "SCF-3: integrity_hash_status is owned by an external workflow. " +
    "Strale's integrity-hash chain uses compliance_hash_state instead. " +
    "Mixing the two breaks both. Offenders:",
);
for (const o of offenders) {
  console.error(`  ${o.file}:${o.line}: ${o.text}`);
}
process.exit(1);
