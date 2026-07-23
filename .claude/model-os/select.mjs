#!/usr/bin/env node
// MODEL-OS provider-neutral scheduler.
//
// Selection is a deterministic, token-free calculation over a compact task
// profile, the ratified capability registry, and machine-local route facts.
// Provider identity is transport metadata only. Entry surface never affects
// ranking; the sole provider constraint is independent review.

import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { findPolicy, loadRouteContext, readPolicy, routeEvaluations, routeStatusLabel } from "./route-state.mjs";
import { buildQuotaHeadroom } from "./quota-lib.mjs";
import { QUOTA_STATES, SURFACES } from "./schema.mjs";
import { appendBoundedJsonl } from "./state-store.mjs";
import { appendTelemetryEvent, hashOperationalValue, telemetryEnabled, telemetryReason } from "./telemetry.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COST_ORDER = { low: 1, mid: 2, high: 3, top: 4 };
const LATENCY_ORDER = { fast: 1, balanced: 2, slow: 3 };
const CONFIDENCE_SCORE = { low: 0.35, medium: 0.7, high: 1 };
const EFFORT_ORDER = ["low", "medium", "high", "maximum"];
const REASONING_EFFORTS = new Set(["low", "medium", "high", "maximum"]);
const LEGACY_MULTI_AGENT_EFFORT = "multi-agent";
const OPERATIONS = new Set(["decide", "analyze", "execute", "review", "mechanical"]);
const ARTIFACTS = new Set(["scratch", "code", "buyer-facing", "canon"]);
const AUTHORITIES = new Set(["autonomous", "founder-directed"]);
const STAGES = new Set(["explore", "draft", "local-change", "commit", "push", "deploy-send"]);
const ROLE_OPERATION = {
  "taste-canon": "decide", "heavy-analysis": "analyze", execution: "execute",
  "fan-out": "analyze", mechanical: "mechanical", "independent-review": "review",
};
const ROUTE_CACHE = new Map();

export const EXIT = { routable: 0, blocked: 4, "review-pending": 5 };

function projectLedgerCandidates(start) {
  const candidates = [];
  let current = path.resolve(start || process.cwd());
  while (true) {
    candidates.push(path.join(current, ".claude", "model-os", "routing.json"));
    candidates.push(path.join(current, "model-os", "routing.json"));
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return candidates;
}

export function findLedger() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR;
  const candidates = [...new Set([
    process.env.MODEL_OS_LEDGER,
    ...(projectDir ? [
      path.join(projectDir, ".claude", "model-os", "routing.json"),
      path.join(projectDir, "model-os", "routing.json"),
    ] : []),
    ...projectLedgerCandidates(process.cwd()),
    path.join(HERE, "routing.json"),
    path.join(os.homedir(), ".claude", "model-os", "routing.json"),
  ].filter(Boolean))];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function assertEnum(value, allowed, label) {
  if (!allowed.has(value)) throw new Error(`select: ${label} '${value}' is invalid (allowed: ${[...allowed].join("/")})`);
}

function uniqueStrings(values, label) {
  if (!Array.isArray(values) || values.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`select: ${label} must be an array of non-empty strings`);
  }
  return [...new Set(values.map((item) => item.trim()))];
}

function capabilityVocabulary(ledger) {
  const known = new Set();
  for (const model of ledger?.models || []) {
    for (const capability of model.capabilities?.qualified || []) known.add(capability);
    for (const capability of Object.keys(model.capability_scores || {})) known.add(capability);
  }
  return [...known].sort();
}

export function classifyTaskText(text) {
  const value = String(text || "").trim();
  if (!value) return {};
  const lower = value.toLowerCase();
  const founderDirected = /founder[- ](?:approved|directed|directive|ratified|instruction)|explicit founder|apply (?:the )?(?:approved|ratified)/.test(lower);
  const artifact = /direction\.json|decisions?\.md|agents\.md|doctrine|canon/.test(lower)
    ? "canon"
    : /landing|buyer-facing|customer-facing|marketing copy|ui\/ux/.test(lower)
      ? "buyer-facing"
      : /code|implement|debug|fix|test|refactor/.test(lower) ? "code" : "scratch";
  let operation = "analyze";
  if (/\b(format|stamp|move|rename|lint|rerun|re-run|copy files?)\b/.test(lower)) operation = "mechanical";
  else if (/\b(review|audit|critique)\b/.test(lower)) operation = "review";
  else if (/\b(implement|apply|execute|build|fix|change|update)\b/.test(lower)) operation = "execute";
  else if (/\b(decide|invent|strategy|positioning|choose direction)\b/.test(lower)) operation = "decide";
  const stage = /\b(deploy|release|publish|send)\b/.test(lower) ? "deploy-send"
    : /\bpush\b/.test(lower) ? "push"
      : /\bcommit\b/.test(lower) ? "commit"
        : /\bdraft\b/.test(lower) ? "draft"
          : /\b(explore|spike|prototype)\b/.test(lower) ? "explore" : "local-change";
  const preferredCapabilities = [];
  const add = (capability, pattern) => { if (pattern.test(lower)) preferredCapabilities.push(capability); };
  add("architecture", /\b(architecture|system design|scheduler|router|platform)\b/);
  add("strategic-judgment", /\b(strategy|positioning|trade-?off|choose direction|decision)\b/);
  add("research", /\b(research|source|browse|latest|evidence|benchmark)\b/);
  add("debugging", /\b(debug|broken|failure|root cause|regression)\b/);
  add("coding", /\b(code|implement|build|fix|test|refactor|patch)\b/);
  add("copywriting", /\b(copy|headline|landing page|marketing|email)\b/);
  add("design-judgment", /\b(ui|ux|design|layout|visual)\b/);
  add("precision", /\b(migration|security|auth|financial|data integrity|exact)\b/);
  const stakes = /\b(irreversible|destructive production|send real|delete production)\b/.test(lower) ? "critical"
    : /\b(production|security|auth|migration|push|deploy|release|publish)\b/.test(lower) ? "high" : "mid";
  return {
    operation,
    artifact,
    authority: founderDirected ? "founder-directed" : "autonomous",
    stage,
    preferredCapabilities: [...new Set(preferredCapabilities)],
    stakes,
  };
}

