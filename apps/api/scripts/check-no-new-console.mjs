#!/usr/bin/env node
/**
 * F-0-014 guard: refuse PRs that add new `console.*` calls.
 *
 * Migration strategy: Phase C shipped the Pino structured logger and
 * helpers (`apps/api/src/lib/log.ts`). Phase E3 migrated `src/routes/`.
 * E4 will migrate `src/lib/` + `src/jobs/`. E5 migrates
 * `src/capabilities/` and tightens this guard to "ban all".
 *
 * Until then, existing call sites outside migrated directories are
 * allowlisted by file path + expected count. The guard fails when:
 *   - a new `console.*` is introduced to a file not in the allowlist
 *   - an allowlisted file's count grows above its current entry
 *
 * To migrate a file: remove its `console.*` calls, then reduce its
 * allowlist entry (or delete it). CI will enforce the new lower
 * ceiling on future PRs.
 *
 * Usage (run from repo root or apps/api):
 *   node apps/api/scripts/check-no-new-console.mjs
 *
 * Exits 0 clean; exits 1 with a diff on violation.
 * Allowlist lives in `apps/api/scripts/console-allowlist.json`.
 * Wired into .github/workflows/ci.yml.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Repo root is two levels up from this script (apps/api/scripts → repo).
const REPO_ROOT = join(__dirname, "..", "..", "..");
const SRC_ROOT = join(REPO_ROOT, "apps", "api", "src");
const ALLOWLIST_PATH = join(__dirname, "console-allowlist.json");

// Matches console.log|warn|error|info|debug( — must look like a call.
const PATTERN = /console\.(log|warn|error|info|debug)\s*\(/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (full.endsWith(".ts") && !full.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

function countInFile(path) {
  const raw = readFileSync(path, "utf-8");
  // Strip comments (/* */ and //) before counting so doc-prose doesn't trip us.
  const cleaned = raw
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_, p) => p + " ");
  const matches = cleaned.match(PATTERN);
  return matches ? matches.length : 0;
}

function toPosix(p) {
  return p.split(sep).join("/");
}

const allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf-8"));

const currentCounts = {};
for (const full of walk(SRC_ROOT)) {
  const rel = toPosix(relative(REPO_ROOT, full));
  const count = countInFile(full);
  if (count > 0) currentCounts[rel] = count;
}

const offenders = [];

// 1. Files not in allowlist with any console.* → offender.
// 2. Files in allowlist where current > allowed → offender.
for (const [file, count] of Object.entries(currentCounts)) {
  const allowed = allowlist[file];
  if (allowed === undefined) {
    offenders.push({ file, kind: "new-file", allowed: 0, actual: count });
  } else if (count > allowed) {
    offenders.push({ file, kind: "grew", allowed, actual: count });
  }
}

// 3. Files in allowlist where current < allowed → should update allowlist
//    down. Not a failure (migration progress is good), just a nudge.
const nudges = [];
for (const [file, allowed] of Object.entries(allowlist)) {
  const current = currentCounts[file] ?? 0;
  if (current < allowed) nudges.push({ file, allowed, current });
}

if (offenders.length === 0) {
  if (nudges.length > 0) {
    console.log(
      "F-0-014 guard: clean. " +
        `${nudges.length} file(s) have fewer console.* than the allowlist expects — ` +
        "shrink the allowlist to lock in the progress:",
    );
    for (const n of nudges) {
      console.log(`  ${n.file}: allowed=${n.allowed}, current=${n.current}`);
    }
  } else {
    console.log("F-0-014 guard: no new `console.*` calls.");
  }
  process.exit(0);
}

console.error(
  "F-0-014: new `console.*` calls introduced. Use the structured logger " +
    "from `apps/api/src/lib/log.ts`:\n" +
    "  - Inside a Hono handler: `c.get(\"log\").info({ label, ...ctx }, \"label\")`.\n" +
    "  - Helper / module / background: `logError(label, err, ctx)` or " +
    "`logWarn(label, msg, ctx)` or `log.info({...}, \"label\")`.\n" +
    "\n" +
    "Offenders:",
);
for (const o of offenders) {
  if (o.kind === "new-file") {
    console.error(`  ${o.file}: new file with ${o.actual} console.* call(s) — not allowlisted`);
  } else {
    console.error(`  ${o.file}: count grew ${o.allowed} → ${o.actual}`);
  }
}
process.exit(1);
