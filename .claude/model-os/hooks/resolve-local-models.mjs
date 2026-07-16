#!/usr/bin/env node
// MODEL-OS local-config resolver — reads the LIVE model id (and effort) for any ledger
// entry whose `resolution.method` is "local-config", i.e. a model backed by a CLI whose
// current model is introspectable from a local config file (today: codex via
// $CODEX_HOME/config.toml). Provider-agnostic by design: everything — which file, which
// fields — is driven by the entry's `resolution` block; no CLI is named in this code.
//
// Used by model-os-health.mjs at SessionStart to detect LEDGER DRIFT (cached id !=
// live config). This module only READS and REPORTS — it never writes the ledger;
// flagging is the health hook's job, fixing is a human's (an explicit, reviewed edit).
//
// Also runnable directly for debugging:
//   node resolve-local-models.mjs        -> prints resolution for every
//                                           resolution-bearing entry in routing.json
//
// Zero dependencies, fail-soft everywhere: a missing file/field returns
// { found: false } — never throws, never crashes the caller. This is NOT a general
// TOML parser: it line-matches top-level `key = "value"` assignments before the first
// [section] header, which is exactly the shape these CLI configs use for the model line.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

/**
 * Expand one path template: `$VAR` / `${VAR}` / `%VAR%` from process.env, leading `~`
 * to the home dir. Returns null if any referenced env var is unset/empty (a broken
 * expansion must skip the candidate, not probe a mangled path).
 */
function expandPath(template) {
  let broken = false;
  let out = String(template)
    .replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (_, n) => {
      const v = process.env[n];
      if (!v) broken = true;
      return v || "";
    })
    .replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (_, n) => {
      const v = process.env[n];
      if (!v) broken = true;
      return v || "";
    });
  if (out.startsWith("~")) out = path.join(os.homedir(), out.slice(1));
  return broken ? null : path.normalize(out);
}

/**
 * Parse the ledger's config_path syntax into an ordered candidate list:
 *   "$CODEX_HOME/config.toml (fallback: ~/.codex/config.toml on POSIX, %USERPROFILE%\\.codex\\config.toml on Windows)"
 * -> [expanded primary, expanded fallback 1, expanded fallback 2] (nulls dropped).
 * Trailing " on <platform>" annotations are documentation for humans and stripped here.
 */
function candidatePaths(configPath) {
  const m = String(configPath || "").match(/^(.*?)\s*(?:\(fallback:\s*(.*)\))?\s*$/s);
  const raw = [m ? m[1] : configPath];
  if (m && m[2]) for (const p of m[2].split(",")) raw.push(p);
  return raw
    .map((p) => String(p).trim().replace(/\s+on\s+\w+$/i, ""))
    .filter(Boolean)
    .map(expandPath)
    .filter(Boolean);
}

/** Extract a top-level `key = value` from config text (stops at the first [section]). */
function readTopLevelField(text, key) {
  if (!key) return null;
  for (const line of String(text).split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) break; // entered a [section] — top-level scope is over
    const m = line.match(
      new RegExp(
        `^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^#\\s]+))`
      )
    );
    if (m) return m[1] ?? m[2] ?? m[3] ?? null;
  }
  return null;
}

/**
 * Resolve one ledger `resolution` block (method "local-config") against the live
 * local config file. Returns { resolvedId, resolvedEffort, found, path }:
 *   found: true  — the file existed AND the id field was present; resolvedId is live truth.
 *   found: false — file or field missing (CLI may simply not be installed here).
 * Never throws.
 */
export function resolveLocalConfig(resolutionSpec) {
  const miss = { resolvedId: null, resolvedEffort: null, found: false, path: null };
  try {
    if (!resolutionSpec || resolutionSpec.method !== "local-config") return miss;
    for (const p of candidatePaths(resolutionSpec.config_path)) {
      if (!existsSync(p)) continue;
      let text;
      try {
        text = readFileSync(p, "utf8");
      } catch {
        continue;
      }
      const resolvedId = readTopLevelField(text, resolutionSpec.field);
      if (resolvedId == null) return { ...miss, path: p }; // file found, field absent
      return {
        resolvedId,
        resolvedEffort: readTopLevelField(text, resolutionSpec.effort_field),
        found: true,
        path: p,
      };
    }
    return miss;
  } catch {
    return miss;
  }
}

// ---- CLI mode: `node resolve-local-models.mjs` — debug every resolution-bearing entry.
function findLedger() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.MODEL_OS_LEDGER,
    process.env.CLAUDE_PROJECT_DIR &&
      path.join(process.env.CLAUDE_PROJECT_DIR, ".claude", "model-os", "routing.json"),
    path.join(os.homedir(), ".claude", "model-os", "routing.json"),
    path.join(here, "..", "routing.json"),
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ledgerPath = findLedger();
  if (!ledgerPath) {
    console.log("resolve-local-models: no routing.json found.");
    process.exit(0);
  }
  let ledger;
  try {
    ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  } catch {
    console.log(`resolve-local-models: ledger unparseable (${ledgerPath}).`);
    process.exit(0);
  }
  const entries = (ledger.models || []).filter((m) => m.resolution);
  console.log(`ledger: ${ledgerPath}`);
  if (!entries.length) console.log("no resolution-bearing model entries.");
  for (const m of entries) {
    const r = resolveLocalConfig(m.resolution);
    console.log(`\n[${m.alias}] cached id='${m.id}' default_effort='${m.default_effort ?? ""}'`);
    if (!r.found) {
      console.log(
        `  live: NOT RESOLVED (${r.path ? `file found at ${r.path} but field '${m.resolution.field}' absent` : "no config file found"}) — soft miss, not drift.`
      );
      continue;
    }
    console.log(`  live: id='${r.resolvedId}' effort='${r.resolvedEffort ?? ""}' (from ${r.path})`);
    const drift =
      r.resolvedId !== m.id ||
      (m.default_effort != null && r.resolvedEffort != null && r.resolvedEffort !== m.default_effort);
    console.log(drift ? "  DRIFT — ledger is stale; update id/default_effort." : "  in sync.");
  }
  process.exit(0);
}