function roleFor(profile) {
  if (profile.role) return profile.role;
  if (profile.operation === "review" && profile.independentReview) return "independent-review";
  if (profile.operation === "mechanical") return "mechanical";
  // Operation and explicit decision context outrank the filename. Applying an explicit founder
  // decision to a canonical file is execution, not autonomous canon authorship.
  if (profile.operation === "execute") return "execution";
  if (profile.operation === "decide" && ["buyer-facing", "canon"].includes(profile.artifact)) return "taste-canon";
  if (profile.operation === "analyze" || profile.operation === "review") return "heavy-analysis";
  return "execution";
}

function effortForProfile(profile) {
  const explicit = profile.reasoningEffort || (profile.requestedEffort !== LEGACY_MULTI_AGENT_EFFORT
    ? profile.requestedEffort : null);
  if (explicit) {
    assertEnum(explicit, REASONING_EFFORTS, "reasoning effort");
    if (explicit === "maximum" && !(profile.stakes === "critical" || profile.concentratedJudgment)) {
      throw new Error("select: maximum effort requires critical stakes or concentratedJudgment=true");
    }
    if (explicit === "maximum" && !profile.effortJustification) {
      throw new Error("select: explicit maximum effort requires effortJustification");
    }
    return { effort: explicit, source: "explicit" };
  }
  if (profile.operation === "mechanical") return { effort: "low", source: "rule" };
  if (profile.parallelism.mode === "fan-out") {
    const effort = profile.stakes === "critical" || profile.concentratedJudgment ? "high" : "medium";
    return { effort, source: "rule" };
  }
  if (profile.operation === "execute") {
    return { effort: profile.stakes === "high" || profile.stakes === "critical" ? "high" : "medium", source: "rule" };
  }
  if (profile.stakes === "critical" || profile.concentratedJudgment) return { effort: "maximum", source: "rule" };
  return { effort: profile.stakes === "low" ? "medium" : "high", source: "rule" };
}

function reviewRequiredBefore(profile) {
  if (!["commit", "push", "deploy-send"].includes(profile.stage)) return null;
  if (profile.artifact === "buyer-facing") return profile.stage;
  if (profile.artifact === "code" && ["push", "deploy-send"].includes(profile.stage)) return profile.stage;
  if (profile.artifact === "canon" && profile.operation !== "mechanical") return profile.stage;
  return null;
}

export function profileTask(raw = {}, ledger = null) {
  const inferred = classifyTaskText(raw.taskText);
  const profile = {
    operation: raw.operation || inferred.operation || ROLE_OPERATION[raw.role] || "analyze",
    artifact: raw.artifact || inferred.artifact || "scratch",
    authority: raw.authority || inferred.authority || "autonomous",
    stage: raw.stage || inferred.stage || "local-change",
    requiredCapabilities: uniqueStrings(raw.requiredCapabilities || raw.capabilities || [], "requiredCapabilities"),
    preferredCapabilities: uniqueStrings(raw.preferredCapabilities || inferred.preferredCapabilities || [], "preferredCapabilities"),
    independentReview: Boolean(raw.independentReview || raw.role === "independent-review"),
    authorProvider: raw.authorProvider || null,
    stakes: raw.stakes || inferred.stakes || "mid",
    decomposable: Boolean(raw.decomposable || raw.parallelism?.mode === "fan-out"),
    parallelUnits: raw.parallelism?.units == null
      ? (raw.parallelUnits == null ? 1 : Number(raw.parallelUnits))
      : Number(raw.parallelism.units),
    concentratedJudgment: Boolean(raw.concentratedJudgment),
    effortJustification: typeof raw.effortJustification === "string" && raw.effortJustification.trim()
      ? raw.effortJustification.trim() : null,
    reviewArtifactType: raw.reviewArtifactType || null,
    role: raw.role || null,
    taskText: raw.taskText || null,
    requestedEffort: raw.effort || null,
    reasoningEffort: raw.reasoningEffort || null,
    qualityFloor: raw.qualityFloor == null ? null : Number(raw.qualityFloor),
  };
  assertEnum(profile.operation, OPERATIONS, "operation");
  assertEnum(profile.artifact, ARTIFACTS, "artifact");
  assertEnum(profile.authority, AUTHORITIES, "authority");
  assertEnum(profile.stage, STAGES, "stage");
  if (ledger) {
    const knownCapabilities = capabilityVocabulary(ledger);
    const known = new Set(knownCapabilities);
    const requested = [...profile.requiredCapabilities, ...profile.preferredCapabilities];
    const unknown = requested.filter((capability) => !known.has(capability));
    if (unknown.length) {
      throw new Error(`select: unknown capabilities: ${unknown.join(", ")} ` +
        `(known ledger capabilities: ${knownCapabilities.join(", ") || "none declared"})`);
    }
  }
  if (profile.qualityFloor != null && (!Number.isFinite(profile.qualityFloor) ||
      profile.qualityFloor < 0 || profile.qualityFloor > 100)) {
    throw new Error("select: qualityFloor must be between 0 and 100");
  }
  if (!Number.isInteger(profile.parallelUnits) || profile.parallelUnits < 1) throw new Error("select: parallelUnits must be a positive integer");
  const defaultFanout = Number(ledger?.caps?.fanout_width_default ?? 6);
  const maximumFanout = Number(ledger?.caps?.fanout_width_max ?? 20);
  if (!Number.isInteger(defaultFanout) || defaultFanout < 2 ||
      !Number.isInteger(maximumFanout) || maximumFanout < defaultFanout) {
    throw new Error("select: ledger fan-out caps must be integers with max >= default >= 2");
  }
  if (profile.parallelUnits > maximumFanout) {
    throw new Error(`select: parallelUnits exceeds the configured maximum of ${maximumFanout}`);
  }
  if (profile.parallelUnits > defaultFanout && !profile.effortJustification) {
    throw new Error(`select: parallelUnits above the default width ${defaultFanout} requires effortJustification`);
  }
  const fanoutRequested = profile.requestedEffort === LEGACY_MULTI_AGENT_EFFORT ||
    (profile.decomposable && profile.parallelUnits > 1);
  if (profile.requestedEffort === LEGACY_MULTI_AGENT_EFFORT) {
    if (!profile.decomposable || profile.parallelUnits < 2) {
      throw new Error("select: legacy multi-agent effort requires decomposable=true and an integral parallelUnits >= 2");
    }
    if (!profile.effortJustification) {
      throw new Error("select: explicit multi-agent topology requires effortJustification");
    }
  }
  profile.parallelism = {
    mode: fanoutRequested ? "fan-out" : "single",
    units: fanoutRequested ? profile.parallelUnits : 1,
  };
  profile.role = roleFor(profile);
  if (ledger && !(ledger.roles || {})[profile.role]) throw new Error(`select: unknown role '${profile.role}'`);
  if (!raw.effort && !raw.reasoningEffort && raw.role && ledger?.roles?.[profile.role]?.effort) {
    profile.requestedEffort = ledger.roles[profile.role].effort === LEGACY_MULTI_AGENT_EFFORT
      ? null : ledger.roles[profile.role].effort;
  }
  const effort = effortForProfile(profile);
  profile.effort = effort.effort;
  profile.effortSource = effort.source;
  return profile;
}

