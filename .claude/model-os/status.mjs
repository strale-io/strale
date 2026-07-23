#!/usr/bin/env node
// Read-only, local MODEL-OS operational status. No refresh, probe, dispatch,
// lifecycle transition, or telemetry write is performed here.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMaintenancePlan } from "./maintenance.mjs";
import { calibrationCapacity } from "./calibration.mjs";
import { readLifecycle, readWatchlist } from "./candidate-lifecycle.mjs";
import { latestOutcomesByReceipt, readOutcomes } from "./outcomes.mjs";
import { capabilityPriorInversions } from "./performance.mjs";
import { quotaRecoveryDeadline } from "./quota-recovery.mjs";
import { findLedger, select } from "./select.mjs";
import { evaluateRoute, findPolicy, loadRouteContext, routeStatusLabel } from "./route-state.mjs";
import { effectiveObservation, processAlive, resolveStateDir } from "./state-store.mjs";
import { readTelemetry } from "./telemetry.mjs";

function readJson(file, { optional = false } = {}) {
  if (!existsSync(file)) return optional ? { value: null, error: null } : { value: null, error: `missing file: ${file}` };
  try { return { value: JSON.parse(readFileSync(file, "utf8")), error: null }; }
  catch (error) { return { value: null, error: `${path.basename(file)} unreadable: ${error.message}` }; }
}

function readJsonl(file, limit = 1000) {
  if (!existsSync(file)) return { rows: [], errors: [] };
  const rows = []; const errors = [];
  readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).slice(-limit).forEach((line, index) => {
    try { rows.push(JSON.parse(line)); } catch (error) { errors.push(`line ${index + 1}: ${error.message}`); }
  });
  return { rows, errors };
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(2));
}

function usageTokens(usage) {
  if (Number.isFinite(usage?.total_tokens)) return usage.total_tokens;
  const total = Number(usage?.input_tokens || 0) + Number(usage?.output_tokens || 0);
  return total || null;
}

