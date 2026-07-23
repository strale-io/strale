#!/usr/bin/env node
// Off-hot-path MODEL-OS candidate evaluation and shadow comparison.
// This tool reads bounded studio results and emits a promotion decision report.
// It never edits routing.json, policy.json, or the active roster.

import { mkdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { atomicWriteFile } from "./state-store.mjs";
import { appendTelemetryEvent, hashOperationalValue, telemetryEnabled, telemetryReason } from "./telemetry.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function finiteScore(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${label} must be between 0 and 100`);
  return value;
}

export function evaluateCandidate({ candidate, incumbent, roles, results, policy, observedAt = new Date().toISOString() }) {
  if (typeof candidate !== "string" || !candidate) throw new Error("candidate is required");
  if (typeof incumbent !== "string" || !incumbent) throw new Error("incumbent is required");
  if (!Array.isArray(roles) || !roles.length || roles.some((role) => typeof role !== "string" || !role)) {
    throw new Error("roles must be a non-empty string array");
  }
  const corpus = policy?.evaluation?.corpus || [];
  if (!Array.isArray(results) || !results.length) throw new Error("results are required");
  const seen = new Set();
  const rows = results.map((row, index) => {
    if (!corpus.includes(row.category)) throw new Error(`results[${index}] category '${row.category}' is outside the policy corpus`);
    if (seen.has(row.category)) throw new Error(`duplicate evaluation category '${row.category}'`);
    seen.add(row.category);
    const candidateScore = finiteScore(row.candidate_score, `results[${index}].candidate_score`);
    const incumbentScore = finiteScore(row.incumbent_score, `results[${index}].incumbent_score`);
    if (!Number.isFinite(row.candidate_latency_ms) || row.candidate_latency_ms < 0 ||
        !Number.isFinite(row.incumbent_latency_ms) || row.incumbent_latency_ms < 0) {
      throw new Error(`results[${index}] latencies must be non-negative`);
    }
    return {
      category: row.category,
      effort: row.effort || "medium",
      candidate_score: candidateScore,
      incumbent_score: incumbentScore,
      quality_delta: Number((candidateScore - incumbentScore).toFixed(2)),
      candidate_latency_ms: row.candidate_latency_ms,
      incumbent_latency_ms: row.incumbent_latency_ms,
    };
  });
  const missing = corpus.filter((category) => !seen.has(category));
  const qualityDelta = Number((rows.reduce((sum, row) => sum + row.quality_delta, 0) / rows.length).toFixed(2));
  const worstRegression = Math.min(...rows.map((row) => row.quality_delta));
  const latencyDelta = Number((rows.reduce((sum, row) => sum +
    (row.candidate_latency_ms - row.incumbent_latency_ms), 0) / rows.length).toFixed(2));
  const clearWin = policy?.evaluation?.automatic_promotion_min_clear_win_percent ?? 10;
  const automaticRoles = new Set(policy?.evaluation?.automatic_promotion_roles || []);
  const automaticScope = roles.every((role) => automaticRoles.has(role));
  let recommendation = "continue-shadow";
  if (!missing.length && qualityDelta >= clearWin && worstRegression >= 0) {
    recommendation = automaticScope ? "automatic-promotion-eligible" : "promotion-proposed-with-rollback";
  } else if (!missing.length && qualityDelta < 0) recommendation = "retain-incumbent";
  const evidence = { candidate, incumbent, roles: [...new Set(roles)], corpus: [...corpus], rows };
  return {
    schema_version: 1,
    evaluation_id: randomUUID(),
    evidence_hash: hashOperationalValue(evidence),
    observed_at: observedAt,
    candidate,
    incumbent,
    roles: [...new Set(roles)],
    corpus_complete: missing.length === 0,
    missing_categories: missing,
    shadow_comparison: {
      mean_quality_delta: qualityDelta,
      worst_category_delta: worstRegression,
      mean_latency_delta_ms: latencyDelta,
      rows,
    },
    recommendation,
    promotion_gate: {
      evaluation_required: true,
      active_roster_unchanged: true,
      automatic_scope: automaticScope,
      threshold_percent: clearWin,
      rollback_required: roles.includes("taste-canon"),
      founder_needed_only_if_materially_ambiguous: roles.includes("taste-canon"),
    },
  };
}

export function persistEvaluationReport(report, outputFile) {
  const resolved = path.resolve(outputFile);
  mkdirSync(path.dirname(resolved), { recursive: true });
  atomicWriteFile(resolved, JSON.stringify(report, null, 2) + "\n");
  return resolved;
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
  const startedAt = Date.now();
  const args = parseArgs(argv);
  if (!args["input-file"]) throw new Error("--input-file is required");
  const input = JSON.parse(readFileSync(path.resolve(args["input-file"]), "utf8"));
  const policyPath = path.resolve(args.policy || path.join(HERE, "policy.json"));
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  const report = evaluateCandidate({ ...input, policy });
  const output = args.output || path.join(process.env.MODEL_OS_STATE_DIR || path.join(os.homedir(), ".model-os"),
    "evaluations", `${report.observed_at.slice(0, 10)}-${report.candidate}.json`);
  persistEvaluationReport(report, output);
  if (telemetryEnabled() && args["no-telemetry"] !== true) {
    try { appendTelemetryEvent({ run_id: report.evaluation_id, at: new Date().toISOString(), component: "evaluation",
      event: "evaluation.completed", status: "completed", duration_ms: Date.now() - startedAt,
      candidate_id: report.candidate, evidence_hash: report.evidence_hash, reason_code: report.recommendation },
    { stateDir: args["state-dir"], maxEntries: policy?.retention?.run_telemetry_max_entries || 2000 }); } catch {}
  }
  process.stdout.write(JSON.stringify(report, null, args.json === true ? 2 : 0) + "\n");
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    if (telemetryEnabled()) {
      try { appendTelemetryEvent({ run_id: randomUUID(), at: new Date().toISOString(), component: "evaluation",
        event: "evaluation.failed", status: "failed", duration_ms: 0,
        reason_code: telemetryReason(error, "evaluation-failed") }, { maxEntries: 2000 }); } catch {}
    }
    process.stderr.write(`MODEL-OS evaluate error: ${error.message}\n`);
    process.exitCode = 3;
  });
}