function assertQuota(quota) {
  if (quota == null) return;
  if (typeof quota !== "object" || Array.isArray(quota)) throw new Error("select: quota must be an object");
  for (const [lane, state] of Object.entries(quota)) {
    if (!QUOTA_STATES.has(state)) throw new Error(`select: invalid quota state '${state}' for lane '${lane}'`);
  }
}

function isCurrent(model) { return (model.status || "current") === "current"; }
function qualifiedFor(model, role) {
  return Array.isArray(model.roles_qualified) && model.roles_qualified.includes(role);
}

function qualifiedForRequest(model, profile) {
  if (!qualifiedFor(model, profile.role)) return false;
  // A required capability disqualifies only on explicit negative evidence (capabilities.unsupported).
  // Missing registry evidence is a calibration gap, not evidence of absence: the model stays a
  // candidate, scored with the missing-data penalty, and the gap is surfaced as requirement_gaps.
  const unsupported = model.capabilities?.unsupported || [];
  if (profile.requiredCapabilities.some((capability) => unsupported.includes(capability))) return false;
  if (profile.reviewArtifactType && !(model.capabilities?.review || []).includes(profile.reviewArtifactType)) return false;
  return true;
}

function capabilityEvidenceGaps(model, capabilities) {
  return capabilities.filter((capability) =>
    !Number.isFinite(model.capability_scores?.[capability]) &&
    !(model.capabilities?.qualified || []).includes(capability));
}

function capabilityScore(model, capability, roleScore, missingPenalty = 15) {
  if (Number.isFinite(model.capability_scores?.[capability])) return model.capability_scores[capability];
  if ((model.capabilities?.qualified || []).includes(capability)) return roleScore;
  return Math.max(0, roleScore - missingPenalty);
}

function mean(values, fallback) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
}

function laneExplicitlyExhausted(model, quota) {
  return quota?.[model.budget] === "exhausted" || quota?.[model.provider] === "exhausted";
}

function routeCandidates(model, routeContext, request) {
  if (!Array.isArray(model.access_routes) || model.access_routes.length === 0) {
    return [];
  }
  return routeEvaluations(model, routeContext, request).map((evaluation) => ({
    route: evaluation.route.id,
    surface: evaluation.route.surface,
    availability: evaluation.availability || routeStatusLabel(evaluation),
    evidenceScore: evaluation.facts?.evidence?.score ?? 0,
    warnings: evaluation.warnings || [],
    reasons: evaluation.reasons || [],
    routable: evaluation.routable,
  }));
}

function taskFit(model, profile) {
  const roleScore = Number.isFinite(model.role_scores?.[profile.role])
    ? model.role_scores[profile.role]
    : Number.isFinite(model.quality_rank) ? model.quality_rank : 0;
  const required = profile.requiredCapabilities.map((capability) => capabilityScore(model, capability, roleScore));
  const preferred = profile.preferredCapabilities.map((capability) => capabilityScore(model, capability, roleScore));
  if (!required.length && !preferred.length) return roleScore;
  if (required.length && preferred.length) {
    return Number((roleScore * 0.5 + mean(required, roleScore) * 0.3 + mean(preferred, roleScore) * 0.2).toFixed(2));
  }
  const capabilityAverage = mean(required.length ? required : preferred, roleScore);
  const roleWeight = required.length ? 0.6 : 0.7;
  return Number((roleScore * roleWeight + capabilityAverage * (1 - roleWeight)).toFixed(2));
}

function modelEvidence(model, profile) {
  const roleEvidence = model.capability_evidence?.roles?.[profile.role] || model.capabilities?.evidence;
  const confidence = typeof roleEvidence === "object" ? roleEvidence.confidence : null;
  return CONFIDENCE_SCORE[confidence] ?? (typeof roleEvidence === "string" ? 0.7 : 0.5);
}

function providerEffortControl(model, abstractEffort) {
  const declared = model.effort_controls?.[abstractEffort];
  if (declared) return declared;
  const defaults = model.provider === "openai"
    ? { low: "low", medium: "medium", high: "xhigh", maximum: "max", "multi-agent": "medium" }
    : { low: "low", medium: "medium", high: "high", maximum: "max", "multi-agent": "medium" };
  let control = defaults[abstractEffort] || "medium";
  if (Array.isArray(model.supported_efforts) && !model.supported_efforts.includes(control)) {
    const order = ["low", "medium", "high", "xhigh", "max", "ultra"];
    const target = order.indexOf(control);
    control = [...model.supported_efforts].sort((a, b) => Math.abs(order.indexOf(a) - target) - Math.abs(order.indexOf(b) - target))[0];
  }
  return control;
}

function performanceGroup(routeContext, modelId, role, effort) {
  return routeContext?.performance?.groups?.[[modelId, role, effort].join("|")] || null;
}

