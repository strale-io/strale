#!/usr/bin/env node
// Cert-audit C6 follow-up: report direct fetch() callsites that lack an
// AbortSignal nearby. Heuristic — a real lint pass would AST-parse, but
// this catches the common patterns and is fast.
//
// Two modes:
//   default    — print findings + exit 0 (informational)
//   --strict   — exit 1 if any new offenders appear vs the allowlist
//
// Pre-existing offenders are tracked in scripts/fetch-timeout-allowlist.txt
// (one path per line). The unwind plan is to chip away at that list, not
// to fix all 180 callsites in one PR.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../src");
const allowlistPath = resolve(__dirname, "fetch-timeout-allowlist.txt");
const strict = process.argv.includes("--strict");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|mts|js|mjs)$/.test(entry) && !/\.test\./.test(entry)) out.push(full);
  }
  return out;
}

const SAFE_HELPERS = /\b(safeFetch|fetchWithTimeout|nodeFetch)\s*\(/;
// Direct fetch() call — anchor to typical call shapes. Excludes
// `something.fetch(`, `await fetch(` is matched.
const DIRECT_FETCH = /(?<![A-Za-z0-9_.])fetch\s*\(/g;
const SIGNAL_NEAR = /signal\s*:|AbortSignal\.timeout|abortController/;

const offenders = [];
for (const file of walk(root)) {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip JSDoc and line comments — `fetch (` appears in prose often.
    const trimmed = line.trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    DIRECT_FETCH.lastIndex = 0;
    if (!DIRECT_FETCH.test(line)) continue;
    if (SAFE_HELPERS.test(line)) continue;
    // Check the next 15 lines for signal/AbortSignal — most fetch options
    // blocks fit in that window. Don't look back past the call (the caller
    // can build init outside the call site, but rare in this codebase).
    const window = lines.slice(i, Math.min(i + 15, lines.length)).join("\n");
    if (SIGNAL_NEAR.test(window)) continue;
    offenders.push({ file: relative(resolve(__dirname, "../.."), file).replace(/\\/g, "/"), line: i + 1 });
  }
}

const allowed = existsSync(allowlistPath)
  ? new Set(
      readFileSync(allowlistPath, "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#")),
    )
  : new Set();

const newOffenders = offenders.filter((o) => !allowed.has(o.file));

console.log(`fetch-timeout coverage: ${offenders.length} total offenders, ${newOffenders.length} not in allowlist`);

if (newOffenders.length > 0) {
  console.log("\nNew offenders (not in allowlist):");
  for (const o of newOffenders) console.log(`  ${o.file}:${o.line}`);
}

if (strict && newOffenders.length > 0) {
  console.error(
    "\nfetch() without AbortSignal in new code. Add `signal: AbortSignal.timeout(ms)` " +
      "or use safeFetch (which defaults to 60s) — see lib/safe-fetch.ts.",
  );
  process.exit(1);
}
