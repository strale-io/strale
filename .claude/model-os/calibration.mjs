#!/usr/bin/env node
// Off-hot-path bounded calibration. Planning is local and prompt-free; actual
// execution requires an injected safe executor plus deterministic verifier.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readPerformanceSnapshot } from "./performance.mjs";
import { findPolicy } from "./route-state.mjs";
import { findLedger } from "./select.mjs";
import { resolveStateDir } from "./state-store.mjs";
import { closeTaskEvidence } from "./task-evidence.mjs";

const BOUNDED_ID = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,119}$/;

function id(value, label) {
  if (typeof value !== "string" || !BOUNDED_ID.test(value)) throw new Error(`${label} must be a bounded identifier`);
  return value;
}

function uniqueReceipts(receipts) {
  const rows = new Map();
  for (const receipt of receipts || []) {
    if (!receipt?.id) continue;
    const previous = rows.get(receipt.id);
    if (!previous || Date.parse(receipt.at || 0) >= Date.parse(previous.at || 0)) rows.set(receipt.id, receipt);
  }
  return [...rows.values()];
}

export function calibrationCapacity({ receipts = [], policy = {} } = {}) {
  const config = policy.calibration || {};
  const fraction = Number(config.max_shadow_fraction ?? 0.05);
  const cycleCap = Number(config.max_runs_per_cycle ?? 2);
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 0.25) throw new Error("max_shadow_fraction must be between 0 and 0.25");
  if (!Number.isInteger(cycleCap) || cycleCap < 0 || cycleCap > 20) throw new Error("max_runs_per_cycle must be an integer between 0 and 20");
  const rows = uniqueReceipts(receipts).filter((row) => row.requested_model);
  const organic = rows.filter((row) => row.run_kind === "work").length;
  const evaluation = rows.filter((row) => row.run_kind === "evaluation").length;
  const lifetimeAllowance = Math.floor(organic * fraction);
  const remaining = Math.max(0, lifetimeAllowance - evaluation);
  return { organic_attempts: organic, evaluation_attempts: evaluation, max_shadow_fraction: fraction,
    lifetime_allowance: lifetimeAllowance, remaining_allowance: remaining,
    cycle_cap: cycleCap, available_slots: Math.min(cycleCap, remaining) };
}

function unitGroupKey(unit, benchmarkVersion) {
  const candidate = unit.candidate || unit.decision?.selected;
  if (!candidate) throw new Error(`calibration unit '${unit.id}' has no selector candidate`);
  return [candidate.model, candidate.role || unit.role || unit.decision?.role, candidate.effort,
    unit.phase_id || unit.phaseId, benchmarkVersion].join("|");
}

export function planCalibration({ units = [], receipts = [], performance = null, policy = {} } = {}) {
  if (!Array.isArray(units)) throw new Error("units must be an array");
  const config = policy.calibration || {};
  const benchmarkVersion = id(config.benchmark_version || "model-os-v1", "benchmark_version");
  const capacity = calibrationCapacity({ receipts, policy });
  if (config.enabled !== true || capacity.available_slots === 0) {
    return { schema_version: 1, benchmark_version: benchmarkVersion, capacity, selected: [] };
  }
  const target = policy?.selection?.empirical_optimization?.minimum_verified_samples || 10;
  const seen = new Set();
  const ranked = units.map((unit, index) => {
    const unitId = id(unit?.id, `units[${index}].id`);
    if (seen.has(unitId)) throw new Error(`duplicate calibration unit '${unitId}'`);
    seen.add(unitId);
    id(unit.task_id || unit.taskId, `units[${index}].task_id`);
    id(unit.phase_id || unit.phaseId, `units[${index}].phase_id`);
    const key = unitGroupKey(unit, benchmarkVersion);
    const group = performance?.groups?.[key] || null;
    return { unit, id: unitId, group_key: key, verified_samples: Number(group?.verified_samples || 0),
      eligible: group?.optimization_eligible === true };
  }).filter((row) => !row.eligible && row.verified_samples < target)
    .sort((left, right) => left.verified_samples - right.verified_samples || left.id.localeCompare(right.id));
  return { schema_version: 1, benchmark_version: benchmarkVersion, capacity,
    selected: ranked.slice(0, capacity.available_slots).map((row) => ({ ...row.unit,
      group_key: row.group_key, verified_samples: row.verified_samples })) };
}

export async function runCalibrationCycle({ units = [], receipts = [], performance = null, policy = {},
  stateDir = null, executeUnit, verifyUnit } = {}) {
  const plan = planCalibration({ units, receipts, performance, policy });
  if (!plan.selected.length) return { status: "no-capacity", plan, results: [] };
  if (typeof executeUnit !== "function") throw new Error("calibration execution requires a safe executor");
  if (typeof verifyUnit !== "function") throw new Error("calibration execution requires a deterministic verifier");
  const results = [];
  for (const unit of plan.selected) {
    const taskId = unit.task_id || unit.taskId;
    const execution = await executeUnit({ ...unit, taskId, phaseId: unit.phase_id || unit.phaseId,
      runKind: "evaluation", benchmarkVersion: plan.benchmark_version });
    const dispatched = execution?.dispatch || execution;
    if (dispatched?.status !== "completed" || !dispatched?.receipt?.id) {
      results.push({ unit_id: unit.id, task_id: taskId, status: "execution-failed", execution });
      continue;
    }
    const verification = await verifyUnit({ unit, execution, receipt: dispatched.receipt });
    if (!verification || !["passed", "failed"].includes(verification.verification) ||
        typeof verification.source !== "string" || !Array.isArray(verification.checks)) {
      throw new Error(`calibration verifier returned invalid evidence for '${unit.id}'`);
    }
    const evidence = closeTaskEvidence({ taskId, verification: verification.verification,
      acceptance: verification.acceptance || "unknown", source: verification.source, checks: verification.checks,
      reworkCount: verification.rework_count || 0, stateDir,
      maxEntries: policy?.retention?.outcome_max_entries || 2000,
      minimumSamples: policy?.selection?.empirical_optimization?.minimum_verified_samples || 10 });
    results.push({ unit_id: unit.id, task_id: taskId, status: "verified", evidence });
  }
  return { status: "completed", plan, results };
}

function readReceipts(stateDir) {
  const file = path.join(resolveStateDir(stateDir), "dispatch.receipts.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
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
  const ledgerPath = args.ledger || findLedger();
  const policyPath = args.policy || (ledgerPath ? findPolicy(ledgerPath) : null);
  if (!policyPath) throw new Error("calibration requires policy.json");
  const policy = JSON.parse(readFileSync(path.resolve(policyPath), "utf8"));
  const stateDir = args["state-dir"] ? path.resolve(args["state-dir"]) : null;
  const plan = planCalibration({ units: input.units || [], receipts: readReceipts(stateDir),
    performance: readPerformanceSnapshot({ stateDir }), policy });
  process.stdout.write(`${JSON.stringify(plan, null, args.json === true ? 2 : 0)}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`MODEL-OS calibration error: ${error.message}\n`); process.exitCode = 3;
  });
}