function optimizationEligible(performance) {
  return performance?.optimization_eligible == null ? performance?.calibrated === true : performance.optimization_eligible === true;
}

function empiricalQualityFloor(profile, policy) {
  if (profile.qualityFloor != null) return profile.qualityFloor / 100;
  const configured = policy?.selection?.empirical_optimization?.quality_floor_by_stakes?.[profile.stakes];
  return Number.isFinite(configured) ? configured : 0.8;
}

function chooseCandidateEffort(model, profile, routeContext) {
  const config = routeContext?.policy?.selection?.empirical_optimization;
  if (profile.effortSource === "explicit" || config?.status !== "enabled") {
    return { effort: profile.effort, source: profile.effortSource, performance: performanceGroup(routeContext,
      model.id, profile.role, profile.effort) };
  }
  const minimumSamples = Number(config.minimum_verified_samples || routeContext?.performance?.minimum_samples || 10);
  const qualityFloor = empiricalQualityFloor(profile, routeContext.policy);
  const eligible = EFFORT_ORDER.map((effort) => ({ effort,
    performance: performanceGroup(routeContext, model.id, profile.role, effort) }))
    .filter(({ performance }) => performance?.verified_samples >= minimumSamples &&
      optimizationEligible(performance) && Number(performance.predicted_success) >= qualityFloor &&
      Number.isFinite(performance.expected_verified_tokens));
  if (!eligible.length) {
    return { effort: profile.effort, source: profile.effortSource, performance: performanceGroup(routeContext,
      model.id, profile.role, profile.effort) };
  }
  eligible.sort((left, right) => left.performance.expected_verified_tokens - right.performance.expected_verified_tokens ||
    (left.performance.median_duration_ms ?? Number.POSITIVE_INFINITY) -
      (right.performance.median_duration_ms ?? Number.POSITIVE_INFINITY) ||
    EFFORT_ORDER.indexOf(left.effort) - EFFORT_ORDER.indexOf(right.effort));
  return { ...eligible[0], source: "empirical" };
}

function candidateFor(model, route, profile, routeContext) {
  const fit = taskFit(model, profile);
  const roleScore = Number.isFinite(model.role_scores?.[profile.role]) ? model.role_scores[profile.role] : model.quality_rank || 0;
  const preferredScores = profile.preferredCapabilities.map((capability) =>
    capabilityScore(model, capability, roleScore));
  const preferenceGaps = capabilityEvidenceGaps(model, profile.preferredCapabilities);
  const requirementGaps = capabilityEvidenceGaps(model, profile.requiredCapabilities);
  const confidence = Number(((modelEvidence(model, profile) + route.evidenceScore) / 2).toFixed(3));
  const effort = chooseCandidateEffort(model, profile, routeContext);
  return {
    model: model.id,
    alias: model.alias || model.id,
    provider: model.provider,
    route: route.route,
    surface: route.surface,
    availability: route.availability,
    effort: effort.effort,
    effort_control: providerEffortControl(model, effort.effort),
    effort_source: effort.source,
    parallelism: profile.parallelism,
    task_fit: fit,
    preferred_capability_score: preferredScores.length ? Number(mean(preferredScores, roleScore).toFixed(2)) : null,
    preference_gaps: preferenceGaps,
    requirement_gaps: requirementGaps,
    evidence_confidence: confidence,
    performance_calibrated: optimizationEligible(effort.performance),
    predicted_success: Number.isFinite(effort.performance?.predicted_success)
      ? effort.performance.predicted_success : null,
    expected_verified_tokens: Number.isFinite(effort.performance?.expected_verified_tokens)
      ? effort.performance.expected_verified_tokens : null,
    median_duration_ms: Number.isFinite(effort.performance?.median_duration_ms)
      ? effort.performance.median_duration_ms : null,
    cost_class: model.cost_class || "top",
    latency_class: model.latency_class || "balanced",
    warnings: route.warnings,
  };
}

function headroomWidth(balance) {
  return Number.isFinite(balance?.hysteresisPercent) && balance.hysteresisPercent > 0 ? balance.hysteresisPercent : 10;
}

// The empirical "cost to verified completion" key for one candidate (DEC-198). A calibrated candidate
// (>= the sample floor) contributes its measured value; an uncalibrated one gets +Infinity, so it
// sorts BEHIND any calibrated (empirically-proven-efficient) candidate while uncalibrated candidates
// keep their prior order among themselves (both +Infinity => tie => fall through). Making this a
// per-element key — rather than a comparison applied only to calibrated PAIRS — is what makes the
// candidate comparator a strict TOTAL ORDER. The old pair-conditional form was non-transitive when a
// group mixed calibrated and uncalibrated candidates (Codex review 2026-07-16).
function empiricalKey(candidate, field) {
  return candidate.performance_calibrated && Number.isFinite(candidate[field]) ? candidate[field] : Number.POSITIVE_INFINITY;
}

// Strict total order over equivalent-capability candidates: empirical tokens, then empirical latency
// (both per-element, +Infinity for uncalibrated — never Infinity-minus-Infinity), then the ratified
// prior (evidence, cost, latency class, task fit), then the unique model id as the final tiebreak.
export function compareCandidates(a, b) {
  const at = empiricalKey(a, "expected_verified_tokens");
  const bt = empiricalKey(b, "expected_verified_tokens");
  if (at !== bt) return at < bt ? -1 : 1;
  const al = empiricalKey(a, "median_duration_ms");
  const bl = empiricalKey(b, "median_duration_ms");
  if (al !== bl) return al < bl ? -1 : 1;
  return b.evidence_confidence - a.evidence_confidence ||
    (COST_ORDER[a.cost_class] ?? 9) - (COST_ORDER[b.cost_class] ?? 9) ||
    (LATENCY_ORDER[a.latency_class] ?? 9) - (LATENCY_ORDER[b.latency_class] ?? 9) ||
    b.task_fit - a.task_fit || a.model.localeCompare(b.model);
}

