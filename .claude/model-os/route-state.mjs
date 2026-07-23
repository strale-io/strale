#!/usr/bin/env node
// Route-level availability evaluation for MODEL-OS v2. A route-aware model is
// usable only when its dated observations and ratified policy all allow it.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getObservation, readObservationStore } from "./state-store.mjs";
import { performanceFreshness, readPerformanceSnapshot } from "./performance.mjs";
import { readLifecycle } from "./lifecycle-state.mjs";
import { evaluateQuotaCapacity } from "./quota-lib.mjs";
import { BILLING_MODES, SURFACES, ZERO_SPEND_BILLING_MODES,
  validateLedgerPolicyCompatibility, validatePolicyCompatibility } from "./schema.mjs";

export const ZERO_SPEND_BILLING = ZERO_SPEND_BILLING_MODES;

export function findPolicy(ledgerPath = null) {
  if (process.env.MODEL_OS_POLICY) return path.resolve(process.env.MODEL_OS_POLICY);
  if (ledgerPath && existsSync(ledgerPath)) {
    try {
      const declared = JSON.parse(readFileSync(ledgerPath, "utf8")).policy_file;
      if (typeof declared === "string" && declared) return path.resolve(path.dirname(ledgerPath), declared);
    } catch { /* the caller that owns the ledger reports parse errors */ }
  }
  const candidates = [
    ledgerPath && path.join(path.dirname(ledgerPath), "policy.json"),
    path.join(path.dirname(fileURLToPath(import.meta.url)), "policy.json"),
  ].filter(Boolean).map((p) => path.resolve(p));
  return candidates.find((p) => existsSync(p)) || null;
}

export function readPolicy(policyPath) {
  if (!policyPath) return null;
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  validatePolicyCompatibility(policy);
  return policy;
}

export function loadRouteContext({ ledgerPath = null, policyPath = null, stateDir = null, now = null } = {}) {
  const resolvedPolicy = policyPath || findPolicy(ledgerPath);
  const policy = readPolicy(resolvedPolicy);
  if (ledgerPath) validateLedgerPolicyCompatibility(JSON.parse(readFileSync(ledgerPath, "utf8")), policy);
  let performance = null;
  let performanceError = null;
  try {
    performance = readPerformanceSnapshot({ stateDir });
    if (performance) {
      const freshness = performanceFreshness(performance, { now: now || new Date().toISOString(),
        maxAgeSeconds: policy?.selection?.empirical_optimization?.evidence_ttl_seconds || 30 * 86400 });
      if (!freshness.fresh) { performanceError = `performance evidence ${freshness.reason}`; performance = null; }
    }
  }
  catch (error) { performanceError = error.message; }
  const lifecycle = readLifecycle({ stateDir });
  return {
    policy,
    policyPath: resolvedPolicy,
    store: readObservationStore({ stateDir }),
    performance,
    performanceError,
    lifecycle,
    stateDir,
    now: now || new Date().toISOString(),
  };
}

export function activeQuotaResourceIds(ledger, policy) {
  const routable = new Set(policy?.lifecycle?.routable_states || ["qualified"]);
  const ids = new Set();
  for (const model of ledger?.models || []) {
    if ((model.status || "current") !== "current" || !routable.has(model.lifecycle_state)) continue;
    for (const route of model.access_routes || []) {
      for (const resourceId of route.quota_resources || []) {
        if (policy?.quota_resources?.[resourceId]) ids.add(resourceId);
      }
    }
  }
  return ids;
}

export function entitlementRecheckDue(route, observation, now = new Date().toISOString()) {
  const recheckAt = Date.parse(route?.entitlement_recheck_at);
  const nowMs = Date.parse(now);
  const observedAt = Date.parse(observation?.observed_at);
  return Number.isFinite(recheckAt) && Number.isFinite(nowMs) && nowMs >= recheckAt &&
    Number.isFinite(observedAt) && observedAt < recheckAt;
}

function authorizationAllows(route, model, policy, request) {
  const at = Date.parse(request.now || new Date().toISOString());
  for (const auth of policy?.billing?.spend_authorizations || []) {
    if (auth.status !== "approved") continue;
    if (!Number.isFinite(Date.parse(auth.expires_at)) || Date.parse(auth.expires_at) <= at) continue;
    if (auth.provider && auth.provider !== route.provider) continue;
    if (Array.isArray(auth.allowed_routes) && !auth.allowed_routes.includes(route.id)) continue;
    if (Array.isArray(auth.allowed_models) && !auth.allowed_models.includes(model.id)) continue;
    if (Array.isArray(auth.allowed_task_classes) && !auth.allowed_task_classes.includes(request.taskClass)) continue;
    if (!Number.isFinite(auth.max_spend) || auth.max_spend <= 0) continue;
    return true;
  }
  return false;
}

