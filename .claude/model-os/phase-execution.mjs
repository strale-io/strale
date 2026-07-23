#!/usr/bin/env node
// Operational explicit phase boundary: stay locally with zero provider work or
// dispatch an economics-approved switch through the existing safe dispatcher.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { dispatch } from "./dispatch.mjs";
import { readPerformanceSnapshot } from "./performance.mjs";
import { planPhaseRoute } from "./phase-routing.mjs";
import { findPolicy } from "./route-state.mjs";
import { findLedger } from "./select.mjs";
import { appendTelemetryEvent, telemetryEnabled, telemetryReason } from "./telemetry.mjs";

const BOUNDED_ID = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,119}$/;

function boundedId(value, label) {
  if (typeof value !== "string" || !BOUNDED_ID.test(value)) throw new Error(`${label} must be a bounded identifier`);
  return value;
}

function sameCandidate(left, right) {
  return left?.model === right?.model && left?.route === right?.route && left?.effort === right?.effort;
}

function projectDecision(decision, selected) {
  const candidates = [decision?.selected, ...(decision?.fallbacks || [])].filter(Boolean);
  if (!candidates.some((candidate) => sameCandidate(candidate, selected))) {
    throw new Error("phase candidate is outside the selector decision");
  }
  const fallbacks = candidates.filter((candidate) => !sameCandidate(candidate, selected));
  return { ...decision, status: decision.status || "routable", selected, fallbacks,
    model: selected.model, alias: selected.alias, provider: selected.provider, route: selected.route,
    surface: selected.surface, effort: selected.effort, effort_control: selected.effort_control || selected.effort };
}

function usageTokens(usage) {
  if (Number.isFinite(usage?.total_tokens)) return usage.total_tokens;
  const value = Number(usage?.input_tokens || 0) + Number(usage?.output_tokens || 0);
  return value || 0;
}

function emitPlan(plan, { taskId, stateDir, maxEntries, at }) {
  if (!telemetryEnabled()) return;
  const event = plan.action === "blocked" ? { run_id: taskId, at, component: "phase",
    event: "phase.plan.rejected", status: "rejected", phase_id: plan.phase_id, reason_code: plan.reason }
    : { run_id: taskId, at, component: "phase", event: "phase.plan.completed", status: plan.action,
      phase_id: plan.phase_id, selected_model: plan.selected?.model || null, reason_code: plan.reason,
      gross_savings_tokens: plan.gross_savings_tokens || 0, net_savings_tokens: plan.net_savings_tokens || 0,
      overhead_tokens: plan.overhead_tokens || 0, hysteresis_tokens: plan.hysteresis_tokens || 0,
      switch_count: plan.switch_count || 0 };
  try { appendTelemetryEvent(event, { stateDir, maxEntries }); } catch {}
}

function emitExecution({ plan, taskId, result, stateDir, maxEntries, at, durationMs }) {
  if (!telemetryEnabled()) return;
  const receipt = result?.receipt || null;
  const completed = plan.action === "stay" || result?.status === "completed";
  const event = completed ? { run_id: taskId, at, component: "phase", event: "phase.execution.completed",
    status: "completed", task_id: taskId, phase_id: plan.phase_id, action: plan.action,
    planned_model: plan.selected?.model || null,
    selected_model: receipt?.requested_model || plan.selected?.model || null,
    observed_model: receipt?.observed_model || null, receipt_id: receipt?.id || null,
    reason_code: plan.reason, gross_savings_tokens: plan.gross_savings_tokens || 0,
    net_savings_tokens: plan.net_savings_tokens || 0, reported_tokens: usageTokens(receipt?.usage),
    duration_ms: durationMs, fallback: result?.fallback === true }
    : { run_id: taskId, at, component: "phase", event: "phase.execution.failed", status: "failed",
      task_id: taskId, phase_id: plan.phase_id, action: plan.action,
      planned_model: plan.selected?.model || null,
      selected_model: receipt?.requested_model || plan.selected?.model || null, receipt_id: receipt?.id || null,
      reason_code: telemetryReason(result?.reason || result?.status, "phase-dispatch-failed"), duration_ms: durationMs };
  try { appendTelemetryEvent(event, { stateDir, maxEntries }); } catch {}
}

export async function executePhaseBoundary({ taskId, phaseId, decision, incumbent, performance, policy,
  envelope = null, mode = "analysis", workUnits = 1, transitionOverheadTokens = 0,
  switchesSoFar = 0, benchmarkVersion = null, stateDir = null, dryRun = false,
  dispatchFn = dispatch, dispatchOptions = {}, now = () => new Date().toISOString() } = {}) {
  const task = boundedId(taskId, "taskId");
  const phase = boundedId(phaseId, "phaseId");
  const started = Date.now();
  const at = now();
  const plan = planPhaseRoute({ phaseId: phase, decision, incumbent, performance, policy, workUnits,
    transitionOverheadTokens, switchesSoFar, benchmarkVersion, now: at });
  const maxEntries = policy?.retention?.run_telemetry_max_entries || 2000;
  emitPlan(plan, { taskId: task, stateDir, maxEntries, at });
  if (plan.action === "blocked") {
    emitExecution({ plan, taskId: task, result: { status: "blocked", reason: plan.reason },
      stateDir, maxEntries, at, durationMs: Date.now() - started });
    return { schema_version: 1, task_id: task, status: "blocked", plan, dispatch: null };
  }
  if (plan.action === "stay") {
    const result = { schema_version: 1, task_id: task, status: "stay", plan, dispatch: null };
    emitExecution({ plan, taskId: task, result, stateDir, maxEntries, at, durationMs: Date.now() - started });
    return result;
  }
  if (dryRun) return { schema_version: 1, task_id: task, status: "planned-switch", plan, dispatch: null };
  if (!envelope) throw new Error("an economics-approved switch requires a compact envelope");
  const projected = projectDecision(decision, plan.selected);
  const dispatched = await dispatchFn({ ...dispatchOptions, decision: projected, envelope, mode,
    stateDir, taskId: task, phaseId: phase, benchmarkVersion });
  const status = dispatched?.status === "completed" ? "switched" : "attention-required";
  emitExecution({ plan, taskId: task, result: dispatched, stateDir, maxEntries, at,
    durationMs: Date.now() - started });
  return { schema_version: 1, task_id: task, status, plan, dispatch: dispatched };
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
  if (!args["input-file"]) throw new Error("--input-file is required");
  const input = JSON.parse(readFileSync(path.resolve(args["input-file"]), "utf8"));
  const ledgerPath = path.resolve(args.ledger || findLedger());
  const policyPath = path.resolve(args.policy || findPolicy(ledgerPath));
  const stateDir = args["state-dir"] ? path.resolve(args["state-dir"]) : null;
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  const performance = readPerformanceSnapshot({ stateDir });
  const result = await executePhaseBoundary({ ...input, taskId: input.taskId || input.task_id,
    phaseId: input.phaseId || input.phase_id, policy, performance, stateDir, dryRun: args["dry-run"] === true,
    dispatchOptions: { ledger, ledgerPath, policyPath, currentProvider: input.currentProvider || null,
      estimatedDurationMs: input.estimatedDurationMs || 0, runKind: input.runKind || "work",
      repoPath: input.repoPath || null } });
  process.stdout.write(`${JSON.stringify(result, null, args.json === true ? 2 : 0)}\n`);
  return ["stay", "planned-switch", "switched"].includes(result.status) ? 0 : 4;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`MODEL-OS phase execution error: ${error.message}\n`); process.exitCode = 3;
  });
}