// FR-278/DEC-213 (draft, dormant unless policy.selection.quota_balance.enabled): among
// capability-equivalent candidates, prefer the provider lane with MORE remaining weekly headroom.
// Balancing is applied per equivalent GROUP as a single boolean decision (not a pairwise tolerance),
// which is what keeps the comparator a TOTAL ORDER — a pairwise "gap > hysteresis" test is non-transitive
// with 3+ providers (Codex review 2026-07-16). A group is balanced ONLY when (a) enabled, (b) every
// candidate has a fresh finite reading (partial telemetry => skip), and (c) the group's headroom SPREAD
// (max-min) exceeds the hysteresis band — so a group whose providers are all within hysteresis of each
// other is treated as tied and never reordered (noise immunity; e.g. 80 vs 79.9 alone does not reorder).
// When balanced, order is exact remaining-headroom descending. Provider-NEUTRAL: measured capacity, not
// identity. The downstream ordering is `compareCandidates`, a strict per-element total order (the former
// pair-conditional empirical branch that was non-transitive for mixed calibrated/uncalibrated groups is
// now fixed there).
export function rankCandidates(candidates, equivalentMargin, balance = null) {
  const remaining = [...candidates].sort((a, b) => b.task_fit - a.task_fit || a.model.localeCompare(b.model));
  const ranked = [];
  const width = balance?.enabled ? headroomWidth(balance) : 0;
  while (remaining.length) {
    const best = remaining[0].task_fit;
    const equivalent = remaining.filter((candidate) => best - candidate.task_fit <= equivalentMargin);
    const ids = new Set(equivalent.map((candidate) => `${candidate.model}|${candidate.route}`));
    // Balance only if enabled, every candidate has a fresh finite reading, AND the group's headroom
    // spread is meaningful (> hysteresis). All three make `applyHeadroom` a per-group constant, so the
    // sort below is a total order.
    let applyHeadroom = false;
    if (balance?.enabled && equivalent.every((c) => {
      const h = balance.headroom?.[c.provider];
      return h?.fresh === true && Number.isFinite(h.remaining_percent);
    })) {
      const vals = equivalent.map((c) => balance.headroom[c.provider].remaining_percent);
      applyHeadroom = (Math.max(...vals) - Math.min(...vals)) > width;
    }
    equivalent.sort((a, b) => {
      if (applyHeadroom) {
        const delta = balance.headroom[b.provider].remaining_percent - balance.headroom[a.provider].remaining_percent;
        if (delta) return delta; // more remaining ranks first (exact, transitive)
      }
      return compareCandidates(a, b);
    });
    ranked.push(...equivalent);
    for (let index = remaining.length - 1; index >= 0; index--) {
      if (ids.has(`${remaining[index].model}|${remaining[index].route}`)) remaining.splice(index, 1);
    }
  }
  return ranked;
}

function explicitBlackState(models, diagnostics, ledger, quota) {
  if (quota && (ledger.budgets || []).length && (ledger.budgets || []).every((budget) =>
    quota[budget.id] === "exhausted" || quota[budget.provider] === "exhausted")) return true;
  if (!models.length || !diagnostics.length) return false;
  const text = diagnostics.flatMap((item) => item.reasons).join(" ");
  if (/unknown|missing|expired/i.test(text)) return false;
  return diagnostics.every((item) => item.reasons.length && item.reasons.some((reason) =>
    /exhausted|not_entitled|hard-forbidden|not allowed|unsafe billing|incompatible auth/i.test(reason)));
}

function decisionWarnings(selected, diagnostics) {
  const warnings = [...(selected?.warnings || [])];
  if (selected?.availability === "attemptable") {
    warnings.unshift(`selected route '${selected.route}' has unknown maintenance telemetry but is safely attemptable with verified subscription authentication`);
  }
  if (diagnostics.some((item) => item.reasons.some((reason) => /hard-forbidden|subscription_credits|api_metered/i.test(reason)))) {
    warnings.push("metered/API/credit routes were excluded by policy");
  }
  if (diagnostics.length) {
    warnings.push(`excluded routes: ${diagnostics.map((item) =>
      `${item.model}${item.route ? `@${item.route}` : ""}: ${item.reasons.join(", ")}`).join(" | ")}`);
  }
  return [...new Set(warnings)];
}