export function billingAllowed(route, model, policy, request = {}, effectiveMode = route.billing_mode) {
  const allowed = new Set(policy?.billing?.autonomous_allowed_modes || []);
  const hardForbidden = new Set(policy?.billing?.hard_forbidden_modes || []);
  if (hardForbidden.has(effectiveMode)) {
    return { allowed: false, authorization: null, effective_mode: effectiveMode, hard_forbidden: true };
  }
  if (ZERO_SPEND_BILLING.has(effectiveMode) && allowed.has(effectiveMode)) {
    return { allowed: true, authorization: null, effective_mode: effectiveMode, hard_forbidden: false };
  }
  if (authorizationAllows(route, model, policy, request)) {
    return { allowed: true, authorization: "ratified", effective_mode: effectiveMode, hard_forbidden: false };
  }
  return { allowed: false, authorization: null, effective_mode: effectiveMode, hard_forbidden: false };
}

export function resolveEffectiveBilling(route, policy, store, now = new Date().toISOString()) {
  const boundary = route.billing_boundary;
  if (boundary == null) {
    return { status: "base", mode: route.billing_mode, observation: null, reason: null };
  }
  if (!boundary || typeof boundary !== "object" || Array.isArray(boundary)) {
    return { status: "invalid", mode: null, observation: null, reason: "billing_boundary must be an object" };
  }
  const resourceId = boundary.resource;
  const max = boundary.max_used_percent;
  const beyondMode = boundary.beyond_mode;
  if (typeof resourceId !== "string" || !resourceId) {
    return { status: "invalid", mode: null, observation: null, reason: "billing_boundary resource missing" };
  }
  if (!Number.isFinite(max) || max <= 0 || max > 100) {
    return { status: "invalid", mode: null, observation: null, reason: "billing_boundary max_used_percent must be > 0 and <= 100" };
  }
  if (!BILLING_MODES.has(beyondMode)) {
    return { status: "invalid", mode: null, observation: null, reason: `billing_boundary beyond_mode '${beyondMode || "missing"}' is unknown` };
  }
  if (!Array.isArray(route.quota_resources) || !route.quota_resources.includes(resourceId)) {
    return { status: "invalid", mode: null, observation: null, reason: `billing_boundary resource '${resourceId}' is not consumed by the route` };
  }
  const resource = policy?.quota_resources?.[resourceId];
  if (!resource) {
    return { status: "invalid", mode: null, observation: null, reason: `billing_boundary resource '${resourceId}' is missing from policy` };
  }
  const observation = getObservation(store, resource.capacity_observation, now);
  if (observation.state === "unknown") {
    return { status: "unknown", mode: null, observation,
      reason: `billing boundary '${resourceId}' is unknown (${observation.reason || "observed"})` };
  }
  const usedPercent = observation.state === "exhausted" ? 100 : observation.used_percent;
  if (!Number.isFinite(usedPercent) || usedPercent < 0 || usedPercent > 100) {
    return { status: "unknown", mode: null, observation,
      reason: `billing boundary '${resourceId}' has no valid used_percent` };
  }
  const beyond = usedPercent >= max;
  return {
    status: beyond ? "beyond" : "within",
    mode: beyond ? beyondMode : route.billing_mode,
    observation,
    used_percent: usedPercent,
    max_used_percent: max,
    reason: null,
  };
}

function observationEvidenceScore(observation, policy) {
  const config = policy?.routing_evidence;
  if (!config) return { score: 1, confidence_weight: 1, provenance_weight: 1 };
  const confidenceWeight = config.confidence_weights?.[observation?.confidence] ?? 0;
  const provenance = (config.provenance_weights || []).find((item) =>
    typeof observation?.source === "string" && observation.source.startsWith(item.prefix));
  const provenanceWeight = provenance?.weight ?? config.default_provenance_weight ?? 0;
  return {
    score: Number((confidenceWeight * provenanceWeight).toFixed(4)),
    confidence_weight: confidenceWeight,
    provenance_weight: provenanceWeight,
  };
}