function stateCounts(records) {
  const counts = {};
  for (const record of records) counts[record.state] = (counts[record.state] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function latestWhere(rows, predicate) {
  for (let index = (rows || []).length - 1; index >= 0; index--) if (predicate(rows[index])) return rows[index];
  return null;
}

function routeReasonCodes(evaluation) {
  const codes = [];
  const add = (code) => { if (code && !codes.includes(code)) codes.push(code); };
  if (evaluation.routable) return codes;
  const facts = evaluation.facts || {};
  if (facts.catalog?.state && facts.catalog.state !== "present") add(`catalog-${facts.catalog.state}`);
  if (facts.entitlement?.state && facts.entitlement.state !== "entitled") add(`entitlement-${facts.entitlement.state}`);
  if (facts.spendGuard?.state && facts.spendGuard.state !== "disabled") add(`spend-guard-${facts.spendGuard.state}`);
  if (["unknown", "invalid"].includes(facts.billingBoundary?.status)) add(`billing-${facts.billingBoundary.status}`);
  if (facts.billingBoundary?.status === "beyond") add("billing-boundary-beyond");
  if (facts.billing?.hard_forbidden) add("billing-hard-forbidden");
  for (const quota of facts.quota || []) {
    if (!quota.capacity?.allowed) add(`quota-${quota.observation?.state || "unknown"}:${quota.resource || "unknown"}`);
  }
  for (const reason of evaluation.reasons || []) {
    if (reason.includes("lifecycle state is unreadable")) add("lifecycle-unreadable");
    else if (reason.includes("lifecycle") && reason.includes("not routable")) add("lifecycle-not-routable");
    else if (reason.includes("policy missing")) add("policy-missing");
    else if (reason.includes("missing") || reason.includes("invalid") || reason.includes("unsupported") || reason.includes("does not match")) add("route-invalid");
  }
  if (!codes.length) add("route-unavailable");
  return codes.sort();
}

export function classifyPendingReviews({ receipts = [], ledger, context } = {}) {
  const latest = new Map();
  const ordered = [...receipts].sort((left, right) => {
    const leftAt = Date.parse(left?.at); const rightAt = Date.parse(right?.at);
    const timeOrder = (Number.isFinite(leftAt) ? leftAt : 0) - (Number.isFinite(rightAt) ? rightAt : 0);
    return timeOrder || String(left?.id || "").localeCompare(String(right?.id || ""));
  });
  for (const receipt of ordered) {
    if (receipt.mode !== "review" || !receipt.task_fingerprint) continue;
    latest.set(receipt.task_fingerprint, receipt);
  }
  const pending = [];
  for (const receipt of latest.values()) {
    if (receipt.status !== "review-pending") continue;
    let decision = null;
    let currentStatus = "unknown";
    let reasonCode = "profile-unavailable";
    try {
      if (receipt.profile && context) {
        decision = select({ ...receipt.profile, routeContext: context }, ledger);
        currentStatus = decision.status === "routable" ? "retryable"
          : decision.blackState === true ? "blocked-black-state" : "blocked";
        reasonCode = decision.status === "routable" ? "route-recovered"
          : decision.blackState === true ? "capacity-unavailable" : "routing-unavailable";
      }
    } catch { reasonCode = "fresh-selection-failed"; }
    pending.push({ receipt_id: receipt.id, at: receipt.at || null, task_id: receipt.task_id || null,
      task_fingerprint: receipt.task_fingerprint, historical_status: "review-pending", current_status: currentStatus,
      selected_model: decision?.selected?.model || null, route_id: decision?.selected?.route || null,
      reason_code: reasonCode });
  }
  return pending.sort((left, right) => String(left.at).localeCompare(String(right.at)) || left.receipt_id.localeCompare(right.receipt_id));
}

export function collectStatus({ ledgerPath = findLedger(), policyPath = null, stateDir = null,
  now = new Date().toISOString(), receiptLimit = 100 } = {}) {
  const requiredErrors = [];
  const warnings = [];
  if (!ledgerPath) return { exit_code: 3, report: { schema_version: 1, observed_at: now, overall: "degraded",
    errors: ["routing ledger not found"], warnings: [] } };
  const ledgerRead = readJson(path.resolve(ledgerPath));
  if (ledgerRead.error) requiredErrors.push(ledgerRead.error);
  const resolvedPolicy = policyPath || findPolicy(ledgerPath);
  const policyRead = resolvedPolicy ? readJson(path.resolve(resolvedPolicy)) : { value: null, error: "policy not found" };
  if (policyRead.error) requiredErrors.push(policyRead.error);
  if (requiredErrors.length) return { exit_code: 3, report: { schema_version: 1, observed_at: now,
    overall: "degraded", errors: requiredErrors, warnings } };
  const ledger = ledgerRead.value; const policy = policyRead.value; const dir = resolveStateDir(stateDir);
  let context;
  try { context = loadRouteContext({ ledgerPath, policyPath: resolvedPolicy, stateDir: dir, now }); }
  catch (error) { requiredErrors.push(`route context unavailable: ${error.message}`); }
  const lifecycle = context?.lifecycle || readLifecycle({ stateDir: dir });
  if (lifecycle.errors?.length) requiredErrors.push(...lifecycle.errors);
  if (context?.store?.errors?.length) requiredErrors.push(...context.store.errors);
  const evaluations = [];
  if (context) for (const model of ledger.models || []) {
    const roles = Array.isArray(model.roles_qualified) ? model.roles_qualified : [];
    for (const route of model.access_routes || []) {
      const byRole = roles.map((role) => {
        const result = evaluateRoute(model, route, context, { role, taskClass: role, fanoutWidth: 1 });
        return { role, status: routeStatusLabel(result), reason_codes: routeReasonCodes(result),
          reasons: result.reasons.length, warnings: result.warnings.length };
      });
      const labels = byRole.map((item) => item.status);
      const status = labels.includes("available") ? "available"
        : labels.includes("attemptable") ? "attemptable"
          : labels.includes("unknown") ? "unknown"
            : labels.length ? "unavailable" : "unqualified";
      evaluations.push({ model: model.id, route: route.id, status,
        lifecycle: lifecycle.candidates?.[model.id]?.state || model.lifecycle_state || "unknown",
        role_statuses: byRole });
    }
  }
  const routeCounts = stateCounts(evaluations.map((item) => ({ state: item.status })));
  if ((routeCounts.unknown || 0) + (routeCounts.unavailable || 0) > 0) warnings.push("some routes need attention");
  let plan = null;
  try { plan = buildMaintenancePlan({ ledger, policy, stateDir: dir, now }); }
  catch (error) { requiredErrors.push(`maintenance plan unavailable: ${error.message}`); }
  const maintenanceRead = readJson(path.join(dir, "maintenance.json"), { optional: true });
  if (maintenanceRead.error) warnings.push(maintenanceRead.error);
  const monitorRead = readJson(path.join(dir, "freshness-monitor.json"), { optional: true });
  if (monitorRead.error) warnings.push(monitorRead.error);
  const monitorAgeMs = Date.parse(now) - Date.parse(monitorRead.value?.last_cycle_at);
  const monitorDead = monitorRead.value?.status === "running" && !processAlive(monitorRead.value?.pid);
  if (monitorDead) warnings.push("freshness monitor process is not running");
  if (monitorRead.value?.status === "degraded") warnings.push("freshness monitor reports degraded");
  if (!monitorDead && monitorRead.value?.status === "running" && Number.isFinite(monitorAgeMs) &&
      monitorAgeMs > Number(policy?.maintenance?.max_poll_seconds || 900) * 2000) {
    warnings.push("freshness monitor heartbeat is stale");
  }
  if (plan?.due) warnings.push(`${plan.due_count} maintenance source(s) due`);
  const receipts = readJsonl(path.join(dir, "dispatch.receipts.jsonl"), receiptLimit);
  if (receipts.errors.length) warnings.push(`dispatch receipts contain ${receipts.errors.length} invalid row(s)`);
  const completed = receipts.rows.filter((row) => row.status === "completed");
  const tokens = completed.map((row) => usageTokens(row.usage)).filter(Number.isFinite);
  const dispatch = {
    recent_count: receipts.rows.length,
    completed: completed.length,
    blocked: receipts.rows.filter((row) => ["blocked", "refused", "candidate-failed"].includes(row.status)).length,
    identity_unverified: receipts.rows.filter((row) => row.status === "identity-unverified").length,
    fallbacks: receipts.rows.filter((row) => row.fallback === true).length,
    median_duration_ms: median(completed.map((row) => Number(row.duration_ms))),
    total_reported_tokens: tokens.length ? tokens.reduce((sum, value) => sum + value, 0) : null,
    // run_kind is caller-supplied and probe/test/evaluation are evidence-exempt (Sol review F1):
    // the exemption cannot be machine-enforced, so its USE is made visible instead — an unusual
    // share of exempt dispatches is a review flag, not a silent bypass.
    by_run_kind: receipts.rows.reduce((counts, row) => {
      const kind = typeof row.run_kind === "string" && row.run_kind ? row.run_kind : "unknown";
      counts[kind] = (counts[kind] || 0) + 1; return counts;
    }, {}),
  };
  if (dispatch.identity_unverified) warnings.push(`${dispatch.identity_unverified} recent identity-unverified dispatch(es)`);
  const watch = readWatchlist({ stateDir: dir });
  if (watch.errors.length) warnings.push(`watchlist contains ${watch.errors.length} invalid row(s)`);
  const lifecycleRecords = Object.values(lifecycle.candidates || {});
  const quarantined = lifecycleRecords.filter((record) => record.state === "quarantined")
    .map((record) => ({ candidate_id: record.candidate_id, provider: record.provider,
      reason_code: record.reason_code, retry_eligible: record.retry_eligible })).sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
  if (quarantined.length) warnings.push(`${quarantined.length} candidate(s) quarantined`);
  const groups = Object.values(context?.performance?.groups || {});
  if (context?.performanceError) warnings.push(`performance optimization disabled: ${context.performanceError}`);
  const eligibleGroups = groups.filter((group) => group.optimization_eligible === true);
  const ineligibleReasons = {};
  for (const group of groups) for (const reason of group.optimization_ineligible_reasons || []) ineligibleReasons[reason] = (ineligibleReasons[reason] || 0) + 1;
  // Empirical capability evidence (posterior) vs registry desk scores (prior). Read-only:
  // a calibrated inversion is a registry-review PROPOSAL — nothing here mutates routing.json.
  const capabilityRows = Object.values(context?.performance?.capabilities || {});
  const calibratedCapabilityRows = capabilityRows.filter((row) => row.calibrated === true);
  let capabilityInversions = [];
  try { capabilityInversions = capabilityPriorInversions({ snapshot: context?.performance, ledger }); }
  catch { capabilityInversions = []; }
  if (capabilityInversions.length) {
    warnings.push(`${capabilityInversions.length} calibrated capability inversion(s) vs registry priors — ` +
      `registry review suggested (pass rates are NOT difficulty/effort-adjusted; compare the underlying task mix before adjusting a prior): ${capabilityInversions.slice(0, 3).map((item) =>
        `${item.capability}: ${item.lower_prior_model} (prior ${item.lower_prior}, pass ${item.lower_prior_pass_rate}) ` +
        `outperforms ${item.higher_prior_model} (prior ${item.higher_prior}, pass ${item.higher_prior_pass_rate})`).join(" | ")}` +
      (capabilityInversions.length > 3 ? ` (…and ${capabilityInversions.length - 3} more)` : ""));
  }
  const telemetry = readTelemetry({ stateDir: dir });
  if (telemetry.errors.length) warnings.push(`run telemetry contains ${telemetry.errors.length} invalid row(s)`);
  const selectionEvent = latestWhere(telemetry.rows, (row) => row.event === "selection.completed");
  const lastReceipt = receipts.rows.at(-1) || null;
  const lastExecutionReceipt = latestWhere(receipts.rows, (row) => Boolean(row.requested_model));
  const lastPhaseExecution = latestWhere(telemetry.rows, (row) => row.event === "phase.execution.completed" || row.event === "phase.execution.failed");
  const phaseSwitches = telemetry.rows.filter((row) => row.event === "phase.execution.completed" && row.action === "switch" &&
    row.fallback !== true && row.planned_model && row.observed_model === row.planned_model);
  const estimatedPhaseSavings = phaseSwitches.reduce((sum, row) => sum + Number(row.net_savings_tokens || 0), 0);
  let outcomes = [];
  try { outcomes = readOutcomes({ stateDir: dir }); }
  catch (error) { warnings.push(`outcomes unavailable: ${error.message}`); }
  const latestOutcomes = latestOutcomesByReceipt(outcomes);
  const taskReceipts = receipts.rows.filter((row) => row.requested_model && row.task_id);
  const verifiedTaskReceipts = taskReceipts.filter((row) => ["passed", "failed"].includes(latestOutcomes.get(row.id)?.verification));
  const calibration = calibrationCapacity({ receipts: receipts.rows, policy });
  const pendingReviews = classifyPendingReviews({ receipts: receipts.rows, ledger, context });
  const retryableReviews = pendingReviews.filter((item) => item.current_status === "retryable");
  if (retryableReviews.length) warnings.push(`${retryableReviews.length} pending review(s) are retryable on recovered routes`);
  const quotaRecoveryResources = Object.entries(policy.quota_resources || {}).map(([resourceId, resource]) => {
    const observation = context?.store?.observations?.[resource.capacity_observation] || null;
    if (!observation || (observation.state !== "exhausted" && observation.source !== "machine:bounded-quota-recovery")) return null;
    return { resource_id: resourceId,
      status: observation.state === "exhausted" ? "waiting-retry" : "recovered-awaiting-passive-telemetry",
      observed_at: observation.observed_at || null,
      next_retry_at: observation.state === "exhausted" ? quotaRecoveryDeadline(observation, policy) : null,
      attempt_count: Number.isInteger(observation.recovery_attempt) ? observation.recovery_attempt : 0 };
  }).filter(Boolean).sort((left, right) => left.resource_id.localeCompare(right.resource_id));
  const discovered = [];
  for (const [key, value] of Object.entries(context?.store?.observations || {})) {
    if (!key.startsWith("candidate:")) continue;
    const fact = effectiveObservation(value, now);
    if (fact.fresh !== true || !["discovered", "available-unassessed", "evaluating", "shadow"].includes(fact.state)) continue;
    discovered.push({ candidate_id: fact.model_id || key.split(":").at(-1), provider: fact.provider || "unknown", state: fact.state });
  }
  discovered.sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
  if (discovered.length) warnings.push(`${discovered.length} discovered candidate observation(s) pending assessment`);
  const overall = requiredErrors.length ? "degraded" : warnings.length ? "attention" : "healthy";
  const report = {
    schema_version: 1, observed_at: now, overall,
    ledger: { path: path.resolve(ledgerPath), version: ledger.version, last_verified: ledger.last_verified },
    maintenance: { last_attempt_at: maintenanceRead.value?.last_attempt_at || null,
      last_success_at: maintenanceRead.value?.last_success_at || null, last_status: maintenanceRead.value?.last_status || "never",
      monitor_status: monitorDead ? "dead" : monitorRead.value?.status || "not-observed",
      monitor_pid: Number.isInteger(monitorRead.value?.pid) ? monitorRead.value.pid : null,
      monitor_last_cycle_at: monitorRead.value?.last_cycle_at || null,
      next_due_at: plan?.next_due_at || maintenanceRead.value?.next_due_at || null,
      next_due_reason: plan?.next_due_reason || maintenanceRead.value?.next_due_reason || "unknown", due_count: plan?.due_count ?? null },
    routes: { counts: routeCounts, entries: evaluations }, dispatch,
    last_selection: selectionEvent ? { at: selectionEvent.at, model: selectionEvent.selected_model || null,
      route: selectionEvent.route_id || null, role: selectionEvent.role || null, effort: selectionEvent.effort || null,
      basis: selectionEvent.selection_basis || "unknown", task_fit: selectionEvent.task_fit ?? null,
      evidence_confidence: selectionEvent.evidence_confidence ?? null,
      predicted_success: selectionEvent.predicted_success ?? null,
      expected_verified_tokens: selectionEvent.expected_verified_tokens ?? null,
      fallback_count: selectionEvent.fallback_count ?? null, warning_count: selectionEvent.warning_count ?? null } : null,
    last_dispatch: lastReceipt ? { at: lastReceipt.at || null, requested_model: lastReceipt.requested_model || null,
      observed_model: lastReceipt.observed_model || null, role: lastReceipt.role || null, effort: lastReceipt.effort || null,
      status: lastReceipt.status || "unknown", fallback: lastReceipt.fallback === true,
      reported_tokens: usageTokens(lastReceipt.usage), duration_ms: Number.isFinite(lastReceipt.duration_ms) ? lastReceipt.duration_ms : null,
      current_status: lastReceipt.status === "review-pending"
        ? pendingReviews.find((item) => item.receipt_id === lastReceipt.id)?.current_status || "unknown" : lastReceipt.status } : null,
    last_execution: lastExecutionReceipt ? { at: lastExecutionReceipt.at || null,
      requested_model: lastExecutionReceipt.requested_model || null, observed_model: lastExecutionReceipt.observed_model || null,
      role: lastExecutionReceipt.role || null, effort: lastExecutionReceipt.effort || null,
      status: lastExecutionReceipt.status || "unknown", fallback: lastExecutionReceipt.fallback === true,
      reported_tokens: usageTokens(lastExecutionReceipt.usage),
      duration_ms: Number.isFinite(lastExecutionReceipt.duration_ms) ? lastExecutionReceipt.duration_ms : null } : null,
    last_phase: lastPhaseExecution ? { at: lastPhaseExecution.at, task_id: lastPhaseExecution.task_id || null,
      phase_id: lastPhaseExecution.phase_id || null, action: lastPhaseExecution.action || null,
      planned_model: lastPhaseExecution.planned_model || null, requested_model: lastPhaseExecution.selected_model || null,
      observed_model: lastPhaseExecution.observed_model || null, receipt_id: lastPhaseExecution.receipt_id || null,
      status: lastPhaseExecution.status, reason_code: lastPhaseExecution.reason_code || null,
      estimated_net_tokens: lastPhaseExecution.net_savings_tokens ?? null } : null,
    task_evidence: { linked_receipt_count: taskReceipts.length, verified_receipt_count: verifiedTaskReceipts.length,
      verification_coverage: taskReceipts.length ? Number((verifiedTaskReceipts.length / taskReceipts.length).toFixed(4)) : null },
    pending_reviews: { total: pendingReviews.length, retryable: retryableReviews.length, entries: pendingReviews },
    quota_recovery: { enabled: policy.quota_recovery?.enabled === true,
      recovered: quotaRecoveryResources.filter((item) => item.status.startsWith("recovered")).length,
      waiting: quotaRecoveryResources.filter((item) => item.status === "waiting-retry").length,
      resources: quotaRecoveryResources },
    calibration,
    savings: { status: phaseSwitches.length ? "estimated-executed-plan" : "insufficient-counterfactual-evidence",
      estimated_phase_net_tokens: phaseSwitches.length ? estimatedPhaseSavings : null,
      phase_switch_count: phaseSwitches.length,
      note: phaseSwitches.length ? "Executed the planned model; conservative estimate, not a measured counterfactual."
        : "No qualified counterfactual exists yet; MODEL-OS does not claim savings." },
    lifecycle: { counts: stateCounts(lifecycleRecords), quarantined, discovered, rumor_watch_count: watch.rows.length },
    optimization: { mode: policy.phase_routing?.enabled ? "phase-enabled-evidence-gated" : "registry-prior",
      group_count: groups.length, eligible_group_count: eligibleGroups.length,
      ineligible_reasons: Object.fromEntries(Object.entries(ineligibleReasons).sort(([a], [b]) => a.localeCompare(b))) },
    capability_evidence: { tracked_pair_count: capabilityRows.length,
      calibrated_pair_count: calibratedCapabilityRows.length, inversions: capabilityInversions },
    telemetry: { event_count: telemetry.rows.length, invalid_count: telemetry.errors.length },
    errors: requiredErrors, warnings,
  };
  return { exit_code: requiredErrors.length ? 3 : warnings.length ? 2 : 0, report };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    if (!argv[index].startsWith("--")) throw new Error(`unexpected positional argument '${argv[index]}'`);
    const key = argv[index].slice(2); args[key] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return args;
}

function render(report) {
  const routes = Object.entries(report.routes?.counts || {}).map(([state, count]) => `${state}=${count}`).join(", ") || "none";
  const dispatch = report.dispatch || {};
  const selected = report.last_selection;
  const executed = report.last_execution;
  const latestDispatch = report.last_dispatch;
  const phase = report.last_phase;
  const savings = report.savings;
  const lines = [
    `MODEL-OS status: ${String(report.overall).toUpperCase()}`,
    `Last selection: ${selected ? `${selected.model || "blocked"}@${selected.effort || "unknown"} for ${selected.role || "unknown"} (${selected.basis})` : "none recorded"}`,
    `Last execution: ${executed ? `requested=${executed.requested_model || "none"}, observed=${executed.observed_model || "none"}, status=${executed.status}, tokens=${executed.reported_tokens ?? "unknown"}` : "none recorded"}`,
    `Latest dispatch event: ${latestDispatch ? `status=${latestDispatch.status}${latestDispatch.current_status && latestDispatch.current_status !== latestDispatch.status ? ` (current=${latestDispatch.current_status})` : ""}, requested=${latestDispatch.requested_model || "none"}, observed=${latestDispatch.observed_model || "none"}` : "none recorded"}`,
    `Last phase: ${phase ? `${phase.phase_id || "unknown"} ${phase.action || "unknown"}; planned=${phase.planned_model || "none"}, observed=${phase.observed_model || "none"}` : "none recorded"}`,
    `Savings evidence: ${savings?.status || "unknown"}${savings?.estimated_phase_net_tokens != null ? `; estimated phase net=${savings.estimated_phase_net_tokens} tokens` : "; no claim"}`,
    `Maintenance: last ${report.maintenance?.last_status || "unknown"}; monitor=${report.maintenance?.monitor_status || "unknown"}; next ${report.maintenance?.next_due_at || "unknown"} (${report.maintenance?.next_due_reason || "unknown"})`,
    `Routes: ${routes}`,
    `Dispatch: recent=${dispatch.recent_count || 0}, completed=${dispatch.completed || 0}, blocked=${dispatch.blocked || 0}, identity-unverified=${dispatch.identity_unverified || 0}, median=${dispatch.median_duration_ms ?? "unknown"}ms`,
    `Candidates: discovered=${report.lifecycle?.discovered?.length || 0}, quarantined=${report.lifecycle?.quarantined?.length || 0}, rumors-watch-only=${report.lifecycle?.rumor_watch_count || 0}`,
    `Task evidence: verified=${report.task_evidence?.verified_receipt_count || 0}/${report.task_evidence?.linked_receipt_count || 0} linked receipts; calibration slots=${report.calibration?.available_slots || 0}`,
    `Pending reviews: total=${report.pending_reviews?.total || 0}, retryable=${report.pending_reviews?.retryable || 0}`,
    `Quota recovery: recovered=${report.quota_recovery?.recovered || 0}, waiting=${report.quota_recovery?.waiting || 0}`,
    `Optimization: eligible=${report.optimization?.eligible_group_count || 0}/${report.optimization?.group_count || 0} groups; ${report.optimization?.mode || "unknown"}`,
    `Capability evidence: calibrated=${report.capability_evidence?.calibrated_pair_count || 0}/${report.capability_evidence?.tracked_pair_count || 0} model|capability pairs; inversions=${report.capability_evidence?.inversions?.length || 0}`,
  ];
  for (const warning of report.warnings || []) lines.push(`WARN: ${warning}`);
  for (const error of report.errors || []) lines.push(`ERROR: ${error}`);
  return lines.join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = collectStatus({ ledgerPath: args.ledger || findLedger(), policyPath: args.policy || null,
    stateDir: args["state-dir"] || null, now: args.at || new Date().toISOString(),
    receiptLimit: args.limit == null ? 100 : Number(args.limit) });
  process.stdout.write(args.json === true ? `${JSON.stringify(result.report, null, 2)}\n` : `${render(result.report)}\n`);
  return result.exit_code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((error) => { process.stderr.write(`MODEL-OS status error: ${error.message}\n`); process.exitCode = 3; });
}