export function select(rawRequest, ledger) {
  const request = rawRequest || {};
  const entrySurface = request.entrySurface || request.surface;
  if (entrySurface != null) assertEnum(entrySurface, SURFACES, "entry surface");
  assertQuota(request.quota);
  const profile = profileTask({ ...request, capabilities: request.capabilities || request.requiredCapabilities }, ledger);
  const role = profile.role;
  const routeRequest = {
    role,
    taskClass: request.taskClass || role,
    fanoutWidth: profile.parallelism.units,
    now: request.routeContext?.now,
  };
  const floorModels = (ledger.models || []).filter((model) => isCurrent(model) && qualifiedForRequest(model, profile));
  const eligibleModels = floorModels.filter((model) =>
    !laneExplicitlyExhausted(model, request.quota) &&
    !(role === "independent-review" && profile.authorProvider && model.provider === profile.authorProvider));
  const diagnostics = [];
  const candidates = [];
  for (const model of eligibleModels) {
    const routes = routeCandidates(model, request.routeContext || null, routeRequest);
    for (const route of routes) {
      if (route.routable) {
        const candidate = candidateFor(model, route, profile, request.routeContext);
        if (profile.qualityFloor != null && candidate.task_fit < profile.qualityFloor) {
          diagnostics.push({ model: model.id, route: route.route,
            reasons: [`task fit ${candidate.task_fit} is below quality floor ${profile.qualityFloor}`] });
        } else candidates.push(candidate);
      }
      else diagnostics.push({ model: model.id, route: route.route, reasons: route.reasons });
    }
  }
  const policy = request.routeContext?.policy || null;
  const equivalentMargin = Number.isFinite(policy?.selection?.equivalent_capability_margin)
    ? policy.selection.equivalent_capability_margin : 2;
  // FR-278/DEC-213: quota load-balancing tiebreak — dormant unless the policy block is enabled AND
  // observation state is reachable. Absent/disabled => balance stays null => ranking is unchanged.
  const balanceCfg = policy?.selection?.quota_balance;
  let balance = null;
  if (balanceCfg?.enabled && request.routeContext?.store) {
    balance = {
      enabled: true,
      hysteresisPercent: Number.isFinite(balanceCfg.hysteresis_percent) ? balanceCfg.hysteresis_percent : 10,
      headroom: buildQuotaHeadroom({
        store: request.routeContext.store,
        policy,
        now: request.routeContext.now,
        maxAgeSeconds: Number.isFinite(balanceCfg.freshness_max_age_seconds) ? balanceCfg.freshness_max_age_seconds : null,
      }),
    };
  }
  const ranked = rankCandidates(candidates, equivalentMargin, balance);
  if (!ranked.length) {
    const noReviewer = role === "independent-review";
    const allFloorModelsQuotaExhausted = floorModels.length > 0 &&
      floorModels.every((model) => laneExplicitlyExhausted(model, request.quota));
    const blackState = allFloorModelsQuotaExhausted || explicitBlackState(floorModels, diagnostics, ledger, request.quota);
    let detail;
    if (diagnostics.length) {
      detail = diagnostics.map((item) =>
        `${item.model}${item.route ? `@${item.route}` : ""}: ${item.reasons.join(", ")}`).join(" | ");
    } else if (!floorModels.length) {
      detail = "no model clears the task-quality floor";
    } else if (!eligibleModels.length) {
      const quotaExcluded = floorModels.filter((model) => laneExplicitlyExhausted(model, request.quota));
      const providerExcluded = floorModels.filter((model) =>
        role === "independent-review" && profile.authorProvider && model.provider === profile.authorProvider);
      const exclusions = [
        quotaExcluded.length ? `known quota exhaustion (${quotaExcluded.map((model) => model.id).join(", ")})` : null,
        providerExcluded.length ? `independent-review provider constraint (${providerExcluded.map((model) => model.id).join(", ")})` : null,
      ].filter(Boolean);
      detail = `floor-clearing models were excluded by ${exclusions.join(" and ") || "task constraints"}`;
    } else {
      detail = "floor-clearing models have no executable route candidates";
    }
    const reason = blackState
      ? `BLACK-STATE: every qualified safe route is explicitly unavailable or exhausted. ${detail}`
      : `Routing unavailable without inferring BLACK-STATE. ${detail}`;
    return {
      status: noReviewer ? "review-pending" : "blocked",
      model: null,
      selected: null,
      fallbacks: [],
      requirements: profile,
      role,
      entry_surface: entrySurface || null,
      review_required_before: reviewRequiredBefore(profile),
      reviewPending: noReviewer,
      blackState,
      reason,
      warnings: [],
    };
  }
  const [selected, ...fallbacks] = ranked;
  validateChoice(selected, { profile, routeContext: request.routeContext, quota: request.quota }, ledger);
  const warnings = decisionWarnings(selected, diagnostics);
  const requirementGapNotes = profile.requiredCapabilities.length
    ? floorModels
      .map((model) => ({ id: model.id, gaps: capabilityEvidenceGaps(model, profile.requiredCapabilities) }))
      .filter((item) => item.gaps.length)
    : [];
  if (requirementGapNotes.length) {
    warnings.push("required-capability evidence gaps were penalized, NOT excluded (absence of registry " +
      `evidence is a calibration debt, not evidence of absence): ${requirementGapNotes
        .map((item) => `${item.id}: ${item.gaps.join("+")}`).join(" | ")}`);
  }
  const theoreticalBest = Math.max(...floorModels.map((model) => taskFit(model, profile)));
  const degradationReasons = [];
  if (selected.requirement_gaps?.length) {
    degradationReasons.push("selected model lacks direct evidence for REQUIRED capabilities " +
      `(ranked with the missing-data penalty): ${selected.requirement_gaps.join(", ")} — calibrate before trusting the fit number`);
  }
  if (selected.preference_gaps.length) {
    degradationReasons.push(`selected model lacks direct evidence for preferred capabilities: ${selected.preference_gaps.join(", ")}`);
  }
  if (Number.isFinite(theoreticalBest) && theoreticalBest - selected.task_fit > equivalentMargin) {
    degradationReasons.push(`a higher-fit qualified model is unavailable (${theoreticalBest} vs ${selected.task_fit})`);
  }
  return {
    status: "routable",
    selected,
    fallbacks,
    requirements: profile,
    review_required_before: reviewRequiredBefore(profile),
    warnings,
    degraded: degradationReasons.length > 0,
    degradation_reasons: degradationReasons,
    entry_surface: entrySurface || null,
    requested_identity: { model: selected.model, route: selected.route },
    // Compatibility projection for existing callers. New code consumes selected.
    model: selected.model,
    alias: selected.alias,
    provider: selected.provider,
    route: selected.route,
    surface: selected.surface,
    effort: selected.effort,
    effort_control: selected.effort_control,
    evidenceScore: selected.evidence_confidence,
    role,
    rationale: `global task-fit ranking selected ${selected.alias}; provider identity was not a ranking input.`,
  };
}

export function formatCompactDecision(decision) {
  if (!decision || typeof decision !== "object") throw new Error("compact decision requires a selector result");
  if (decision.status !== "routable") {
    return `${decision.status} → ${decision.role || "unknown-role"} → ${decision.reason || "routing unavailable"}`;
  }
  const selected = decision.selected;
  const fallbacks = (decision.fallbacks || []).map((item) => item.alias || item.model).join("→") || "none";
  const review = decision.review_required_before ? `; review before ${decision.review_required_before}` : "";
  const degraded = decision.degraded ? "; degraded" : "";
  const warnings = decision.warnings?.length ? `; warnings ${decision.warnings.length}` : "";
  const parallel = selected.parallelism?.mode === "fan-out" ? `×${selected.parallelism.units}` : "";
  return `${decision.role} → ${selected.alias || selected.model}@${selected.effort}${parallel}; fallbacks ${fallbacks}${review}${degraded}${warnings}`;
}