export function evaluateRouteEvidence(facts, policy) {
  const minimums = policy?.routing_evidence?.minimum_fact_scores || {};
  const observations = [
    ["catalog", facts.catalog],
    ["entitlement", facts.entitlement],
    ["spend_guard", facts.spendGuard],
    ...(facts.quota || []).map((item) => ["quota", item.observation, item.resource]),
  ];
  const components = observations.map(([kind, observation, resource = null]) => {
    const scored = observationEvidenceScore(observation, policy);
    const minimum = minimums[kind] ?? 0;
    return { kind, resource, confidence: observation?.confidence || null,
      source: observation?.source || null, minimum, ...scored, meets_minimum: scored.score >= minimum };
  });
  const score = components.length
    ? Number((components.reduce((sum, item) => sum + item.score, 0) / components.length).toFixed(4))
    : 0;
  return { score, components };
}

export function evaluateRoute(model, route, context, request = {}) {
  const policy = context?.policy || null;
  const store = context?.store || { observations: {} };
  const now = context?.now || request.now || new Date().toISOString();
  const reasons = [];
  const warnings = [];
  const facts = {
    catalog: getObservation(store, route.catalog_observation, now),
    entitlement: getObservation(store, route.entitlement_observation, now),
    spendGuard: getObservation(store, route.spend_guard_observation, now),
    billing: null,
    billingBoundary: null,
    quota: [],
    evidence: null,
  };

  for (const field of ["id", "provider", "surface", "account_scope", "auth_mode", "billing_mode",
    "catalog_observation", "entitlement_observation", "spend_guard_observation"]) {
    if (typeof route[field] !== "string" || !route[field]) reasons.push(`route field '${field}' missing`);
  }
  if (route.provider && model.provider && route.provider !== model.provider) {
    reasons.push(`route provider '${route.provider}' does not match model provider '${model.provider}'`);
  }
  if (route.surface && !SURFACES.has(route.surface)) reasons.push(`route surface '${route.surface}' unsupported`);
  if (route.billing_mode && !BILLING_MODES.has(route.billing_mode)) {
    reasons.push(`billing mode '${route.billing_mode}' is unknown`);
  }
  if (!Array.isArray(route.access_methods) || route.access_methods.length === 0) {
    reasons.push("route access_methods missing");
  }
  if (!Array.isArray(route.quota_resources)) reasons.push("route quota_resources missing");
  if (route.entitlement_recheck_at != null && !Number.isFinite(Date.parse(route.entitlement_recheck_at))) {
    reasons.push("route entitlement_recheck_at is invalid");
  }

  if (entitlementRecheckDue(route, facts.entitlement, now)) {
    facts.entitlement = {
      ...facts.entitlement,
      state: "unknown",
      reason: "entitlement-recheck-required",
      fresh: false,
      entitlement_recheck_at: route.entitlement_recheck_at,
    };
  }

  if (!policy) reasons.push("policy missing");
  if (context?.lifecycle?.errors?.length) {
    reasons.push("candidate lifecycle state is unreadable");
  } else {
    const lifecycleState = context?.lifecycle?.candidates?.[model.id]?.state;
    if (["quarantined", "rejected"].includes(lifecycleState)) {
      reasons.push(`candidate lifecycle '${lifecycleState}' is not routable`);
    }
  }
  const routableLifecycle = new Set(policy?.lifecycle?.routable_states || ["qualified"]);
  if (!routableLifecycle.has(model.lifecycle_state)) {
    reasons.push(`lifecycle '${model.lifecycle_state || "unknown"}' is not routable`);
  }
  // Unknown catalogue, entitlement, and quota telemetry is not the same as a
  // failed route. Once subscription authentication is safely verified, a
  // zero-spend route may be attempted and the provider invocation becomes the
  // authoritative availability observation. Explicit negative facts still
  // remove the route. This keeps maintenance telemetry off the work hot path.
  if (facts.catalog.state === "unknown") warnings.push(`catalog unknown (${facts.catalog.reason || "observed"})`);
  else if (facts.catalog.state !== "present") reasons.push(`catalog ${facts.catalog.state} (${facts.catalog.reason || "observed"})`);
  if (["unknown", "listed_not_probed"].includes(facts.entitlement.state)) {
    const state = facts.entitlement.state === "listed_not_probed" ? "catalog-listed but unprobed" : "unknown";
    warnings.push(`entitlement ${state} (${facts.entitlement.reason || "observed"})`);
  } else if (facts.entitlement.state === "entitled_but_exhausted") {
    reasons.push("entitlement explicitly exhausted");
  } else if (facts.entitlement.state !== "entitled") {
    reasons.push(`entitlement ${facts.entitlement.state} (${facts.entitlement.reason || "observed"})`);
  }
  if (facts.spendGuard.state === "unknown") {
    reasons.push(`spend guard unknown (${facts.spendGuard.reason || "observed"})`);
  } else if (facts.spendGuard.state !== "disabled") {
    reasons.push(`spend guard ${facts.spendGuard.state} (${facts.spendGuard.reason || "observed"})`);
  }

  facts.billingBoundary = resolveEffectiveBilling(route, policy, store, now);
  if (facts.billingBoundary.reason) reasons.push(facts.billingBoundary.reason);
  facts.billing = facts.billingBoundary.mode
    ? billingAllowed(route, model, policy, { ...request, now }, facts.billingBoundary.mode)
    : { allowed: false, authorization: null, effective_mode: null, hard_forbidden: false };
  if (!facts.billing.allowed && facts.billingBoundary.mode) {
    reasons.push(facts.billing.hard_forbidden
      ? `effective billing mode '${facts.billingBoundary.mode}' is hard-forbidden by policy`
      : `effective billing mode '${facts.billingBoundary.mode}' is not allowed or authorized`);
  }

  for (const resourceId of route.quota_resources || []) {
    const resource = policy?.quota_resources?.[resourceId];
    const observation = getObservation(store, resource?.capacity_observation, now);
    const capacity = evaluateQuotaCapacity({ resourceId, resource, observation, policy, request });
    facts.quota.push({ resource: resourceId, observation, capacity });
    if (!resource) reasons.push(`quota resource '${resourceId}' missing from policy`);
    else if (!capacity.allowed && observation.state === "unknown") {
      warnings.push(capacity.reason);
    } else if (!capacity.allowed) reasons.push(capacity.reason);
  }

  facts.evidence = evaluateRouteEvidence(facts, policy);
  for (const component of facts.evidence.components.filter((item) => !item.meets_minimum)) {
    const subject = component.resource ? `${component.kind} '${component.resource}'` : component.kind;
    const message = `${subject} evidence score ${component.score} below policy minimum ${component.minimum} ` +
      `(confidence=${component.confidence || "none"}, source=${component.source || "none"})`;
    // Safe authentication/spend evidence is the non-negotiable boundary.
    // Missing route-maintenance facts are warnings and reduce confidence, but
    // do not turn a subscription-backed attempt into an ordinary work block.
    if (component.kind === "spend_guard") reasons.push(message);
    else warnings.push(message);
  }

  return {
    route,
    routable: reasons.length === 0,
    availability: reasons.length ? "unavailable" : warnings.length ? "attemptable" : "available",
    reasons,
    warnings,
    facts,
  };
}

