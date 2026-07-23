#!/usr/bin/env node
// Outcome-backed MODEL-OS statistics. This stays off the prompt hot path and
// writes a compact last-known-good snapshot for deterministic selection.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { latestOutcomesByReceipt, readOutcomes } from "./outcomes.mjs";
import { atomicWriteFile, resolveStateDir } from "./state-store.mjs";

export const PERFORMANCE_SCHEMA_VERSION = 1;

export function performanceFreshness(snapshot, { now = new Date().toISOString(), maxAgeSeconds = 30 * 86400 } = {}) {
  const generated = Date.parse(snapshot?.generated_at);
  const at = Date.parse(now);
  if (!Number.isFinite(generated) || !Number.isFinite(at)) return { fresh: false, reason: "invalid-generated-at" };
  if (!Number.isFinite(maxAgeSeconds) || maxAgeSeconds <= 0) return { fresh: false, reason: "invalid-max-age" };
  if (generated > at + 300_000) return { fresh: false, reason: "future-snapshot" };
  if (at >= generated + maxAgeSeconds * 1000) return { fresh: false, reason: "stale-snapshot" };
  return { fresh: true, reason: "current" };
}

function readJsonl(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`${path.basename(file)} line ${index + 1}: ${error.message}`); }
  });
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(2));
}

function mean(values) {
  const found = values.filter(Number.isFinite);
  return found.length ? Number((found.reduce((sum, value) => sum + value, 0) / found.length).toFixed(2)) : null;
}

function totalTokens(usage) {
  if (Number.isFinite(usage?.total_tokens)) return usage.total_tokens;
  const input = Number(usage?.input_tokens || 0);
  const output = Number(usage?.output_tokens || 0);
  return input || output ? input + output : null;
}

function rate(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : null;
}

function groupKey(receipt) {
  const key = [receipt.requested_model || "unknown-model", receipt.role || "unknown-role",
    receipt.effort || "unknown-effort"];
  if (receipt.phase_id) key.push(receipt.phase_id);
  if (receipt.benchmark_version) key.push(receipt.benchmark_version);
  return key.join("|");
}

// Capability tags come from the selection profile the dispatch receipt already carries —
// what the task DEMANDED, recorded mechanically at dispatch time, never self-reported later.
// Tags are canonicalized and bounded before becoming persisted snapshot keys (Sol review F5):
// select.mjs validates capabilities against the ledger vocabulary at selection time, but this
// reader consumes raw JSONL and must not trust it.
const CAPABILITY_TAG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

// Deterministic verification (a machine check) can only validate EXECUTION-class capabilities.
// It cannot validate TASTE/JUDGMENT capabilities: "the report exists" or "the suite passed" is no
// evidence that the design judgment was right or the copy was good. Crediting them from a generic
// check is semantically invalid — it launders artifact integrity into taste evidence and produced
// meaningless "predicted success" numbers for exactly the capabilities that drive quality
// (cross-provider MODEL-OS audit, 2026-07-19). This is an ALLOWLIST, not a denylist (Sol review of
// the fix: a finite denylist lets an unlisted synonym like "visual-taste"/"editorial-judgment" leak
// back in): ONLY capabilities a deterministic pass/fail genuinely evidences accrue machine-check
// evidence; every other tag — unknown, new, or judgment — is EXCLUDED by default (fail-safe). Taste
// gets no evidence until a separate JUDGMENT-EVIDENCE class exists (blinded/target labels, control
// ballots, market outcomes — DEC-231's taste-learning charter, NOT this loop). Deliberately tight:
// under-crediting is the correct bias for an evidence-of-trust concern.
const MACHINE_VERIFIABLE_CAPABILITIES = new Set([
  "coding", "debugging", "precision", "mechanical-reliability", "agentic-tool-execution",
]);

function receiptCapabilities(receipt) {
  const profile = receipt?.profile;
  const tags = [
    ...(Array.isArray(profile?.requiredCapabilities) ? profile.requiredCapabilities : []),
    ...(Array.isArray(profile?.preferredCapabilities) ? profile.preferredCapabilities : []),
  ];
  return [...new Set(tags.filter((tag) => typeof tag === "string")
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => CAPABILITY_TAG.test(tag) && MACHINE_VERIFIABLE_CAPABILITIES.has(tag)))];
}

// Capability evidence requires exact verified identity (Sol review F2/F3): only a COMPLETED
// receipt whose observed model equals the requested model may credit (or debit) that model's
// capability pair. A blocked/review-pending/identity-unverified attempt proves nothing about
// the requested model's capability, even when a task-level close assigned it an outcome.
function exactIdentityCompleted(receipt) {
  return receipt.status === "completed" && typeof receipt.observed_model === "string" &&
    receipt.observed_model === receipt.requested_model;
}