export function formatDecisionExplanation(decision) {
  if (!decision || typeof decision !== "object") throw new Error("decision explanation requires a selector result");
  if (decision.status !== "routable") {
    return [`Status: ${decision.status}`, `Role: ${decision.role || "unknown"}`,
      `Why: ${decision.reason || "routing unavailable"}`].join("\n");
  }
  const selected = decision.selected;
  const profile = decision.requirements || {};
  const preferred = profile.preferredCapabilities?.length ? profile.preferredCapabilities.join(", ") : "none";
  const required = profile.requiredCapabilities?.length ? profile.requiredCapabilities.join(", ") : "none";
  const empirical = selected.performance_calibrated
    ? ` Empirical prediction: ${selected.predicted_success} success, ${selected.expected_verified_tokens} expected tokens to verified completion.`
    : " Empirical optimization is not calibrated for this model/role/effort yet.";
  const why = `task fit ${selected.task_fit}, evidence ${selected.evidence_confidence}, preferred capability score ${selected.preferred_capability_score ?? "n/a"}.${empirical}`;
  const fallbackText = (decision.fallbacks || []).map((item) =>
    `${item.alias || item.model}@${item.effort} (fit ${item.task_fit})`).join("; ") || "none";
  const lines = [
    `Selected: ${selected.alias || selected.model}@${selected.effort} via ${selected.route}`,
    `Task profile: ${profile.operation}/${profile.artifact}/${profile.stage}; role ${profile.role}; stakes ${profile.stakes}; required ${required}; preferred ${preferred}`,
    `Why: ${why}`,
    `Fallbacks: ${fallbackText}`,
  ];
  if (decision.degraded) lines.push(`Degraded: ${decision.degradation_reasons.join("; ")}`);
  if (decision.review_required_before) lines.push(`Review required before: ${decision.review_required_before}`);
  if (decision.warnings?.length) lines.push(`Warnings: ${decision.warnings.join(" | ")}`);
  return lines.join("\n");
}

export function validateChoice(choice, request, ledger) {
  const modelId = choice.model || choice.id;
  const model = (ledger.models || []).find((item) => item.id === modelId);
  if (!model) throw new Error(`selector chose '${modelId}', not in ledger`);
  if (!isCurrent(model)) throw new Error(`selector chose '${modelId}', status=${model.status}`);
  const profile = request.profile || profileTask(request, ledger);
  if (!qualifiedForRequest(model, profile)) throw new Error(`selector chose '${modelId}', not qualified for ${profile.role}`);
  if (profile.role === "independent-review" && profile.authorProvider && model.provider === profile.authorProvider) {
    throw new Error(`selector chose '${modelId}', same provider as author '${profile.authorProvider}' — not independent`);
  }
  if (request.quota && laneExplicitlyExhausted(model, request.quota)) throw new Error(`selector chose '${modelId}', lane exhausted`);
  if (choice.route && request.routeContext) {
    const evaluation = routeEvaluations(model, request.routeContext, { role: profile.role, taskClass: profile.role })
      .find((item) => item.route.id === choice.route);
    if (!evaluation?.routable) throw new Error(`selector chose '${modelId}', route '${choice.route}' is unavailable`);
  }
  return true;
}

// FR-224 role-qualification gate shared with model-os-gate.mjs's validateLaunch (the PreToolUse
// hook for Agent/Workflow launches). dispatch.mjs — the sanctioned Bash entry point for
// cross-provider work — has no PreToolUse hook in front of it, so it must apply the SAME
// role/calibre discipline itself; otherwise a hand-built decision JSON can launch any model
// with no role justification, laundering around a launch the gate would have blocked.
// Returns a refusal string, or null when the role/model/calibre combination is acceptable.
export function checkRoleQualification({ role, model, ledger, calibreReason } = {}) {
  const roleNames = Object.keys((ledger && ledger.roles) || {});
  if (!role) {
    return "no ledger role declared: pass decision.role (from select.mjs) or an explicit --role";
  }
  if (roleNames.length && !roleNames.includes(role)) {
    return `role '${role}' is not in the ledger (known: ${roleNames.join(", ")})`;
  }
  if (!model) return null; // no resolved model entry yet — nothing further to check
  if (Array.isArray(model.roles_qualified) && !model.roles_qualified.includes(role)) {
    return `'${model.id || model.alias}' is not qualified for role '${role}' ` +
      `(roles_qualified: ${model.roles_qualified.join(", ") || "none"})`;
  }
  if (model.requires_calibre_line) {
    const reason = typeof calibreReason === "string" ? calibreReason.trim() : "";
    if (!/[A-Za-z]{3}/.test(reason)) {
      return `'${model.id || model.alias}' is a top-cost tier and needs --calibre-reason ` +
        '"<one-line why this needs the top tier>" (mirrors the gate\'s calibre-line rule)';
    }
  }
  return null;
}

export function clearRoutingCache() { ROUTE_CACHE.clear(); }

function cachedRouteContext({ ledgerPath, policyPath, stateDir, cacheMs = 1000 }) {
  const key = JSON.stringify([ledgerPath, policyPath, stateDir]);
  const cached = ROUTE_CACHE.get(key);
  if (cached && Date.now() - cached.at < cacheMs) return cached.value;
  const value = loadRouteContext({ ledgerPath, policyPath, stateDir });
  ROUTE_CACHE.set(key, { at: Date.now(), value });
  return value;
}

// Kept as the compatibility name used by hooks/tests. Refresh is deliberately
// absent from the hot path: discovery/quota observers update state separately,
// while this function reads the last-known-good registry and cached facts.
export async function selectWithRouteRefresh(request, ledger, options = {}) {
  const ledgerPath = options.ledgerPath || null;
  const policyPath = options.policyPath || findPolicy(ledgerPath);
  const hasRoutes = ledger.route_state_activation !== "deferred-until-observers" &&
    (ledger.models || []).some((model) => Array.isArray(model.access_routes) && model.access_routes.length);
  const routeContext = hasRoutes
    ? (options.routeContextLoader
      ? await options.routeContextLoader({ ledgerPath, policyPath, stateDir: options.stateDir })
      : cachedRouteContext({ ledgerPath, policyPath, stateDir: options.stateDir, cacheMs: options.cacheMs }))
    : null;
  const decision = select({ ...request, routeContext }, ledger);
  decision.maintenance = { refresh: "off-hot-path", roster: "last-known-good" };
  return decision;
}