export function findRoute(ledger, routeId) {
  for (const model of ledger.models || []) {
    const route = (model.access_routes || []).find((candidate) => candidate.id === routeId);
    if (route) return { model, route };
  }
  return null;
}

export function routeEvaluations(model, context, { surface = null, ...request } = {}) {
  return (model.access_routes || [])
    .filter((route) => !surface || route.surface === surface)
    .map((route) => evaluateRoute(model, route, context, request));
}

export function routeStatusLabel(evaluation) {
  if (evaluation.routable) return evaluation.availability || "available";
  const facts = evaluation.facts || {};
  const knownUnavailable = (facts.catalog?.state !== "unknown" && facts.catalog?.state !== "present") ||
    (!["unknown", "listed_not_probed", "entitled"].includes(facts.entitlement?.state)) ||
    (facts.spendGuard?.state !== "unknown" && facts.spendGuard?.state !== "disabled") ||
    facts.billingBoundary?.status === "invalid" || facts.billing?.hard_forbidden === true ||
    (facts.quota || []).some((item) => !item.capacity?.allowed && item.observation?.state !== "unknown") ||
    (evaluation.reasons || []).some((reason) => reason.startsWith("route field") ||
      reason.startsWith("route provider") || reason.startsWith("route surface") ||
      reason.startsWith("billing mode") || reason.startsWith("route access_methods") ||
      reason.startsWith("route quota_resources") || reason.startsWith("route entitlement_recheck_at") ||
      reason === "policy missing" || reason.includes("lifecycle"));
  if (knownUnavailable) return "unavailable";
  const unknown = [facts.catalog, facts.entitlement, facts.spendGuard,
    ...(facts.quota || []).map((q) => q.observation)].some((o) => o?.state === "unknown");
  return unknown || facts.billingBoundary?.status === "unknown" ? "unknown" : "unavailable";
}
