#!/usr/bin/env node
// Off-hot-path route maintenance. SessionStart may launch this process detached;
// selection itself remains a local, deterministic calculation over last-known-good
// registry and observation data.

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { refreshRouteObservations } from "./quota.mjs";
import { runDefaultDiscovery } from "./discover.mjs";
import { refreshPerformanceSnapshot } from "./performance.mjs";
import { findLedger } from "./select.mjs";
import { activeQuotaResourceIds, entitlementRecheckDue, findPolicy, loadRouteContext } from "./route-state.mjs";
import { validateLedgerPolicyCompatibility } from "./schema.mjs";
import { acquireWriteLock, atomicWriteFile, readObservationStore, releaseWriteLock, resolveStateDir } from "./state-store.mjs";
import { planMaintenance } from "./freshness.mjs";
import { quotaRecoveryDeadline, quotaRecoveryDelaySeconds, runQuotaRecoveryCycle } from "./quota-recovery.mjs";
import { appendTelemetryEvent, telemetryEnabled, telemetryReason } from "./telemetry.mjs";

function parseArgs(argv) {
  const out = { ledger: findLedger(), policy: null, stateDir: null, json: false, catalog: false, plan: false, ifDue: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--json") out.json = true;
    else if (arg === "--catalog") out.catalog = true;
    else if (arg === "--plan") out.plan = true;
    else if (arg === "--if-due") out.ifDue = true;
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

export function maintenanceInputs({ ledger, policy, store }) {
  const observations = {};
  const rechecks = {};
  const deadlines = {};
  const add = (key, alias = key, ttlCap = null) => {
    if (typeof key !== "string" || !key) return;
    const value = store?.observations?.[key] || null;
    observations[alias] = value && Number.isFinite(ttlCap) && ttlCap > 0 && Number(value.ttl) > ttlCap
      ? { ...value, ttl: ttlCap } : value;
  };
  const routable = new Set(policy?.lifecycle?.routable_states || ["qualified"]);
  for (const model of ledger.models || []) {
    if ((model.status || "current") !== "current" || !routable.has(model.lifecycle_state)) continue;
    for (const route of model.access_routes || []) {
      add(route.spend_guard_observation, route.spend_guard_observation, policy?.observation_ttl?.spend_guard);
      if (route.entitlement_observation && route.entitlement_recheck_at) {
        const observedAt = Date.parse(store?.observations?.[route.entitlement_observation]?.observed_at);
        const recheckAt = Date.parse(route.entitlement_recheck_at);
        if (Number.isFinite(recheckAt) && (!Number.isFinite(observedAt) || observedAt < recheckAt)) {
          deadlines[`entitlement-recheck:${route.id}`] = { at: route.entitlement_recheck_at, reason: "entitlement-recheck" };
        }
      }
    }
  }
  for (const resourceId of activeQuotaResourceIds(ledger, policy)) {
    const resource = policy?.quota_resources?.[resourceId];
    const ttl = policy?.observation_ttl?.quota_by_adapter?.[resource?.adapter] || policy?.observation_ttl?.quota;
    const value = store?.observations?.[resource?.capacity_observation] || null;
    const passive = new Set(policy?.quota_recovery?.passive_adapters || []);
    let recoveryCap = ttl;
    if (policy?.quota_recovery?.enabled === true && value?.state === "exhausted" && passive.has(resource?.adapter)) {
      const deadline = Date.parse(quotaRecoveryDeadline(value, policy));
      const observed = Date.parse(value.observed_at);
      recoveryCap = Number.isFinite(deadline) && Number.isFinite(observed)
        ? Math.max(1, Math.ceil((deadline - observed) / 1000))
        : quotaRecoveryDelaySeconds(value, policy);
    }
    add(resource?.capacity_observation, resource?.capacity_observation, Math.min(ttl, recoveryCap));
  }
  for (const source of policy?.discovery?.sources || []) add(`discovery-source:${source.id}`, `discovery-source:${source.id}`,
    policy?.discovery?.source_ttl?.[source.kind]);
  for (const source of policy?.discovery?.terms_sources || []) add(`terms:${source.id}`, `terms:${source.id}`,
    policy?.discovery?.source_ttl?.terms);
  for (const item of policy?.discovery?.cli_requirements || []) add(`cli:${item.id}`, `cli:${item.id}`,
    policy?.discovery?.source_ttl?.cli_compatibility);
  return { observations, rechecks, deadlines };
}

export function dueEntitlementRechecks({ ledger, policy, store, now = new Date().toISOString() }) {
  const routes = [];
  const routable = new Set(policy?.lifecycle?.routable_states || ["qualified"]);
  for (const model of ledger.models || []) {
    if ((model.status || "current") !== "current" || !routable.has(model.lifecycle_state)) continue;
    for (const route of model.access_routes || []) {
    const observation = store?.observations?.[route.entitlement_observation] || null;
    if (entitlementRecheckDue(route, observation, now)) routes.push(route.id);
    }
  }
  return routes.sort();
}

export function buildMaintenancePlan({ ledger, policy, stateDir, now = new Date().toISOString() }) {
  const store = readObservationStore({ stateDir });
  if (store.errors.length) throw new Error(store.errors.join("; "));
  const { observations, rechecks, deadlines } = maintenanceInputs({ ledger, policy, store });
  return planMaintenance({ observations, rechecks, deadlines, now,
    leadSeconds: policy?.maintenance?.freshness_lead_seconds || 0,
    resetDelaySeconds: policy?.maintenance?.reset_delay_seconds || 30 });
}

function readMaintenanceSummary(stateDir) {
  try { return JSON.parse(readFileSync(path.join(stateDir, "maintenance.json"), "utf8")); }
  catch { return null; }
}

function writeMaintenanceSummary(stateDir, summary) {
  atomicWriteFile(path.join(stateDir, "maintenance.json"), `${JSON.stringify({ schema_version: 1, ...summary }, null, 2)}\n`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options.ledger) throw new Error("route maintenance could not find routing.json");
  const policyPath = options.policy || findPolicy(options.ledger);
  if (!policyPath) throw new Error("route maintenance could not find policy.json");
  const ledger = JSON.parse(readFileSync(options.ledger, "utf8"));
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  validateLedgerPolicyCompatibility(ledger, policy);
  const stateDir = resolveStateDir(options.stateDir);
  const beforePlan = buildMaintenancePlan({ ledger, policy, stateDir });
  if (options.plan) {
    process.stdout.write(options.json ? `${JSON.stringify(beforePlan, null, 2)}\n` :
      `maintenance ${beforePlan.due ? "due" : "fresh"}; next ${beforePlan.next_due_at || "unknown"} (${beforePlan.next_due_reason})\n`);
    return beforePlan;
  }
  const runId = randomUUID();
  const startedAt = Date.now();
  const maxTelemetry = policy?.retention?.run_telemetry_max_entries || 2000;
  if (telemetryEnabled()) {
    try { appendTelemetryEvent({ run_id: runId, at: new Date().toISOString(), component: "maintenance",
      event: "maintenance.started", status: "started", reason_code: options.ifDue ? "scheduled-if-due" : "explicit-run" },
    { stateDir, maxEntries: maxTelemetry }); } catch {}
  }
  if (options.ifDue && !beforePlan.due) {
    const result = { status: "skipped", reason: "no-work-due", plan: beforePlan };
    if (telemetryEnabled()) try { appendTelemetryEvent({ run_id: runId, at: new Date().toISOString(), component: "maintenance",
      event: "maintenance.completed", status: "completed", duration_ms: Date.now() - startedAt,
      reason_code: "no-work-due", counts: { due: 0 } }, { stateDir, maxEntries: maxTelemetry }); } catch {}
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : "route maintenance skipped (no work due)\n");
    return result;
  }
  let lock = null;
  try {
    lock = acquireWriteLock(stateDir, { lockName: "maintenance.lock", maxAttempts: 1, waitMs: 0 });
    const routes = await refreshRouteObservations({
      ledger,
      ledgerPath: options.ledger,
      policyPath,
      stateDir,
      // Routine maintenance is zero-generation. Unknown entitlement is safely
      // attemptable after the spend guard is current; bounded probes remain
      // explicit new-model/entitlement-change/ttl-expiry events.
      allowEntitlementProbes: false,
    });
    const recovery = runQuotaRecoveryCycle({ ledger, policy, stateDir });
    const recheckRouteIds = dueEntitlementRechecks({ ledger, policy, store: readObservationStore({ stateDir }) });
    const recheckProbes = [];
    if (recheckRouteIds.length) {
      const { probeEntitlement } = await import("./probe-entitlement.mjs");
      let context = loadRouteContext({ ledgerPath: options.ledger, policyPath, stateDir });
      for (const routeId of recheckRouteIds) {
        try {
          const probe = probeEntitlement({ event: "entitlement-change", routeId, ledger, context, stateDir });
          recheckProbes.push(probe);
          if (probe?.status === "recorded") context = loadRouteContext({ ledgerPath: options.ledger, policyPath, stateDir });
        } catch (error) {
          recheckProbes.push({ status: "refused", route: routeId, reason_code: telemetryReason(error, "entitlement-recheck-failed") });
        }
      }
    }
    const catalog = options.catalog ? await runDefaultDiscovery({
      ledgerPath: options.ledger,
      policyPath,
      stateDir,
      environment: "local",
      respectFreshness: true,
    }) : null;
    const minimumSamples = policy?.selection?.empirical_optimization?.minimum_verified_samples || 10;
    const performance = refreshPerformanceSnapshot({ stateDir, minimumSamples });
    const afterPlan = buildMaintenancePlan({ ledger, policy, stateDir });
    const counts = { routes: routes.routes.length, performance_groups: Object.keys(performance.groups).length,
      candidates: catalog?.candidate_count || 0, entitlement_rechecks: recheckProbes.length,
      quota_recovery_attempts: recovery.attempted_count, quota_recoveries: recovery.results.filter((item) => item.status === "recovered").length,
      due: afterPlan.due_count };
    const result = { ...routes, quota_recovery: recovery, recheck_probes: recheckProbes, catalog, performance, plan: afterPlan };
    writeMaintenanceSummary(stateDir, {
      last_attempt_at: new Date(startedAt).toISOString(), last_success_at: new Date().toISOString(), last_status: "completed",
      duration_ms: Date.now() - startedAt, next_due_at: afterPlan.next_due_at, next_due_reason: afterPlan.next_due_reason, counts });
    if (telemetryEnabled()) try { appendTelemetryEvent({ run_id: runId, at: new Date().toISOString(), component: "maintenance",
      event: "maintenance.completed", status: "completed", duration_ms: Date.now() - startedAt,
      reason_code: "maintenance-complete", counts }, { stateDir, maxEntries: maxTelemetry }); } catch {}
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` :
      `route maintenance complete (${routes.routes.length} routes${catalog ? `; catalogue ${catalog.findings}` : ""}; performance ${Object.keys(performance.groups).length} groups)\n`);
    return result;
  } catch (error) {
    const previous = readMaintenanceSummary(stateDir);
    const reasonCode = telemetryReason(error, "maintenance-failed");
    try { writeMaintenanceSummary(stateDir, { last_attempt_at: new Date(startedAt).toISOString(),
      last_success_at: previous?.last_success_at || null, last_status: "failed", duration_ms: Date.now() - startedAt,
      next_due_at: beforePlan.next_due_at, next_due_reason: beforePlan.next_due_reason,
      reason_code: reasonCode, counts: previous?.counts || {} }); } catch {}
    if (telemetryEnabled()) try { appendTelemetryEvent({ run_id: runId, at: new Date().toISOString(), component: "maintenance",
      event: "maintenance.failed", status: "failed", duration_ms: Date.now() - startedAt,
      reason_code: reasonCode }, { stateDir, maxEntries: maxTelemetry }); } catch {}
    throw error;
  } finally { releaseWriteLock(lock); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`MODEL-OS route maintenance failed: ${String(error?.message || error).replace(/[\r\n]+/g, " ")}\n`);
    process.exitCode = 3;
  });
}