export function summarizePerformance({ receipts, outcomes = [], minimumSamples = 10,
  generatedAt = new Date().toISOString() }) {
  if (!Number.isInteger(minimumSamples) || minimumSamples < 1) throw new Error("minimumSamples must be a positive integer");
  const latest = latestOutcomesByReceipt(outcomes);
  const groups = new Map();
  const uniqueReceipts = new Map();
  for (const receipt of receipts || []) {
    if (!receipt?.id) continue;
    const previous = uniqueReceipts.get(receipt.id);
    if (!previous || Date.parse(receipt.at || 0) >= Date.parse(previous.at || 0)) uniqueReceipts.set(receipt.id, receipt);
  }
  const capabilityGroups = new Map();
  for (const receipt of uniqueReceipts.values()) {
    if (["test", "probe"].includes(receipt.run_kind)) continue;
    const key = groupKey(receipt);
    if (!groups.has(key)) groups.set(key, { key, model: receipt.requested_model || "unknown-model",
      role: receipt.role || "unknown-role", effort: receipt.effort || "unknown-effort", receipts: [] });
    groups.get(key).receipts.push({ receipt, outcome: latest.get(receipt.id) || null });
    if (!exactIdentityCompleted(receipt)) continue;
    for (const capability of receiptCapabilities(receipt)) {
      const capabilityKey = `${receipt.requested_model}|${capability}`;
      if (!capabilityGroups.has(capabilityKey)) capabilityGroups.set(capabilityKey,
        { model: receipt.requested_model, capability, receipts: [] });
      capabilityGroups.get(capabilityKey).receipts.push({ receipt, outcome: latest.get(receipt.id) || null });
    }
  }
  const summaries = {};
  for (const [key, group] of groups) {
    const completed = group.receipts.filter(({ receipt }) => receipt.status === "completed");
    const verified = group.receipts.filter(({ outcome }) => ["passed", "failed"].includes(outcome?.verification));
    const passed = verified.filter(({ outcome }) => outcome.verification === "passed");
    const accepted = group.receipts.filter(({ outcome }) => outcome?.acceptance === "accepted");
    const completedTokens = completed.map(({ receipt }) => totalTokens(receipt.usage)).filter(Number.isFinite);
    const attemptTokens = group.receipts.map(({ receipt }) => totalTokens(receipt.usage)).filter(Number.isFinite);
    const durations = completed.map(({ receipt }) => Number(receipt.duration_ms)).filter(Number.isFinite);
    const passRate = rate(passed.length, verified.length);
    const smoothedPassRate = verified.length ? Number(((passed.length + 1) / (verified.length + 2)).toFixed(4)) : null;
    const medianTokens = median(completedTokens);
    const meanAttemptTokens = mean(attemptTokens);
    const outcomeCoverage = rate(verified.length, group.receipts.length);
    const usageCoverage = rate(attemptTokens.length, group.receipts.length);
    const identityComplete = group.receipts.every(({ receipt }) =>
      typeof receipt.requested_model === "string" && receipt.requested_model !== "unknown-model" &&
      receipt.status !== "identity-unverified" &&
      (receipt.status !== "completed" || typeof receipt.observed_model === "string"));
    const eligibilityReasons = [];
    if (verified.length < minimumSamples) eligibilityReasons.push("insufficient-verified-samples");
    if (outcomeCoverage !== 1) eligibilityReasons.push("incomplete-outcome-coverage");
    if (usageCoverage !== 1) eligibilityReasons.push("incomplete-usage-coverage");
    if (!identityComplete) eligibilityReasons.push("incomplete-identity");
    if (smoothedPassRate == null || meanAttemptTokens == null) eligibilityReasons.push("economics-unavailable");
    const expectedTokens = meanAttemptTokens != null && smoothedPassRate
      ? Number((meanAttemptTokens / smoothedPassRate).toFixed(2)) : null;
    const confidenceMargin = expectedTokens != null && verified.length
      ? Number((expectedTokens / Math.sqrt(verified.length)).toFixed(2)) : null;
    summaries[key] = {
      model: group.model,
      role: group.role,
      effort: group.effort,
      sample_count: group.receipts.length,
      completion_count: completed.length,
      completion_rate: rate(completed.length, group.receipts.length),
      verified_samples: verified.length,
      verified_passes: passed.length,
      verified_pass_rate: passRate,
      predicted_success: smoothedPassRate,
      outcome_coverage: outcomeCoverage,
      usage_coverage: usageCoverage,
      accepted_count: accepted.length,
      rework_count: group.receipts.reduce((sum, { outcome }) => sum + Number(outcome?.rework_count || 0), 0),
      median_total_tokens: medianTokens,
      mean_attempt_tokens: meanAttemptTokens,
      median_duration_ms: median(durations),
      expected_verified_tokens: expectedTokens,
      confidence_margin_tokens: confidenceMargin,
      calibrated: verified.length >= minimumSamples,
      optimization_eligible: eligibilityReasons.length === 0,
      optimization_ineligible_reasons: eligibilityReasons,
    };
  }
  // Per-model|capability aggregation of the SAME verified outcomes (no extra evidence class).
  // Empirical posterior to the registry's desk-score prior: registry mutation stays a ratified
  // act — status.mjs surfaces calibrated inversions as review proposals, nothing auto-writes.
  const capabilities = {};
  for (const [key, group] of capabilityGroups) {
    const verified = group.receipts.filter(({ outcome }) => ["passed", "failed"].includes(outcome?.verification));
    const passed = verified.filter(({ outcome }) => outcome.verification === "passed");
    capabilities[key] = {
      model: group.model,
      capability: group.capability,
      sample_count: group.receipts.length,
      verified_samples: verified.length,
      verified_passes: passed.length,
      verified_pass_rate: rate(passed.length, verified.length),
      predicted_success: verified.length ? Number(((passed.length + 1) / (verified.length + 2)).toFixed(4)) : null,
      calibrated: verified.length >= minimumSamples,
    };
  }
  return { schema_version: PERFORMANCE_SCHEMA_VERSION, generated_at: generatedAt,
    minimum_samples: minimumSamples, groups: summaries, capabilities };
}

