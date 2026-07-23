#!/usr/bin/env node
// Single-instance off-hot-path freshness monitor. SessionStart launches it
// detached; it wakes at the earlier of the planned deadline or the bounded
// poll interval and invokes ordinary subscription-only maintenance when due.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { nextWakeDelayMs } from "./freshness.mjs";
import { buildMaintenancePlan, main as runMaintenance } from "./maintenance.mjs";
import { findPolicy } from "./route-state.mjs";
import { findLedger } from "./select.mjs";
import { acquireWriteLock, atomicWriteFile, releaseWriteLock, resolveStateDir } from "./state-store.mjs";
import { telemetryReason } from "./telemetry.mjs";

function parseArgs(argv) {
  const out = { ledger: findLedger(), policy: null, stateDir: null, once: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--once") out.once = true;
    else if (["--ledger", "--policy", "--state-dir"].includes(arg)) {
      const value = argv[++index];
      if (!value) throw new Error(`${arg} requires a value`);
      if (arg === "--ledger") out.ledger = path.resolve(value);
      else if (arg === "--policy") out.policy = path.resolve(value);
      else out.stateDir = path.resolve(value);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function readInputs(ledgerPath, policyPath) {
  return { ledger: JSON.parse(readFileSync(ledgerPath, "utf8")), policy: JSON.parse(readFileSync(policyPath, "utf8")) };
}

function waitMs(delay) { return new Promise((resolve) => setTimeout(resolve, delay)); }

export async function runMonitorCycle({ ledgerPath, policyPath, stateDir, now = new Date().toISOString(),
  maintenanceRunner = runMaintenance } = {}) {
  const { ledger, policy } = readInputs(ledgerPath, policyPath);
  const before = buildMaintenancePlan({ ledger, policy, stateDir, now });
  let maintenance = { status: "skipped", reason: "no-work-due" };
  if (before.due) {
    try {
      await maintenanceRunner(["--ledger", ledgerPath, "--policy", policyPath, "--state-dir", stateDir,
        "--catalog", "--if-due", "--json"]);
      maintenance = { status: "completed", reason: "due-work-ran" };
    } catch (error) {
      maintenance = { status: "failed", reason: telemetryReason(error, "maintenance-failed") };
    }
  }
  const refreshed = readInputs(ledgerPath, policyPath);
  const after = buildMaintenancePlan({ ledger: refreshed.ledger, policy: refreshed.policy, stateDir,
    now: new Date().toISOString() });
  return { before, after, maintenance };
}

export async function runFreshnessDaemon({ ledgerPath, policyPath, stateDir = null, once = false,
  wait = waitMs, now = () => new Date().toISOString(), maintenanceRunner = runMaintenance,
  processAliveCheck = null } = {}) {
  if (!ledgerPath) throw new Error("freshness daemon requires a ledger");
  const resolvedPolicy = policyPath || findPolicy(ledgerPath);
  if (!resolvedPolicy) throw new Error("freshness daemon requires a policy");
  const dir = resolveStateDir(stateDir);
  let lock;
  // A daemon lock has one owner for its whole lifetime. Reclaim a confirmed
  // dead owner immediately; requiring an age threshold would leave active
  // sessions stale after an abrupt process exit.
  try { lock = acquireWriteLock(dir, { lockName: "freshness-daemon.lock", staleMs: 0, maxAttempts: 2, waitMs: 0,
    ...(processAliveCheck ? { processAliveCheck } : {}) }); }
  catch (error) {
    if (/lock timed out/.test(error.message)) return { status: "already-running" };
    throw error;
  }
  try {
    const initial = readInputs(ledgerPath, resolvedPolicy);
    const maxPollSeconds = initial.policy?.maintenance?.max_poll_seconds || 900;
    const maxRuntimeSeconds = initial.policy?.maintenance?.daemon_max_runtime_seconds || 86400;
    const stopAt = Date.now() + maxRuntimeSeconds * 1000;
    let cycles = 0; let last = null;
    do {
      cycles++;
      const cycleAt = now();
      last = await runMonitorCycle({ ledgerPath, policyPath: resolvedPolicy, stateDir: dir,
        now: cycleAt, maintenanceRunner });
      atomicWriteFile(path.join(dir, "freshness-monitor.json"), `${JSON.stringify({ schema_version: 1,
        status: last.maintenance.status === "failed" ? "degraded" : "running", pid: process.pid,
        last_cycle_at: cycleAt, cycles, next_due_at: last.after.next_due_at,
        next_due_reason: last.after.next_due_reason, maintenance_status: last.maintenance.status,
        maintenance_reason: last.maintenance.reason }, null, 2)}\n`);
      if (once || Date.now() >= stopAt) break;
      // A failed or still-due source retries at the bounded poll cadence rather
      // than spinning every minimum-delay interval.
      const delay = last.after.due ? maxPollSeconds * 1000
        : nextWakeDelayMs(last.after, { now: now(), maxPollSeconds });
      await wait(delay);
    } while (Date.now() < stopAt);
    atomicWriteFile(path.join(dir, "freshness-monitor.json"), `${JSON.stringify({ schema_version: 1,
      status: "completed", pid: process.pid, last_cycle_at: last?.after?.observed_at || now(), cycles,
      next_due_at: last?.after?.next_due_at || null, next_due_reason: last?.after?.next_due_reason || "unknown",
      maintenance_status: last?.maintenance?.status || "unknown", maintenance_reason: last?.maintenance?.reason || "unknown" }, null, 2)}\n`);
    return { status: "completed", cycles, last };
  } finally { releaseWriteLock(lock); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  runFreshnessDaemon({ ledgerPath: args.ledger, policyPath: args.policy, stateDir: args.stateDir, once: args.once })
    .then((result) => { if (args.once) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); })
    .catch((error) => { process.stderr.write(`MODEL-OS freshness daemon error: ${error.message}\n`); process.exitCode = 3; });
}
