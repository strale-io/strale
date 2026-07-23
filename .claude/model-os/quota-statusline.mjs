#!/usr/bin/env node
// Claude Code status-line bridge: capture official rate_limits fields into the
// observation store, then delegate the exact original status-line command.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ingestClaudeStatusline } from "./quota-lib.mjs";
import { findPolicy, readPolicy } from "./route-state.mjs";
import { atomicWriteFile, resolveStateDir } from "./state-store.mjs";

// Privacy-safe (keys/booleans ONLY — never a value) structural snapshot of the statusline payload,
// so we can see whether Claude Code is delivering `rate_limits` at all (the headroom telemetry gap
// diagnosis, 2026-07-18). No usage numbers, no session content — just which keys are present.
export function payloadShape(payload, { now } = {}) {
  const rl = payload?.rate_limits;
  const windowKeys = (w) => (w && typeof w === "object" ? Object.keys(w) : null);
  return {
    at: now,
    top_level_keys: payload && typeof payload === "object" ? Object.keys(payload) : [],
    has_rate_limits: Boolean(rl && typeof rl === "object"),
    rate_limits_keys: rl && typeof rl === "object" ? Object.keys(rl) : [],
    five_hour_keys: windowKeys(rl?.five_hour),
    seven_day_keys: windowKeys(rl?.seven_day),
  };
}

function delegateFromArgs(argv) {
  const index = argv.indexOf("--delegate-base64");
  if (index < 0 || !argv[index + 1]) return null;
  try { return Buffer.from(argv[index + 1], "base64").toString("utf8"); }
  catch { return null; }
}

export function ingestStatuslineInput(input, { stateDir = null, now = new Date().toISOString() } = {}) {
  const payload = JSON.parse(input || "{}");
  // Always record the latest payload SHAPE (keys only) — overwritten each render, tiny, harmless,
  // and the only way to see whether CC delivers `rate_limits` on this account/version.
  try { atomicWriteFile(path.join(resolveStateDir(stateDir), "statusline-shape.json"), JSON.stringify(payloadShape(payload, { now }), null, 2) + "\n"); }
  catch { /* diagnostics must never break ingest */ }
  const policyPath = findPolicy(null);
  const policy = readPolicy(policyPath);
  if (!policy) throw new Error("MODEL-OS quota policy unavailable");
  return ingestClaudeStatusline({ payload, policy, stateDir, now });
}

export function main(argv = process.argv.slice(2)) {
  let input = "";
  try { input = readFileSync(0, "utf8"); } catch {}
  try { ingestStatuslineInput(input); } catch { /* status-line display must survive telemetry failure */ }
  const delegate = delegateFromArgs(argv);
  if (!delegate) return;
  const result = spawnSync(delegate, {
    shell: true,
    input,
    encoding: "utf8",
    windowsHide: true,
    timeout: 5_000,
  });
  if (result.stdout) process.stdout.write(result.stdout);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