// Calibrated empirical evidence that CONTRADICTS the registry's prior ordering on a capability:
// model A has a strictly higher desk score than model B, yet B's calibrated verified pass rate
// beats A's by more than `margin`. Pure read — the return value is a review proposal, not a write.
export function capabilityPriorInversions({ snapshot, ledger, margin = 0.1 } = {}) {
  const rows = Object.values(snapshot?.capabilities || {}).filter((row) => row.calibrated &&
    Number.isFinite(row.verified_pass_rate));
  const priors = new Map();
  for (const model of ledger?.models || []) {
    for (const [capability, score] of Object.entries(model.capability_scores || {})) {
      if (Number.isFinite(score)) priors.set(`${model.id}|${capability}`, score);
    }
  }
  const byCapability = new Map();
  for (const row of rows) {
    const prior = priors.get(`${row.model}|${row.capability}`);
    if (!Number.isFinite(prior)) continue;
    if (!byCapability.has(row.capability)) byCapability.set(row.capability, []);
    byCapability.get(row.capability).push({ ...row, prior });
  }
  const inversions = [];
  for (const [capability, entries] of byCapability) {
    for (const higher of entries) for (const lower of entries) {
      if (higher.prior > lower.prior && lower.verified_pass_rate - higher.verified_pass_rate > margin) {
        inversions.push({ capability, higher_prior_model: higher.model, higher_prior: higher.prior,
          higher_prior_pass_rate: higher.verified_pass_rate, lower_prior_model: lower.model,
          lower_prior: lower.prior, lower_prior_pass_rate: lower.verified_pass_rate,
          verified_samples: Math.min(higher.verified_samples, lower.verified_samples) });
      }
    }
  }
  return inversions.sort((a, b) => a.capability.localeCompare(b.capability) ||
    a.higher_prior_model.localeCompare(b.higher_prior_model));
}

export function performancePath(stateDir = null) {
  return path.join(resolveStateDir(stateDir), "performance.json");
}

export function readPerformanceSnapshot({ stateDir = null } = {}) {
  const file = performancePath(stateDir);
  if (!existsSync(file)) return null;
  const snapshot = JSON.parse(readFileSync(file, "utf8"));
  if (snapshot?.schema_version !== PERFORMANCE_SCHEMA_VERSION || !snapshot.groups || typeof snapshot.groups !== "object") {
    throw new Error(`performance snapshot schema unsupported in ${file}`);
  }
  if (!Number.isFinite(Date.parse(snapshot.generated_at))) throw new Error(`performance snapshot generated_at invalid in ${file}`);
  return snapshot;
}

export function refreshPerformanceSnapshot({ stateDir = null, minimumSamples = 10,
  generatedAt = new Date().toISOString() } = {}) {
  const dir = resolveStateDir(stateDir);
  const receipts = readJsonl(path.join(dir, "dispatch.receipts.jsonl"));
  const outcomes = readOutcomes({ stateDir: dir });
  const snapshot = summarizePerformance({ receipts, outcomes, minimumSamples, generatedAt });
  atomicWriteFile(performancePath(dir), `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
}

function render(snapshot) {
  const rows = Object.entries(snapshot.groups).map(([key, group]) =>
    `${key}: n=${group.sample_count}, completed=${group.completion_rate ?? "unknown"}, ` +
    `verified=${group.verified_pass_rate ?? "unknown"}, tokens=${group.median_total_tokens ?? "unknown"}, ` +
    `latency=${group.median_duration_ms ?? "unknown"}ms${group.calibrated ? " [calibrated]" : ""}`);
  return [`MODEL-OS performance (${rows.length} model/role/effort groups; minimum verified samples ${snapshot.minimum_samples})`,
    ...rows].join("\n");
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--json") args.json = true;
    else if (arg.startsWith("--")) {
      const value = argv[++index];
      if (value == null) throw new Error(`${arg} requires a value`);
      args[arg.slice(2)] = value;
    } else throw new Error(`unexpected positional argument '${arg}'`);
  }
  return args;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const snapshot = refreshPerformanceSnapshot({ stateDir: args["state-dir"],
    minimumSamples: args["minimum-samples"] == null ? 10 : Number(args["minimum-samples"]) });
  process.stdout.write(args.json ? `${JSON.stringify(snapshot, null, 2)}\n` : `${render(snapshot)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`MODEL-OS performance error: ${error.message}\n`);
    process.exitCode = 3;
  });
}
