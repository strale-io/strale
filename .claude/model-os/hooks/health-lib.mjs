import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { spawn as spawnChild } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getObservation } from "../state-store.mjs";
import { planObservationRefresh } from "../freshness.mjs";
import { subscriptionOnlyEnv } from "../provider-adapters/common.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MAINTENANCE_CHILD_ENV = "MODEL_OS_MAINTENANCE_CHILD";
export const FRESHNESS_DAEMON_CHILD_ENV = "MODEL_OS_FRESHNESS_DAEMON_CHILD";
export const MAINTENANCE_PATH = path.resolve(HERE, "../maintenance.mjs");
export const FRESHNESS_DAEMON_PATH = path.resolve(HERE, "../freshness-daemon.mjs");

function envValue(env, name) {
  const key = Object.keys(env || {}).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? env[key] : null;
}

export function commandOnPath(command, { env = process.env, platform = process.platform } = {}) {
  if (typeof command !== "string" || !/^[A-Za-z0-9._-]+$/.test(command)) return false;
  const pathValue = envValue(env, "PATH") || "";
  const extensions = platform === "win32"
    ? (envValue(env, "PATHEXT") || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""];
  const hasExtension = Boolean(path.extname(command));
  for (const dir of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const extension of hasExtension ? [""] : extensions) {
      const candidate = path.join(dir, `${command}${extension}`);
      if (!existsSync(candidate)) continue;
      try { accessSync(candidate, constants.X_OK); return true; }
      catch { if (platform === "win32") return true; }
    }
  }
  return false;
}

export function observationNeedsRefresh(observation, now = new Date().toISOString(), leadSeconds = 3600) {
  return planObservationRefresh(observation, { now, leadSeconds }).due;
}

export function routeMaintenanceDue({ ledger, context, activeQuotaIds = new Set(), now = context?.now } = {}) {
  const store = context?.store;
  for (const model of ledger?.models || []) {
    if ((model.status || "current") !== "current") continue;
    for (const route of model.access_routes || []) {
      const guard = getObservation(store, route.spend_guard_observation, now);
      if (observationNeedsRefresh(guard, now)) return true;
    }
  }
  for (const resourceId of activeQuotaIds) {
    const resource = context?.policy?.quota_resources?.[resourceId];
    const quota = getObservation(store, resource?.capacity_observation, now);
    if (observationNeedsRefresh(quota, now, 60)) return true;
  }
  return false;
}

export function catalogMaintenanceDue({ policy, store, now = new Date().toISOString() } = {}) {
  const keys = [
    ...(policy?.discovery?.sources || []).map((source) => `discovery-source:${source.id}`),
    ...(policy?.discovery?.terms_sources || []).map((source) => `terms:${source.id}`),
    ...(policy?.discovery?.cli_requirements || []).map((item) => `cli:${item.id}`),
  ];
  return keys.some((key) => observationNeedsRefresh(getObservation(store, key, now), now));
}

export function startBackgroundMaintenance({ ledgerPath, policyPath, stateDir = null,
  env = process.env, spawn = spawnChild } = {}) {
  if (env?.[MAINTENANCE_CHILD_ENV] === "1") return { started: false, reason: "maintenance child" };
  if (!ledgerPath || !policyPath) throw new Error("background maintenance requires ledgerPath and policyPath");
  const args = [MAINTENANCE_PATH, "--ledger", path.resolve(ledgerPath), "--policy", path.resolve(policyPath)];
  args.push("--catalog");
  if (stateDir) args.push("--state-dir", path.resolve(stateDir));
  const childEnv = { ...subscriptionOnlyEnv(env), [MAINTENANCE_CHILD_ENV]: "1" };
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: childEnv,
  });
  if (!child || !Number.isInteger(child.pid)) throw new Error("background maintenance did not start");
  child.unref?.();
  return { started: true, pid: child.pid };
}

export function startBackgroundFreshnessMonitor({ ledgerPath, policyPath, stateDir = null,
  env = process.env, spawn = spawnChild } = {}) {
  if (env?.[FRESHNESS_DAEMON_CHILD_ENV] === "1") return { started: false, reason: "freshness daemon child" };
  if (!ledgerPath || !policyPath) throw new Error("background freshness monitor requires ledgerPath and policyPath");
  const args = [FRESHNESS_DAEMON_PATH, "--ledger", path.resolve(ledgerPath), "--policy", path.resolve(policyPath)];
  if (stateDir) args.push("--state-dir", path.resolve(stateDir));
  const childEnv = { ...subscriptionOnlyEnv(env), [FRESHNESS_DAEMON_CHILD_ENV]: "1" };
  const child = spawn(process.execPath, args, { detached: true, stdio: "ignore", windowsHide: true, env: childEnv });
  if (!child || !Number.isInteger(child.pid)) throw new Error("background freshness monitor did not start");
  child.unref?.();
  return { started: true, pid: child.pid };
}

// Gate-wiring check — the health hook always exits 0, so it is the only place a
// session finds out the PreToolUse gate (model-os-gate.mjs) isn't actually wired.
// Without this, a repo can carry a ledger and still run every Agent/Workflow launch
// completely unenforced with no signal. Read-only: inspects settings files, never
// writes them. Malformed/unreadable settings are treated as "not wired" for that
// file, but never throw — one bad settings file must not crash SessionStart.
function preToolUseGroupsWireGate(preToolUse) {
  if (!Array.isArray(preToolUse)) return false;
  for (const group of preToolUse) {
    const matcher = typeof group?.matcher === "string" ? group.matcher : "";
    if (!matcher.includes("Agent")) continue;
    for (const hook of Array.isArray(group?.hooks) ? group.hooks : []) {
      const command = [hook?.command, ...(Array.isArray(hook?.args) ? hook.args : [])]
        .filter(Boolean).join(" ");
      if (command.includes("model-os-gate.mjs")) return true;
    }
  }
  return false;
}

export function gateWiringDetail({ env = process.env, cwd = process.cwd() } = {}) {
  const projectDir = env.CLAUDE_PROJECT_DIR || cwd;
  const candidates = [
    env.MODEL_OS_USER_SETTINGS || path.join(os.homedir(), ".claude", "settings.json"),
    path.join(projectDir, ".claude", "settings.json"),
    path.join(projectDir, ".claude", "settings.local.json"),
  ];
  for (const file of candidates) {
    let raw;
    try { raw = readFileSync(file, "utf8"); } catch { continue; }
    let parsed;
    try { parsed = JSON.parse(raw); } catch { continue; } // malformed = not-wired for this file, keep checking others
    if (preToolUseGroupsWireGate(parsed?.hooks?.PreToolUse)) return { wired: true, file };
  }
  return { wired: false };
}
