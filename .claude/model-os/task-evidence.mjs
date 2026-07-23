#!/usr/bin/env node
// Close deterministic task verification over every linked dispatch attempt.
// Stores opaque identifiers and machine-check names only; no task text,
// transcript, artifact, generated output, or command line is persisted.

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { recordOutcome } from "./outcomes.mjs";
import { recordDeferral, recordExpiry } from "./evidence-deferrals.mjs";
import { findOpenTasks } from "./hooks/model-os-evidence-gate.mjs";
import { refreshPerformanceSnapshot } from "./performance.mjs";
import { findPolicy } from "./route-state.mjs";
import { findLedger } from "./select.mjs";
import { resolveStateDir } from "./state-store.mjs";
import { appendTelemetryEvent, telemetryEnabled } from "./telemetry.mjs";

const BOUNDED_ID = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,119}$/;

function boundedId(value, label) {
  if (typeof value !== "string" || !BOUNDED_ID.test(value)) throw new Error(`${label} must be a bounded identifier`);
  return value;
}

function readReceipts(stateDir) {
  const file = path.join(resolveStateDir(stateDir), "dispatch.receipts.jsonl");
  if (!existsSync(file)) return [];
  const latest = new Map();
  for (const [index, line] of readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).entries()) {
    let row;
    try { row = JSON.parse(line); }
    catch (error) { throw new Error(`dispatch.receipts.jsonl line ${index + 1}: ${error.message}`); }
    if (!row?.id) continue;
    const previous = latest.get(row.id);
    if (!previous || Date.parse(row.at || 0) >= Date.parse(previous.at || 0)) latest.set(row.id, row);
  }
  return [...latest.values()];
}

export function closeTaskEvidence({ taskId, verification, acceptance = "unknown", source, checks,
  reworkCount = 0, stateDir = null, maxEntries = 2000, minimumSamples = 10,
  at = new Date().toISOString() } = {}) {
  const task = boundedId(taskId, "taskId");
  if (!["passed", "failed"].includes(verification)) throw new Error("verification must be passed or failed");
  const linked = readReceipts(stateDir).filter((row) => row.task_id === task && row.requested_model);
  if (!linked.length) throw new Error(`no requested-model dispatch receipts found for task '${task}'`);
  const outcomes = [];
  for (const receipt of linked) {
    const exactCompleted = receipt.status === "completed" && typeof receipt.observed_model === "string" &&
      receipt.observed_model === receipt.requested_model;
    outcomes.push(recordOutcome({ receipt_id: receipt.id, task_id: task, phase_id: receipt.phase_id || null,
      verification: exactCompleted ? verification : "failed",
      acceptance: exactCompleted ? acceptance : "unknown", source, checks,
      rework_count: exactCompleted ? reworkCount : 0, at }, { stateDir, maxEntries }));
  }
  const performance = refreshPerformanceSnapshot({ stateDir, minimumSamples, generatedAt: at });
  const passed = outcomes.filter((row) => row.verification === "passed").length;
  const failed = outcomes.filter((row) => row.verification === "failed").length;
  if (telemetryEnabled()) try {
    appendTelemetryEvent({ run_id: randomUUID(), at, component: "task", event: "task.evidence.completed",
      status: "completed", task_id: task, receipt_count: outcomes.length, verified_passes: passed,
      verified_failures: failed, performance_group_count: Object.keys(performance.groups).length },
    { stateDir, maxEntries });
  } catch { /* evidence remains authoritative if optional telemetry fails */ }
  return { schema_version: 1, task_id: task, verification, receipt_count: outcomes.length,
    verified_passes: passed, verified_failures: failed, outcomes, performance };
}

