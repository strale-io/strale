// Pure economics gate for explicit phase boundaries. It never infers phases,
// launches a model, or expands the selector-qualified candidate set.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendTelemetryEvent, telemetryEnabled, telemetryReason } from "./telemetry.mjs";
import { performanceFreshness } from "./performance.mjs";

function groupFor(snapshot, candidate, phaseId, benchmarkVersion = null, decisionRole = null) {
  const base = [candidate.model, candidate.role || decisionRole, candidate.effort];
  const keys = benchmarkVersion ? [
    [...base, phaseId, benchmarkVersion].join("|"),
  ] : [[...base, phaseId].join("|")];
  return keys.map((key) => snapshot?.groups?.[key]).find(Boolean) || null;
}

function economics(group) {
  if (!group?.optimization_eligible || !Number.isFinite(group.expected_verified_tokens)) return null;
  const margin = Number(group.confidence_margin_tokens || 0);
  if (!Number.isFinite(margin) || margin < 0) return null;
  return { point: group.expected_verified_tokens,
    lower: Math.max(0, group.expected_verified_tokens - margin), upper: group.expected_verified_tokens + margin };
}

function sameCandidate(left, right) { return left?.model === right?.model && left?.effort === right?.effort && left?.route === right?.route; }

export function planPhaseRoute({ phaseId, decision, incumbent, performance, workUnits = 1,
  transitionOverheadTokens = 0, switchesSoFar = 0, benchmarkVersion = null, policy = {},
  now = new Date().toISOString() } = {}) {
  if (typeof phaseId !== "string" || !phaseId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(phaseId)) throw new Error("phaseId is invalid");
  const config = policy.phase_routing || policy;
  const selected = decision?.selected || (decision?.model ? decision : null);
  const stay = (reason, extra = {}) => ({ phase_id: phaseId, action: "stay", reason, selected: incumbent || selected,
    switch_count: switchesSoFar, gross_savings_tokens: 0, net_savings_tokens: 0, ...extra });
  const blocked = (reason) => ({ phase_id: phaseId, action: "blocked", reason, selected: null,
    switch_count: switchesSoFar, gross_savings_tokens: 0, net_savings_tokens: 0 });
  if (config.enabled !== true) return stay("phase-routing-disabled");
  const performanceState = performanceFreshness(performance, { now,
    maxAgeSeconds: policy?.selection?.empirical_optimization?.evidence_ttl_seconds || 30 * 86400 });
  if (!performanceState.fresh) return stay(`performance-${performanceState.reason}`);
  if (!selected || !incumbent) return stay("missing-selector-decision");
  const authoritative = [decision.selected, ...(decision.fallbacks || [])].filter(Boolean);
  if (decision.status && decision.status !== "routable") return blocked("selector-decision-not-routable");
  if (!authoritative.some((candidate) => sameCandidate(candidate, selected))) return blocked("candidate-outside-selector-order");
  if (!authoritative.some((candidate) => sameCandidate(candidate, incumbent))) return blocked("incumbent-outside-selector-order");
  if (sameCandidate(selected, incumbent)) return stay("already-selected");
  if (!Number.isInteger(workUnits) || workUnits < 1) return stay("invalid-work-units");
  if (!Number.isFinite(transitionOverheadTokens) || transitionOverheadTokens < 0) return stay("invalid-overhead");
  const maxSwitches = Number.isInteger(config.max_switches) ? config.max_switches : 2;
  if (switchesSoFar >= maxSwitches) return stay("max-switches-reached");
  const incumbentGroup = groupFor(performance, incumbent, phaseId, benchmarkVersion, decision.role);
  const candidateGroup = groupFor(performance, selected, phaseId, benchmarkVersion, decision.role);
  const incumbentEconomics = economics(incumbentGroup);
  const candidateEconomics = economics(candidateGroup);
  if (!incumbentEconomics || !candidateEconomics) return stay("evidence-not-eligible");
  const gross = Math.max(0, (incumbentEconomics.lower - candidateEconomics.upper) * workUnits);
  const hysteresis = Number(config.hysteresis_tokens || 0);
  const required = transitionOverheadTokens + (Number.isFinite(hysteresis) && hysteresis >= 0 ? hysteresis : 0);
  const net = Math.max(0, gross - required);
  if (!(gross > required)) return stay(gross === required ? "savings-tie" : "savings-below-overhead", {
    gross_savings_tokens: gross, overhead_tokens: transitionOverheadTokens, hysteresis_tokens: required - transitionOverheadTokens });
  return { phase_id: phaseId, action: "switch", reason: "net-savings-clear", selected,
    switch_count: switchesSoFar + 1, gross_savings_tokens: gross, net_savings_tokens: net,
    overhead_tokens: transitionOverheadTokens, hysteresis_tokens: required - transitionOverheadTokens };
}

export function planPhaseRoutes({ phases = [], policy = {}, performance = null, benchmarkVersion = null,
  now = new Date().toISOString() } = {}) {
  if (!Array.isArray(phases)) throw new Error("phases must be an array");
  const ids = new Set(); let switches = 0; const plans = [];
  for (const phase of phases) {
    if (ids.has(phase.phaseId)) throw new Error(`duplicate phase '${phase.phaseId}'`);
    ids.add(phase.phaseId);
    const plan = planPhaseRoute({ ...phase, policy, performance, benchmarkVersion, switchesSoFar: switches, now });
    if (plan.action === "switch") switches = plan.switch_count;
    plans.push(plan);
  }
  return { schema_version: 1, switch_count: switches, plans };
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
  const policy = args.policy ? JSON.parse(readFileSync(path.resolve(args.policy), "utf8")) : input.policy || {};
  const performance = args.performance ? JSON.parse(readFileSync(path.resolve(args.performance), "utf8")) : input.performance || null;
  const result = planPhaseRoutes({ ...input, policy, performance });
  if (telemetryEnabled() && args["no-telemetry"] !== true) {
    const runId = randomUUID();
    for (const plan of result.plans) {
      const event = plan.action === "blocked"
        ? { run_id: runId, at: new Date().toISOString(), component: "phase", event: "phase.plan.rejected",
          status: "rejected", phase_id: plan.phase_id, reason_code: plan.reason }
        : { run_id: runId, at: new Date().toISOString(), component: "phase", event: "phase.plan.completed",
          status: plan.action, phase_id: plan.phase_id, selected_model: plan.selected?.model || null,
          reason_code: plan.reason, gross_savings_tokens: plan.gross_savings_tokens || 0,
          net_savings_tokens: plan.net_savings_tokens || 0, overhead_tokens: plan.overhead_tokens || 0,
          hysteresis_tokens: plan.hysteresis_tokens || 0, switch_count: plan.switch_count || 0 };
      try { appendTelemetryEvent(event, { stateDir: args["state-dir"],
        maxEntries: policy?.retention?.run_telemetry_max_entries || 2000 }); } catch {}
    }
  }
  process.stdout.write(`${JSON.stringify(result, null, args.json === true ? 2 : 0)}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    if (telemetryEnabled()) try { appendTelemetryEvent({ run_id: randomUUID(), at: new Date().toISOString(), component: "phase",
      event: "phase.plan.rejected", status: "rejected", reason_code: telemetryReason(error, "phase-plan-failed") }, { maxEntries: 2000 }); } catch {}
    process.stderr.write(`MODEL-OS phase routing error: ${error.message}\n`); process.exitCode = 3;
  });
}
