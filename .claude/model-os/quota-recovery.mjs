#!/usr/bin/env node
// Bounded recovery for passive quota sources. A tiny subscription-only probe is
// allowed only after explicit exhaustion reaches its recovery deadline. Success
// proves capacity exists without pretending to know the provider's utilization.

import { getObservation, readObservationStore, writeObservations } from "./state-store.mjs";
import { probeEntitlement } from "./probe-entitlement.mjs";
import { appendTelemetryEvent, telemetryEnabled } from "./telemetry.mjs";

const COST_ORDER = { low: 0, mid: 1, high: 2, top: 3 };

function positive(value, fallback) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
}

function atMs(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function quotaRecoveryDelaySeconds(observation, policy) {
  const config = policy?.quota_recovery || {};
  const initial = positive(config.initial_retry_seconds, 900);
  const maximum = positive(config.max_retry_seconds, 3600);
  const multiplier = Math.max(1, positive(config.backoff_multiplier, 2));
  const attempt = Number.isInteger(observation?.recovery_attempt) && observation.recovery_attempt >= 0
    ? observation.recovery_attempt : 0;
  return Math.min(maximum, Math.round(initial * (multiplier ** attempt)));
}

export function quotaRecoveryDeadline(observation, policy) {
  if (!observation || observation.state !== "exhausted") return null;
  const observed = atMs(observation.observed_at);
  if (observed == null) return null;
  const config = policy?.quota_recovery || {};
  const reset = atMs(observation.resets_at || observation.reset_at);
  const resetDelay = positive(config.reset_delay_seconds, policy?.maintenance?.reset_delay_seconds || 30);
  const maxResetHorizon = positive(config.max_reset_horizon_seconds, 31 * 86400);
  if (reset != null && reset > observed && reset - observed <= maxResetHorizon * 1000) {
    return new Date(reset + resetDelay * 1000).toISOString();
  }
  return new Date(observed + quotaRecoveryDelaySeconds(observation, policy) * 1000).toISOString();
}

export function dueQuotaRecoveries({ ledger, policy, store, now = new Date().toISOString() } = {}) {
  if (policy?.quota_recovery?.enabled !== true) return [];
  const nowMs = atMs(now);
  if (nowMs == null) throw new Error("quota recovery now must be a valid timestamp");
  const active = new Set();
  const routable = new Set(policy?.lifecycle?.routable_states || ["qualified"]);
  for (const model of ledger?.models || []) {
    if ((model.status || "current") !== "current" || !routable.has(model.lifecycle_state)) continue;
    for (const route of model.access_routes || []) {
    for (const resourceId of route.quota_resources || []) active.add(resourceId);
    }
  }
  const adapters = new Set(policy.quota_recovery.passive_adapters || ["claude-statusline-rate-limits"]);
  const due = [];
  for (const resourceId of [...active].sort()) {
    const resource = policy?.quota_resources?.[resourceId];
    if (!resource || !adapters.has(resource.adapter)) continue;
    const observation = store?.observations?.[resource.capacity_observation] || null;
    const deadline = quotaRecoveryDeadline(observation, policy);
    if (deadline && atMs(deadline) <= nowMs) due.push({ resource_id: resourceId, resource, observation, deadline });
  }
  return due;
}

function routeCandidates({ ledger, context, resourceId, now }) {
  const candidates = [];
  const routable = new Set(context?.policy?.lifecycle?.routable_states || ["qualified"]);
  const allowedBilling = new Set(context?.policy?.billing?.autonomous_allowed_modes || ["subscription_included"]);
  const forbiddenBilling = new Set(context?.policy?.billing?.hard_forbidden_modes || ["api_metered", "subscription_credits"]);
  for (const model of ledger?.models || []) {
    if ((model.status || "current") !== "current" || !routable.has(model.lifecycle_state)) continue;
    for (const route of model.access_routes || []) {
      if (!(route.quota_resources || []).includes(resourceId)) continue;
      if (forbiddenBilling.has(route.billing_mode) || !allowedBilling.has(route.billing_mode)) continue;
      const entitlement = getObservation(context?.store, route.entitlement_observation, now);
      if (["not_entitled", "metered_only"].includes(entitlement.state)) continue;
      const guard = getObservation(context?.store, route.spend_guard_observation, now);
      if (!(guard.state === "disabled" && guard.confidence === "high" &&
          typeof guard.source === "string" && guard.source.startsWith("machine:"))) continue;
      candidates.push({ model, route, entitlement,
        entitlementRank: entitlement.state === "entitled" ? 0 : entitlement.state === "entitled_but_exhausted" ? 1 : 2 });
    }
  }
  return candidates.sort((left, right) => left.entitlementRank - right.entitlementRank ||
    (COST_ORDER[left.model.cost_class] ?? 9) - (COST_ORDER[right.model.cost_class] ?? 9) ||
    left.model.id.localeCompare(right.model.id));
}

function recoveryObservation({ state, resource, previous, policy, now, attempt, reason }) {
  const adapterTtl = policy?.observation_ttl?.quota_by_adapter?.[resource.adapter] || policy?.observation_ttl?.quota || 900;
  return { state, observed_at: now, source: "machine:bounded-quota-recovery", confidence: "high",
    ttl: state === "exhausted" ? quotaRecoveryDelaySeconds({ recovery_attempt: attempt }, policy) : adapterTtl,
    provider: resource.provider, reason, recovery_attempt: attempt,
    previous_observed_at: previous?.observed_at || null };
}

export function probeQuotaRecovery({ resourceId, ledger, policy, context, stateDir = null,
  now = new Date().toISOString(), execute = null, probe = probeEntitlement } = {}) {
  const resource = policy?.quota_resources?.[resourceId];
  if (!resource) return { status: "refused", resource_id: resourceId, reason: "unknown quota resource" };
  const previous = context?.store?.observations?.[resource.capacity_observation] || null;
  if (previous?.state !== "exhausted") return { status: "not-due", resource_id: resourceId, reason: "resource is not exhausted" };
  const candidate = routeCandidates({ ledger, context, resourceId, now })[0];
  if (!candidate) return { status: "refused", resource_id: resourceId, reason: "no route consumes the resource" };
  const result = probe({ event: "entitlement-change", routeId: candidate.route.id, ledger, context, stateDir, now,
    ...(execute ? { execute } : {}) });
  if (result?.status !== "recorded") return { status: "refused", resource_id: resourceId,
    route: candidate.route.id, reason: result?.reason || "bounded recovery probe was not recorded" };
  if (result.classification === "unknown" && candidate.entitlement.state === "entitled") {
    const previousEntitlement = context.store?.observations?.[candidate.route.entitlement_observation];
    if (previousEntitlement) writeObservations({ stateDir,
      observations: { [candidate.route.entitlement_observation]: previousEntitlement } });
  }
  const nextAttempt = (Number.isInteger(previous.recovery_attempt) ? previous.recovery_attempt : 0) + 1;
  if (result.classification === "entitled") {
    const current = readObservationStore({ stateDir });
    const recovered = {};
    for (const id of candidate.route.quota_resources || []) {
      const linked = policy.quota_resources?.[id];
      const old = linked ? current.observations?.[linked.capacity_observation] : null;
      if (linked && old?.state === "exhausted") recovered[linked.capacity_observation] = recoveryObservation({
        state: "unknown", resource: linked, previous: old, policy, now, attempt: 0,
        reason: "bounded subscription probe succeeded; exact utilization awaits passive telemetry",
      });
    }
    if (!Object.keys(recovered).length) recovered[resource.capacity_observation] = recoveryObservation({
      state: "unknown", resource, previous, policy, now, attempt: 0,
      reason: "bounded subscription probe succeeded; exact utilization awaits passive telemetry",
    });
    writeObservations({ stateDir, observations: recovered });
    return { status: "recovered", resource_id: resourceId, route: candidate.route.id,
      model: candidate.model.id, recovered_resources: Object.keys(recovered) };
  }
  if (result.classification === "entitled_but_exhausted") {
    const observation = recoveryObservation({ state: "exhausted", resource, previous, policy, now,
      attempt: nextAttempt, reason: "bounded subscription probe still reports exhausted capacity" });
    writeObservations({ stateDir, observations: { [resource.capacity_observation]: observation } });
    return { status: "still-exhausted", resource_id: resourceId, route: candidate.route.id,
      model: candidate.model.id, next_retry_at: quotaRecoveryDeadline(observation, policy) };
  }
  const observation = recoveryObservation({ state: "exhausted", resource, previous, policy, now,
    attempt: nextAttempt, reason: `bounded recovery probe inconclusive (${result.classification || "unknown"})` });
  writeObservations({ stateDir, observations: { [resource.capacity_observation]: observation } });
  return { status: "inconclusive", resource_id: resourceId, route: candidate.route.id,
    model: candidate.model.id, next_retry_at: quotaRecoveryDeadline(observation, policy) };
}

export function runQuotaRecoveryCycle({ ledger, policy, context = null, stateDir = null,
  now = new Date().toISOString(), execute = null, probe = probeEntitlement } = {}) {
  const store = readObservationStore({ stateDir });
  if (store.errors.length) throw new Error(store.errors.join("; "));
  const due = dueQuotaRecoveries({ ledger, policy, store, now });
  const limit = Math.max(0, Math.min(10, Number(policy?.quota_recovery?.max_probes_per_cycle ?? 1)));
  const results = [];
  let currentContext = { ...(context || {}), policy, store };
  for (const item of due.slice(0, limit)) {
    const result = probeQuotaRecovery({ resourceId: item.resource_id, ledger, policy, context: currentContext,
      stateDir, now, execute, probe });
    results.push(result);
    if (telemetryEnabled()) try {
      appendTelemetryEvent({ run_id: `quota-recovery:${item.resource_id}`, at: now, component: "quota",
        event: result.status === "recovered" ? "quota.recovery.detected" : "quota.recovery.probed",
        status: "completed", resource_id: item.resource_id, route_id: result.route || null,
        selected_model: result.model || null, reason_code: result.status,
        attempt_count: Number(item.observation?.recovery_attempt || 0) + 1,
        retry_eligible: result.status === "recovered" },
      { stateDir, maxEntries: policy?.retention?.run_telemetry_max_entries || 2000 });
    } catch {}
    currentContext = { ...currentContext, store: readObservationStore({ stateDir }) };
  }
  return { due_count: due.length, attempted_count: results.length, results };
}