// Precondition-checked expiry (Codex review F1): an expiry may only write off a task
// that is (a) currently OPEN by the gate's own computation — evaluated as if the task
// had no prior dispositions, so an earlier silencing cannot hide its receipts — and
// (b) positively STALE (every receipt strictly datable, newest ≥ the gate window).
// Anything else refuses with the reason. `force` is the audited escape hatch: it
// records `forced: true` in the disposition so a forced write-off is never mistaken
// for a rule-clean one. The recorded cutoff is the newest receipt timestamp, so any
// LATER receipt reusing the task_id reopens the task in the gate.
export function expireTaskEvidence({ taskId, reason, force = false, stateDir = null,
  now = Date.now() } = {}) {
  const task = boundedId(taskId, "taskId");
  const open = findOpenTasks({ stateDir, now, ignoreDispositionsForTask: task });
  const entry = open.find((row) => row.task_id === task);
  if (!entry && !force) {
    throw new Error(`--expire refused: task '${task}' has no open completed receipts to write off ` +
      "(nothing to expire — an expiry must name real aged work, never pre-silence a task id). " +
      "Use --force only if you must record it anyway; the row will carry forced: true.");
  }
  if (entry && !entry.stale && !force) {
    const why = entry.undatable
      ? "it has receipt(s) without a strictly valid timezone-qualified timestamp (undatable work stays in the blocking tier)"
      : `its newest receipt is ${new Date(entry.latest_at).toISOString()} — inside the 7-day window`;
    throw new Error(`--expire refused: task '${task}' is not stale: ${why}. ` +
      "Close it with a machine check, --defer it, or let it age; --force overrides and records forced: true.");
  }
  const cutoff = entry && entry.latest_at > 0
    ? new Date(entry.latest_at).toISOString()
    : new Date(now).toISOString(); // forced with no datable receipts: cutoff = now, on the record
  return recordExpiry({ taskId: task, reason, cutoff, forced: force, stateDir });
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    if (!argv[index].startsWith("--")) throw new Error(`unexpected positional argument '${argv[index]}'`);
    const key = argv[index].slice(2);
    args[key] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return args;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.defer) {
    const row = recordDeferral({ taskId: args["task-id"], reason: args.reason,
      stateDir: args["state-dir"] || null });
    process.stdout.write(args.json === true ? `${JSON.stringify(row, null, 2)}\n` :
      `task ${row.task_id}: closure deferred (${row.reason})\n`);
    return 0;
  }
  if (args.expire) {
    // Durable write-off of a STALE open task the gate surfaced as an expiry candidate:
    // an on-the-record acknowledgment that it will never be machine-verified — never a
    // fabricated pass/fail, never performance evidence. Preconditions (open + stale)
    // are enforced in expireTaskEvidence; --force is the audited override.
    const row = expireTaskEvidence({ taskId: args["task-id"], reason: args.reason,
      force: args.force === true, stateDir: args["state-dir"] || null });
    process.stdout.write(args.json === true ? `${JSON.stringify(row, null, 2)}\n` :
      `task ${row.task_id}: expired (${row.reason})${row.forced ? " [FORCED]" : ""} — covers receipts ≤ ${row.cutoff}\n`);
    return 0;
  }
  const ledgerPath = args.ledger || findLedger();
  const policyPath = args.policy || (ledgerPath ? findPolicy(ledgerPath) : null);
  const policy = policyPath ? JSON.parse(readFileSync(path.resolve(policyPath), "utf8")) : {};
  const result = closeTaskEvidence({ taskId: args["task-id"], verification: args.verification,
    acceptance: args.acceptance || "unknown", source: args.source,
    checks: args.checks ? String(args.checks).split(",").map((item) => item.trim()).filter(Boolean) : [],
    reworkCount: args["rework-count"] == null ? 0 : Number(args["rework-count"]),
    stateDir: args["state-dir"] || null, maxEntries: policy?.retention?.outcome_max_entries || 2000,
    minimumSamples: policy?.selection?.empirical_optimization?.minimum_verified_samples || 10 });
  process.stdout.write(args.json === true ? `${JSON.stringify(result, null, 2)}\n` :
    `task ${result.task_id}: ${result.verified_passes} passed, ${result.verified_failures} failed attempt outcome(s)\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`MODEL-OS task evidence error: ${error.message}\n`); process.exitCode = 3;
  });
}