function shadowLog(decision, request, sessionModel, stateDir, maxEntries) {
  try {
    const dir = stateDir || process.env.MODEL_OS_STATE_DIR || path.join(os.homedir(), ".model-os");
    if (!existsSync(dir)) return;
    appendBoundedJsonl({ stateDir: dir, fileName: "shadow.log.jsonl", maxEntries, row: {
      at: new Date().toISOString(), profile: decision.requirements, entry_surface: request.entrySurface || request.surface || null,
      session_model: sessionModel, selected_model: decision.selected?.model || null, selected_provider: decision.selected?.provider || null,
      effort: decision.selected?.effort || null, effort_control: decision.selected?.effort_control || null,
    } });
  } catch { /* evidence logging must never block routing */ }
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

function readJsonArg(args, name) {
  const inline = args[`${name}-json`];
  const file = args[`${name}-file`];
  if (inline && file) throw new Error(`use only one of --${name}-json or --${name}-file`);
  if (!inline && !file) return {};
  return JSON.parse(file ? readFileSync(path.resolve(file), "utf8") : inline);
}

export async function main(argv = process.argv.slice(2)) {
  const startedAt = Date.now();
  const runId = randomUUID();
  const args = parseArgs(argv);
  const ledgerPath = args.ledger || findLedger();
  if (!ledgerPath) throw new Error("no ledger found (set MODEL_OS_LEDGER or pass --ledger)");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const profile = readJsonArg(args, "profile");
  const request = {
    ...profile,
    role: args.role || profile.role,
    entrySurface: args.surface || profile.entrySurface,
    taskText: args["task-text"] || profile.taskText,
    operation: args.operation || profile.operation,
    artifact: args.artifact || profile.artifact,
    authority: args.authority || profile.authority,
    stage: args.stage || profile.stage,
    stakes: args.stakes || profile.stakes,
    effort: args.effort || profile.effort,
    reasoningEffort: args["reasoning-effort"] || profile.reasoningEffort,
    effortJustification: args["effort-justification"] || profile.effortJustification,
    authorProvider: args["author-provider"] || profile.authorProvider,
    independentReview: args["independent-review"] === true || profile.independentReview,
    requiredCapabilities: args.capabilities ? String(args.capabilities).split(",").map((item) => item.trim()).filter(Boolean) : profile.requiredCapabilities,
    preferredCapabilities: args["preferred-capabilities"]
      ? String(args["preferred-capabilities"]).split(",").map((item) => item.trim()).filter(Boolean)
      : profile.preferredCapabilities,
    qualityFloor: args["quality-floor"] == null ? profile.qualityFloor : Number(args["quality-floor"]),
    reviewArtifactType: args["review-artifact-type"] || profile.reviewArtifactType,
    decomposable: args.decomposable === true || profile.decomposable,
    parallelUnits: args["parallel-units"] == null ? profile.parallelUnits : Number(args["parallel-units"]),
    quota: args.quota ? JSON.parse(args.quota) : profile.quota,
  };
  const policyPath = args.policy || findPolicy(ledgerPath);
  const decision = await selectWithRouteRefresh(request, ledger, {
    ledgerPath, policyPath, stateDir: args["state-dir"], cacheMs: args["cache-ms"] == null ? 1000 : Number(args["cache-ms"]),
  });
  if (telemetryEnabled() && args["no-telemetry"] !== true) {
    try {
      const maxEntries = readPolicy(policyPath)?.retention?.run_telemetry_max_entries || 2000;
      appendTelemetryEvent({ run_id: runId, at: new Date().toISOString(), component: "selection",
        event: "selection.completed", status: "completed", duration_ms: Date.now() - startedAt,
        profile_hash: hashOperationalValue(decision.requirements || request),
        selected_model: decision.selected?.model || null, route_id: decision.selected?.route || null,
        role: decision.role || decision.requirements?.role || null, effort: decision.effort || decision.selected?.effort || null,
        fallback_count: decision.fallbacks?.length || 0, warning_count: decision.warnings?.length || 0,
        selection_basis: decision.selected?.performance_calibrated ? "empirical-expected-verified-tokens" : "registry-task-fit-prior",
        ...(Number.isFinite(decision.selected?.task_fit) ? { task_fit: decision.selected.task_fit } : {}),
        ...(Number.isFinite(decision.selected?.evidence_confidence) ? { evidence_confidence: decision.selected.evidence_confidence } : {}),
        ...(Number.isFinite(decision.selected?.predicted_success) ? { predicted_success: decision.selected.predicted_success } : {}),
        ...(Number.isFinite(decision.selected?.expected_verified_tokens) ? { expected_verified_tokens: decision.selected.expected_verified_tokens } : {}),
      }, { stateDir: args["state-dir"], maxEntries });
    } catch { /* telemetry never changes selection */ }
  }
  if (args["session-model"]) {
    let maxEntries = 1000;
    try { maxEntries = readPolicy(policyPath)?.retention?.shadow_log_max_entries || maxEntries; } catch {}
    shadowLog(decision, request, args["session-model"], args["state-dir"], maxEntries);
  }
  if (args.compact === true && args.explain === true) throw new Error("use only one of --compact or --explain");
  if (args.compact === true) process.stdout.write(formatCompactDecision(decision) + "\n");
  else if (args.explain === true) process.stdout.write(formatDecisionExplanation(decision) + "\n");
  else process.stdout.write(JSON.stringify(decision, null, args.json === true ? 2 : 0) + "\n");
  return EXIT[decision.status] ?? 3;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    if (telemetryEnabled()) {
      try {
        const args = parseArgs(process.argv.slice(2));
        appendTelemetryEvent({ run_id: randomUUID(), at: new Date().toISOString(), component: "selection",
          event: "selection.failed", status: "failed", duration_ms: 0, reason_code: telemetryReason(error, "selection-failed") },
        { stateDir: args["state-dir"], maxEntries: 2000 });
      } catch { /* telemetry never masks the selector error */ }
    }
    process.stderr.write(`MODEL-OS select error: ${error.message}\n`);
    process.exitCode = 3;
  });
}
