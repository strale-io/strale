#!/usr/bin/env node
// Pure Phase 3 quota normalization and policy evaluation. Provider I/O lives in
// quota.mjs / quota-statusline.mjs; this module writes observations only when asked.

import { getObservation, readObservationStore, writeObservations } from "./state-store.mjs";
import { CONFIDENCE_LEVELS, QUOTA_STATES } from "./schema.mjs";

function value(object, camel, snake) {
  return object?.[camel] ?? object?.[snake] ?? null;
}

function safeReason(error) {
  return String(error?.message || error || "unknown error").replace(/[\r\n]+/g, " ").slice(0, 240);
}

function finiteNumber(input) {
  if (typeof input === "number") return Number.isFinite(input) ? input : NaN;
  if (typeof input === "string" && input.trim()) {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

function quotaObservation(state, now, source, confidence, ttl, extra = {}) {
  return { state, observed_at: now, source, confidence, ttl, ...extra };
}

function validThresholds(thresholds) {
  if (thresholds?.status !== "ratified") return false;
  const green = thresholds.green_max_used_percent;
  const amber = thresholds.amber_max_used_percent;
  const red = thresholds.red_max_used_percent;
  return [green, amber, red].every(Number.isFinite) &&
    green >= 0 && green < amber && amber < red && red <= 100;
}

export function quotaTtlForAdapter(policy, adapter) {
  const adapterTtl = policy?.observation_ttl?.quota_by_adapter?.[adapter];
  const ttl = Number.isFinite(adapterTtl) ? adapterTtl : policy?.observation_ttl?.quota;
  if (!Number.isFinite(ttl) || ttl <= 0) {
    throw new Error(`policy quota TTL missing or invalid for adapter '${adapter || "unknown"}'`);
  }
  return ttl;
}

export function classifyQuotaWindow(window, thresholds, rateLimitReachedType = null) {
  const used = finiteNumber(window?.used_percent);
  if (!Number.isFinite(used) || used < 0 || used > 100) {
    return { state: "unknown", reason: "used percent missing or invalid" };
  }
  if (rateLimitReachedType || used >= 100) return { state: "exhausted", reason: rateLimitReachedType || "100% used" };
  if (!validThresholds(thresholds)) {
    return { state: "unknown", reason: "quota state thresholds are not founder-ratified" };
  }
  if (used <= thresholds.green_max_used_percent) return { state: "green", reason: null };
  if (used <= thresholds.amber_max_used_percent) return { state: "amber", reason: null };
  if (used <= thresholds.red_max_used_percent) return { state: "red", reason: null };
  return { state: "exhausted", reason: "usage exceeds red threshold" };
}

function snapshots(payload) {
  const byId = payload?.rateLimitsByLimitId ?? payload?.rate_limits_by_limit_id;
  if (byId && typeof byId === "object" && !Array.isArray(byId) && Object.keys(byId).length) {
    return Object.entries(byId).map(([limitId, snapshot]) => ({ limitId, snapshot }));
  }
  const single = payload?.rateLimits ?? payload?.rate_limits ?? payload;
  return single && typeof single === "object" ? [{
    limitId: value(single, "limitId", "limit_id") || "codex",
    snapshot: single,
  }] : [];
}

export function normalizeCodexRateLimits(payload) {
  const result = [];
  const seen = new Set();
  for (const entry of snapshots(payload)) {
    const limitId = value(entry.snapshot, "limitId", "limit_id") || entry.limitId;
    const planType = value(entry.snapshot, "planType", "plan_type");
    const reached = value(entry.snapshot, "rateLimitReachedType", "rate_limit_reached_type");
    for (const bucket of ["primary", "secondary"]) {
      const window = entry.snapshot?.[bucket];
      if (!window) continue;
      const duration = finiteNumber(value(window, "windowDurationMins", "window_minutes"));
      const used = finiteNumber(value(window, "usedPercent", "used_percent"));
      if (!Number.isFinite(duration) || !Number.isFinite(used)) continue;
      const key = `${limitId}:${duration}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        limit_id: limitId,
        window_duration_mins: duration,
        used_percent: used,
        resets_at: value(window, "resetsAt", "resets_at"),
        plan_type: planType,
        rate_limit_reached_type: reached,
        bucket,
      });
    }
  }
  return result;
}

export function parseRolloutRateLimits(text, { now = new Date().toISOString(), ttl = 900 } = {}) {
  let latest = null;
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      const rateLimits = record?.payload?.rate_limits;
      const observed = Date.parse(record?.timestamp);
      if (!rateLimits || !Number.isFinite(observed)) continue;
      if (!latest || observed > latest.observed) latest = { observed, timestamp: record.timestamp, rateLimits };
    } catch { /* rollout files contain JSONL; a malformed line is ignored */ }
  }
  if (!latest) return { status: "unknown", reason: "no rollout rate-limit event found" };
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs) || nowMs >= latest.observed + ttl * 1000) {
    return { status: "unknown", reason: "latest rollout rate-limit event is expired" };
  }
  if (latest.observed > nowMs + 300000) return { status: "unknown", reason: "rollout observation is in the future" };
  return { status: "ok", observed_at: latest.timestamp, payload: { rateLimits: latest.rateLimits } };
}

function unknownFact({ now, ttl, source, reason, resource }) {
  return quotaObservation("unknown", now, source, "low", ttl, {
    provider: resource.provider,
    reason: safeReason(reason),
  });
}

export function buildQuotaObservations({
  policy,
  codexPayload = null,
  codexError = null,
  rolloutText = null,
  now = new Date().toISOString(),
}) {
  const ttl = quotaTtlForAdapter(policy, "codex-app-server-rate-limits");
  let payload = codexPayload;
  let source = "machine:codex-app-server:account/rateLimits/read";
  let confidence = "high";
  let sourceError = codexError;
  if (!payload && rolloutText != null) {
    const fallback = parseRolloutRateLimits(rolloutText, { now, ttl });
    if (fallback.status === "ok") {
      payload = fallback.payload;
      source = "machine:codex-rollout-fallback";
      confidence = "medium";
      now = fallback.observed_at;
    } else sourceError = sourceError || new Error(fallback.reason);
  }
  const windows = payload ? normalizeCodexRateLimits(payload) : [];
  const observations = {};
  for (const [resourceId, resource] of Object.entries(policy?.quota_resources || {})) {
    if (resource.adapter !== "codex-app-server-rate-limits") continue;
    const key = resource.capacity_observation;
    if (!key) throw new Error(`quota resource '${resourceId}' has no capacity_observation`);
    const window = windows.find((candidate) => candidate.limit_id === resource.limit_id &&
      candidate.window_duration_mins === resource.window_duration_mins);
    if (!window) {
      observations[key] = unknownFact({ now, ttl, source, resource,
        reason: sourceError || `no '${resource.limit_id}' ${resource.window_duration_mins}-minute window in telemetry` });
      continue;
    }
    const classification = classifyQuotaWindow(window, policy.quota_state_thresholds, window.rate_limit_reached_type);
    observations[key] = quotaObservation(classification.state, now, source,
      classification.state === "unknown" ? "low" : confidence, ttl, {
        provider: resource.provider,
        limit_id: window.limit_id,
        window_duration_mins: window.window_duration_mins,
        used_percent: window.used_percent,
        remaining_percent: 100 - window.used_percent,
        resets_at: window.resets_at,
        plan_type: window.plan_type,
        reason: classification.reason,
      });
  }
  return { observations, source, fallback_used: source.includes("fallback") };
}

function predictionFor(policy, taskClass, resourceId) {
  const row = policy?.quota_prediction?.task_classes?.[taskClass]?.resources?.[resourceId];
  if (!row || !Number.isFinite(row.p95_percent) || row.p95_percent < 0 || row.p95_percent > 100 ||
      !CONFIDENCE_LEVELS.has(row.confidence)) return null;
  const minimumSamples = policy?.quota_prediction?.minimum_calibrated_samples;
  const calibrated = row.calibration_status === "calibrated" && Number.isFinite(row.sample_size) &&
    Number.isFinite(minimumSamples) && minimumSamples > 0 && row.sample_size >= minimumSamples;
  const effectiveConfidence = calibrated ? row.confidence : "low";
  let effective = row.p95_percent;
  if (effectiveConfidence === "low") {
    const multiplier = policy?.quota_prediction?.low_confidence_multiplier;
    if (!Number.isFinite(multiplier) || multiplier < 1) return null;
    effective *= multiplier;
  }
  return { ...row, confidence: effectiveConfidence, effective_p95_percent: Math.min(100, effective) };
}

export function evaluateQuotaCapacity({ resourceId, resource, observation, policy, request = {} }) {
  if (!resource || !observation) return { allowed: false, reason: `quota '${resourceId}' unknown` };
  if (observation.state === "unknown") return { allowed: false, reason: `quota '${resourceId}' unknown` };
  if (observation.state === "exhausted") return { allowed: false, reason: `quota '${resourceId}' exhausted` };
  if (!QUOTA_STATES.has(observation.state)) return { allowed: false, reason: `quota '${resourceId}' state '${observation.state}' invalid` };

  // Legacy/synthetic Phase 1 policies retain their state-only semantics. Phase 3
  // enforcement is opt-in per ratified resource and is not activated by code presence.
  if (resource.enforcement !== "phase3") {
    return { allowed: true, reason: null, legacy: true };
  }

  const prediction = predictionFor(policy, request.taskClass, resourceId);
  if (!prediction) return { allowed: false, reason: `quota prediction unknown for task class '${request.taskClass || "missing"}' and resource '${resourceId}'` };
  const requestedWidth = request.fanoutWidthByResource?.[resourceId] ?? request.fanoutWidth;
  const fanoutWidth = requestedWidth == null ? 1 : Number(requestedWidth);
  if (!Number.isInteger(fanoutWidth) || fanoutWidth < 1) {
    return { allowed: false, reason: `fan-out width '${requestedWidth}' is invalid` };
  }
  const used = finiteNumber(observation.used_percent);
  if (!Number.isFinite(used) || used < 0 || used > 100) {
    return { allowed: false, reason: `quota '${resourceId}' used percent unknown` };
  }
  const activeReserves = (policy?.reserves || []).filter((reserve) =>
    reserve.status === "active" && reserve.resource === resourceId);
  if (activeReserves.some((reserve) => !Number.isFinite(reserve.reserve_percent) || reserve.reserve_percent < 0 ||
      reserve.reserve_percent > 100 || !Array.isArray(reserve.protected_roles) || reserve.protected_roles.length === 0)) {
    return { allowed: false, reason: `quota reserve for '${resourceId}' is invalid` };
  }
  const totalReserve = activeReserves.reduce((sum, reserve) => sum + reserve.reserve_percent, 0);
  if (totalReserve > 100) return { allowed: false, reason: `quota reserves for '${resourceId}' exceed capacity` };
  const protectedRole = activeReserves.some((reserve) => (reserve.protected_roles || []).includes(request.role));
  const reserveFloor = activeReserves
    .filter((reserve) => !(reserve.protected_roles || []).includes(request.role))
    .reduce((sum, reserve) => sum + reserve.reserve_percent, 0);
  const remaining = 100 - used;
  const aggregateP95 = prediction.effective_p95_percent * fanoutWidth;
  const projected = remaining - aggregateP95;
  const base = {
    protected: protectedRole,
    reserve_percent: reserveFloor,
    p95_percent: prediction.p95_percent,
    effective_p95_percent: prediction.effective_p95_percent,
    fanout_width: fanoutWidth,
    aggregate_p95_percent: aggregateP95,
    prediction_confidence: prediction.confidence,
    projected_remaining_percent: projected,
  };
  if (projected < 0) return { allowed: false,
    reason: fanoutWidth > 1
      ? `aggregate fan-out p95 consumption (${fanoutWidth} workers) exceeds remaining '${resourceId}' capacity`
      : `predicted p95 consumption exceeds remaining '${resourceId}' capacity`, ...base };
  // Red is protected-ONLY where a reserve actually exists on this resource (DEC-198 as
  // amended by DEC-204, founder 2026-07-15): with no active reserve there is nothing red
  // is holding capacity FOR, and the p95 prediction above already prevents overshoot —
  // blocking a reserve-less red lane just wastes its paid tail until the window resets.
  if (observation.state === "red" && activeReserves.length > 0 && !protectedRole) {
    return { allowed: false, reason: `quota '${resourceId}' is red and reserved for protected work`, ...base };
  }
  if (projected < reserveFloor) {
    return { allowed: false, reason: `predicted p95 consumption would breach the ${reserveFloor}% reserve on '${resourceId}'`, ...base };
  }
  return { allowed: true, reason: null, ...base };
}

export function ingestClaudeStatusline({
  payload,
  policy,
  stateDir = null,
  now = new Date().toISOString(),
}) {
  const ttl = quotaTtlForAdapter(policy, "claude-statusline-rate-limits");
  const store = readObservationStore({ stateDir });
  if (store.errors.length) throw new Error(`observation store invalid: ${store.errors.join("; ")}`);
  const observations = {};
  for (const [resourceId, resource] of Object.entries(policy?.quota_resources || {})) {
    if (resource.adapter !== "claude-statusline-rate-limits") continue;
    const key = resource.capacity_observation;
    const window = payload?.rate_limits?.[resource.statusline_field];
    const used = finiteNumber(window?.used_percentage);
    if (!window || !Number.isFinite(used)) {
      if (getObservation(store, key, now).state !== "unknown") continue;
      observations[key] = unknownFact({ now, ttl, source: "machine:claude-statusline", resource,
        reason: `status-line field rate_limits.${resource.statusline_field} unavailable before a provider response` });
      continue;
    }
    const normalized = { used_percent: used };
    const classification = classifyQuotaWindow(normalized, policy.quota_state_thresholds);
    observations[key] = quotaObservation(classification.state, now, "machine:claude-statusline",
      classification.state === "unknown" ? "low" : "high", ttl, {
        provider: resource.provider,
        used_percent: normalized.used_percent,
        remaining_percent: 100 - normalized.used_percent,
        resets_at: window.resets_at ?? null,
        statusline_field: resource.statusline_field,
        reason: classification.reason,
      });
  }
  if (Object.keys(observations).length) writeObservations({ stateDir, observations });
  return { written: Object.keys(observations).length, observations };
}

function observationAgeSeconds(observedAt, now) {
  const a = Date.parse(observedAt);
  const b = Date.parse(now);
  return Number.isFinite(a) && Number.isFinite(b) ? (b - a) / 1000 : null;
}

// Only these observation states carry a meaningful remaining-capacity reading. Anything else — the
// literal "unknown", "exhausted" (0 headroom, and already gated out of candidacy upstream), or a
// malformed/garbage state — is NOT usable headroom and must never drive a reorder.
const HEADROOM_STATES = new Set(["green", "amber", "red"]);

// FR-278 / DEC-213 (DRAFT): weekly provider headroom for the quota load-balancing tiebreak.
// Returns { [provider]: { remaining_percent, fresh } } from each provider's WEEKLY quota observation,
// selected by the CANONICAL resource kind (never a substring heuristic). Numeric + fresh + valid-state
// only — a provider without a fresh, in-range, known-state numeric weekly reading is OMITTED, so the
// tiebreak simply skips it (never balances on stale/unknown/garbage data). Provider-NEUTRAL by
// construction: measured remaining capacity, never a preference for any provider (provider_identity_weight
// stays 0). `getObservation` already collapses expired/invalid readings to state "unknown" and stamps
// `fresh`; the optional maxAgeSeconds adds a STRICTER age bound on top of the observation's own TTL.
export function buildQuotaHeadroom({ store, policy, now = new Date().toISOString(), maxAgeSeconds = null }) {
  const headroom = {};
  for (const resource of Object.values(policy?.quota_resources || {})) {
    if (!resource || typeof resource !== "object") continue;        // null/garbage resource entry
    if (resource.kind !== "rolling-weekly-window") continue;        // canonical weekly discriminator
    if (!resource.provider) continue;
    const obs = getObservation(store, resource.capacity_observation, now);
    if (!obs || !HEADROOM_STATES.has(obs.state) || obs.fresh !== true) continue;
    const remaining = Number.isFinite(obs.remaining_percent)
      ? obs.remaining_percent
      : (Number.isFinite(obs.used_percent) ? 100 - obs.used_percent : null);
    if (remaining == null || remaining < 0 || remaining > 100) continue;
    let fresh = true;
    if (Number.isFinite(maxAgeSeconds)) {
      const age = observationAgeSeconds(obs.observed_at, now);
      fresh = age != null && age <= maxAgeSeconds;
    }
    headroom[resource.provider] = { remaining_percent: remaining, fresh };
  }
  return headroom;
}
