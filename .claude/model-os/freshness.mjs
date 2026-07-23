// Pure freshness classification and reset-aware maintenance planning.

function atMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value > 10_000_000_000 ? value : value * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resetMs(observation) {
  for (const value of [observation?.resets_at, observation?.reset_at, observation?.resetsAt]) {
    const parsed = atMs(value);
    if (parsed != null) return parsed;
  }
  return null;
}

export function classifyFreshness(observation, { now = new Date().toISOString(), leadSeconds = 0 } = {}) {
  const nowMs = atMs(now);
  if (nowMs == null) throw new Error("now must be a valid timestamp");
  if (!observation) return { state: "missing", fresh: false, due: true, reason: "missing" };
  const observedMs = atMs(observation.observed_at);
  const ttl = Number(observation.ttl);
  if (observedMs == null || !Number.isFinite(ttl) || ttl <= 0) {
    return { state: "invalid", fresh: false, due: true, reason: "invalid-observation" };
  }
  if (observedMs > nowMs) return { state: "future", fresh: false, due: true, reason: "future-observation" };
  const expiresMs = observedMs + ttl * 1000;
  const dueMs = Math.max(observedMs, expiresMs - Math.max(0, Number(leadSeconds) || 0) * 1000);
  if (nowMs >= expiresMs) return { state: "stale", fresh: false, due: true, reason: "ttl-expired",
    observed_at: observation.observed_at, expires_at: new Date(expiresMs).toISOString(), next_due_at: new Date(dueMs).toISOString() };
  if (nowMs >= dueMs) return { state: "due", fresh: true, due: true, reason: "ttl-lead-window",
    observed_at: observation.observed_at, expires_at: new Date(expiresMs).toISOString(), next_due_at: new Date(dueMs).toISOString() };
  return { state: "fresh", fresh: true, due: false, reason: "ttl-current",
    observed_at: observation.observed_at, expires_at: new Date(expiresMs).toISOString(), next_due_at: new Date(dueMs).toISOString() };
}

export function planObservationRefresh(observation, {
  now = new Date().toISOString(), leadSeconds = 0, resetDelaySeconds = 30,
  entitlementRecheckAt = null, maxResetHorizonSeconds = 31 * 86400,
} = {}) {
  const base = classifyFreshness(observation, { now, leadSeconds });
  const nowMs = atMs(now);
  if (!observation || !base.expires_at) return { ...base, next_due_at: new Date(nowMs).toISOString(), reset_considered: false };
  const observedMs = atMs(observation.observed_at);
  const ttlDeadline = atMs(base.next_due_at);
  const deadlines = [{ at: ttlDeadline, reason: base.reason }];
  const reset = resetMs(observation);
  let resetConsidered = false;
  if (reset != null && reset > observedMs && reset <= nowMs + maxResetHorizonSeconds * 1000) {
    const afterReset = reset + Math.max(0, Number(resetDelaySeconds) || 0) * 1000;
    if (afterReset <= ttlDeadline) {
      deadlines.push({ at: afterReset, reason: "provider-reset" });
      resetConsidered = true;
    }
  }
  const recheck = atMs(entitlementRecheckAt);
  // A post-boundary observation has already satisfied the dated recheck. Keeping
  // the old boundary in the deadline set would make maintenance permanently due.
  if (recheck != null && recheck > observedMs && recheck <= ttlDeadline) {
    deadlines.push({ at: recheck, reason: "entitlement-recheck" });
  }
  deadlines.sort((left, right) => left.at - right.at || left.reason.localeCompare(right.reason));
  const chosen = deadlines[0];
  const due = base.due || chosen.at <= nowMs;
  return { ...base, state: base.fresh && due ? "due" : base.state, due,
    reason: due && chosen.at <= nowMs ? chosen.reason : base.reason,
    next_due_at: new Date(chosen.at).toISOString(), reset_considered: resetConsidered,
    ttl_deadline_at: new Date(ttlDeadline).toISOString() };
}

export function nextWakeDelayMs(plan, { now = new Date().toISOString(), maxPollSeconds = 900,
  minimumDelaySeconds = 5 } = {}) {
  const nowMs = atMs(now);
  if (nowMs == null) throw new Error("now must be a valid timestamp");
  if (!Number.isFinite(maxPollSeconds) || maxPollSeconds <= 0) throw new Error("maxPollSeconds must be positive");
  if (!Number.isFinite(minimumDelaySeconds) || minimumDelaySeconds < 0) throw new Error("minimumDelaySeconds must be non-negative");
  const maximum = maxPollSeconds * 1000;
  const minimum = minimumDelaySeconds * 1000;
  const target = atMs(plan?.next_due_at);
  if (plan?.due === true || target == null || target <= nowMs) return minimum;
  return Math.max(minimum, Math.min(maximum, target - nowMs));
}

export function planMaintenance({ observations = {}, rechecks = {}, deadlines = {}, now = new Date().toISOString(),
  leadSeconds = 0, resetDelaySeconds = 30 } = {}) {
  const observationSources = Object.keys(observations).sort().map((key) => ({ key,
    ...planObservationRefresh(observations[key], { now, leadSeconds, resetDelaySeconds,
      entitlementRecheckAt: rechecks[key] || null }) }));
  const nowMs = atMs(now);
  const deadlineSources = Object.keys(deadlines).sort().map((key) => {
    const configured = typeof deadlines[key] === "object" ? deadlines[key] : { at: deadlines[key] };
    const deadline = atMs(configured.at);
    if (deadline == null) return { key, state: "invalid", fresh: false, due: true,
      reason: "invalid-deadline", next_due_at: new Date(nowMs).toISOString() };
    const due = nowMs >= deadline;
    return { key, state: due ? "due" : "fresh", fresh: !due, due,
      reason: configured.reason || "explicit-deadline", next_due_at: new Date(deadline).toISOString() };
  });
  const sources = [...observationSources, ...deadlineSources].sort((left, right) => left.key.localeCompare(right.key));
  const due = sources.filter((source) => source.due);
  const next = sources.filter((source) => source.next_due_at)
    .sort((left, right) => Date.parse(left.next_due_at) - Date.parse(right.next_due_at) || left.key.localeCompare(right.key))[0] || null;
  return { observed_at: now, due: due.length > 0, due_count: due.length, source_count: sources.length,
    next_due_at: next?.next_due_at || null, next_due_reason: next?.reason || "no-sources", sources };
}
