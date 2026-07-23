// Shared MODEL-OS compatibility contract. A schema bump is independent per
// artifact and must be taught here before any runtime accepts the new shape.

export const SUPPORTED_SCHEMA_VERSIONS = Object.freeze({ ledger: 2, policy: 1, observations: 1 });
export const SUPPORTED_MODEL_OS_MAJOR = 2;
export const CONFIDENCE_LEVELS = new Set(["low", "medium", "high"]);
export const QUOTA_STATES = new Set(["green", "amber", "red", "exhausted"]);
export const SURFACES = new Set(["claude-code", "codex"]);
export const ACCESS_METHODS = new Set(["session", "agent-model-param", "codex-session", "codex-exec-cli"]);
export const AUTH_MODES = new Set(["claude_ai_subscription", "chatgpt_subscription"]);
export const ZERO_SPEND_BILLING_MODES = new Set(["subscription_included", "api_free_quota", "local_compute"]);
export const BILLING_MODES = new Set([...ZERO_SPEND_BILLING_MODES, "subscription_credits", "api_metered"]);
export const QUOTA_ADAPTERS = new Set(["claude-statusline-rate-limits", "codex-app-server-rate-limits"]);
export const DISCOVERY_ADAPTERS = new Set([
  "codex-app-server-model-list",
  "claude-bounded-probe-only",
  "anthropic-models-api",
  "openai-models-api",
]);
export const ROUTING_EVIDENCE_FACTS = new Set(["catalog", "entitlement", "spend_guard", "quota"]);
export const ABSTRACT_EFFORTS = new Set(["low", "medium", "high", "maximum", "multi-agent"]);
export const PROVIDER_EFFORTS = new Set(["low", "medium", "high", "xhigh", "max", "ultra"]);
export const LATENCY_CLASSES = new Set(["fast", "balanced", "slow"]);

function requireVersion(value, expected, label) {
  if (value !== expected) throw new Error(`${label} schema_version ${value ?? "missing"} unsupported (expected ${expected})`);
}

export function validatePolicyCompatibility(policy) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) throw new Error("policy must be an object");
  requireVersion(policy.schema_version, SUPPORTED_SCHEMA_VERSIONS.policy, "policy");
  const policyMajor = Number.parseInt(String(policy.version || "").split(".")[0], 10);
  if (policyMajor !== SUPPORTED_MODEL_OS_MAJOR) {
    throw new Error(`policy version '${policy.version ?? "missing"}' incompatible with MODEL-OS major ${SUPPORTED_MODEL_OS_MAJOR}`);
  }
  for (const [resourceId, resource] of Object.entries(policy.quota_resources || {})) {
    if (!QUOTA_ADAPTERS.has(resource?.adapter)) {
      throw new Error(`quota adapter '${resource?.adapter || "missing"}' unsupported for resource '${resourceId}'`);
    }
    if (typeof resource.capacity_observation !== "string" || !resource.capacity_observation) {
      throw new Error(`quota resource '${resourceId}' capacity_observation missing`);
    }
  }
  for (const source of policy.discovery?.sources || []) {
    if (!DISCOVERY_ADAPTERS.has(source?.adapter)) {
      throw new Error(`discovery adapter '${source?.adapter || "missing"}' unsupported for source '${source?.id || "unknown"}'`);
    }
  }
  for (const mode of [...(policy.billing?.autonomous_allowed_modes || []),
    ...(policy.billing?.hard_forbidden_modes || [])]) {
    if (!BILLING_MODES.has(mode)) throw new Error(`policy billing mode '${mode}' unsupported`);
  }
  const evidence = policy.routing_evidence;
  if (evidence != null) {
    for (const confidence of CONFIDENCE_LEVELS) {
      const weight = evidence.confidence_weights?.[confidence];
      if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
        throw new Error(`routing evidence confidence weight '${confidence}' must be between 0 and 1`);
      }
    }
    if (!Array.isArray(evidence.provenance_weights) || evidence.provenance_weights.length === 0) {
      throw new Error("routing evidence provenance_weights must be a non-empty array");
    }
    for (const item of evidence.provenance_weights) {
      if (typeof item?.prefix !== "string" || !item.prefix || !Number.isFinite(item.weight) || item.weight < 0 || item.weight > 1) {
        throw new Error("routing evidence provenance entries require a prefix and weight between 0 and 1");
      }
    }
    if (!Number.isFinite(evidence.default_provenance_weight) || evidence.default_provenance_weight < 0 ||
        evidence.default_provenance_weight > 1) {
      throw new Error("routing evidence default_provenance_weight must be between 0 and 1");
    }
    for (const fact of ROUTING_EVIDENCE_FACTS) {
      const minimum = evidence.minimum_fact_scores?.[fact];
      if (!Number.isFinite(minimum) || minimum < 0 || minimum > 1) {
        throw new Error(`routing evidence minimum '${fact}' must be between 0 and 1`);
      }
    }
  }
  if (policy.dispatch != null && (!Number.isInteger(policy.dispatch.background_threshold_ms) || policy.dispatch.background_threshold_ms < 1)) {
    throw new Error("policy dispatch.background_threshold_ms must be a positive integer");
  }
  if (policy.maintenance != null) {
    for (const key of ["freshness_lead_seconds", "reset_delay_seconds", "max_poll_seconds", "daemon_max_runtime_seconds"]) {
      if (!Number.isInteger(policy.maintenance[key]) || policy.maintenance[key] < 0) {
        throw new Error(`policy maintenance.${key} must be a non-negative integer`);
      }
    }
    if (policy.maintenance.max_poll_seconds < 1 || policy.maintenance.daemon_max_runtime_seconds < 1) {
      throw new Error("policy maintenance poll/runtime values must be positive");
    }
  }
  if (policy.quota_recovery != null) {
    const recovery = policy.quota_recovery;
    if (typeof recovery.enabled !== "boolean") throw new Error("policy quota_recovery.enabled must be boolean");
    if (!Array.isArray(recovery.passive_adapters) || recovery.passive_adapters.length === 0 ||
        recovery.passive_adapters.some((adapter) => !QUOTA_ADAPTERS.has(adapter))) {
      throw new Error("policy quota_recovery.passive_adapters must contain supported adapters");
    }
    for (const key of ["initial_retry_seconds", "max_retry_seconds", "reset_delay_seconds", "max_reset_horizon_seconds", "max_probes_per_cycle"]) {
      if (!Number.isInteger(recovery[key]) || recovery[key] < 0) {
        throw new Error(`policy quota_recovery.${key} must be a non-negative integer`);
      }
    }
    if (recovery.initial_retry_seconds < 60 || recovery.max_retry_seconds < recovery.initial_retry_seconds ||
        recovery.max_retry_seconds > 86400) {
      throw new Error("policy quota_recovery retry bounds must be ordered between 60 seconds and one day");
    }
    if (!Number.isFinite(recovery.backoff_multiplier) || recovery.backoff_multiplier < 1 ||
        recovery.backoff_multiplier > 10) {
      throw new Error("policy quota_recovery.backoff_multiplier must be between 1 and 10");
    }
    if (recovery.max_probes_per_cycle < 1 || recovery.max_probes_per_cycle > 10) {
      throw new Error("policy quota_recovery.max_probes_per_cycle must be between 1 and 10");
    }
    if (recovery.require_machine_spend_guard !== true) {
      throw new Error("policy quota recovery requires a machine-verified spend guard");
    }
  }
  if (policy.phase_routing != null) {
    if (typeof policy.phase_routing.enabled !== "boolean") throw new Error("policy phase_routing.enabled must be boolean");
    if (!Number.isInteger(policy.phase_routing.max_switches) || policy.phase_routing.max_switches < 0) {
      throw new Error("policy phase_routing.max_switches must be a non-negative integer");
    }
    if (!Number.isFinite(policy.phase_routing.hysteresis_tokens) || policy.phase_routing.hysteresis_tokens < 0) {
      throw new Error("policy phase_routing.hysteresis_tokens must be a non-negative number");
    }
  }
  if (policy.calibration != null) {
    if (typeof policy.calibration.enabled !== "boolean") throw new Error("policy calibration.enabled must be boolean");
    if (typeof policy.calibration.benchmark_version !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,119}$/.test(policy.calibration.benchmark_version)) {
      throw new Error("policy calibration.benchmark_version must be a bounded identifier");
    }
    if (!Number.isFinite(policy.calibration.max_shadow_fraction) || policy.calibration.max_shadow_fraction < 0 ||
        policy.calibration.max_shadow_fraction > 0.25) {
      throw new Error("policy calibration.max_shadow_fraction must be between 0 and 0.25");
    }
    if (!Number.isInteger(policy.calibration.max_runs_per_cycle) || policy.calibration.max_runs_per_cycle < 0 ||
        policy.calibration.max_runs_per_cycle > 20) {
      throw new Error("policy calibration.max_runs_per_cycle must be an integer between 0 and 20");
    }
    if (policy.calibration.require_deterministic_verifier !== true) {
      throw new Error("policy calibration requires a deterministic verifier");
    }
  }
  if (policy.selection != null) {
    if (policy.selection.provider_identity_weight !== 0) throw new Error("policy selection provider_identity_weight must be zero");
    if (!Number.isFinite(policy.selection.equivalent_capability_margin) || policy.selection.equivalent_capability_margin < 0) {
      throw new Error("policy selection equivalent_capability_margin must be a non-negative number");
    }
    if (!Number.isInteger(policy.selection.empirical_optimization?.evidence_ttl_seconds) ||
        policy.selection.empirical_optimization.evidence_ttl_seconds < 1) {
      throw new Error("policy selection empirical_optimization.evidence_ttl_seconds must be a positive integer");
    }
  }
  if (policy.retention != null) {
    for (const key of ["verification_log_max_entries", "fallback_log_max_entries", "shadow_log_max_entries", "dispatch_receipt_max_entries",
      "outcome_max_entries", "run_telemetry_max_entries", "candidate_transition_max_entries", "candidate_watch_max_entries"]) {
      if (!Number.isInteger(policy.retention?.[key]) || policy.retention[key] < 1) {
        throw new Error(`policy retention '${key}' must be a positive integer`);
      }
    }
  }
  return true;
}

export function validateLedgerPolicyCompatibility(ledger, policy) {
  if (!ledger || typeof ledger !== "object" || Array.isArray(ledger)) throw new Error("ledger must be an object");
  requireVersion(ledger.schema_version, SUPPORTED_SCHEMA_VERSIONS.ledger, "ledger");
  if (ledger.version !== SUPPORTED_MODEL_OS_MAJOR) {
    throw new Error(`ledger version '${ledger.version ?? "missing"}' incompatible with MODEL-OS major ${SUPPORTED_MODEL_OS_MAJOR}`);
  }
  validatePolicyCompatibility(policy);
  if (policy.retention?.verification_log_max_entries != null && Array.isArray(ledger.verification_log) &&
      ledger.verification_log.length > policy.retention.verification_log_max_entries) {
    throw new Error(`ledger verification_log exceeds policy retention maximum ${policy.retention.verification_log_max_entries}`);
  }
  const roles = new Set(Object.keys(ledger.roles || {}));
  const modelIds = new Set();
  const routeIds = new Set();
  for (const model of ledger.models || []) {
    if (!model?.id || modelIds.has(model.id)) throw new Error(`ledger model id '${model?.id || "missing"}' is missing or duplicated`);
    modelIds.add(model.id);
    if (!Array.isArray(model.roles_qualified)) throw new Error(`model '${model.id}' roles_qualified array is required`);
    for (const role of model.roles_qualified || []) {
      if (!roles.has(role)) throw new Error(`model '${model.id}' names unknown role '${role}'`);
      if (!Number.isFinite(model.role_scores?.[role]) || model.role_scores[role] < 0 || model.role_scores[role] > 100) {
        throw new Error(`model '${model.id}' role_scores.${role} must be between 0 and 100`);
      }
      const evidence = model.capability_evidence?.roles?.[role];
      if (!evidence || !CONFIDENCE_LEVELS.has(evidence.confidence) || !Number.isFinite(Date.parse(evidence.as_of)) ||
          typeof evidence.source !== "string" || !evidence.source) {
        throw new Error(`model '${model.id}' capability evidence for '${role}' is incomplete`);
      }
    }
    if (typeof model.provider !== "string" || !model.provider) throw new Error(`model '${model.id}' provider is required`);
    if (!Array.isArray(model.weaknesses) || model.weaknesses.length === 0) throw new Error(`model '${model.id}' weaknesses are required`);
    if (!LATENCY_CLASSES.has(model.latency_class)) throw new Error(`model '${model.id}' latency_class is invalid`);
    if (!Array.isArray(model.supported_efforts) || model.supported_efforts.length === 0 ||
        model.supported_efforts.some((effort) => !PROVIDER_EFFORTS.has(effort))) {
      throw new Error(`model '${model.id}' supported_efforts are missing or invalid`);
    }
    for (const effort of ABSTRACT_EFFORTS) {
      const control = model.effort_controls?.[effort];
      if (!model.supported_efforts.includes(control)) throw new Error(`model '${model.id}' effort control '${effort}' is missing or unsupported`);
    }
    if (typeof model.execution_observations?.last_success !== "string" ||
        typeof model.execution_observations?.last_failure !== "string") {
      throw new Error(`model '${model.id}' execution observation keys are required`);
    }
    for (const route of model.access_routes || []) {
      if (!route?.id || routeIds.has(route.id)) throw new Error(`access route id '${route?.id || "missing"}' is missing or duplicated`);
      routeIds.add(route.id);
      if (!SURFACES.has(route.surface)) throw new Error(`route '${route.id}' surface '${route.surface || "missing"}' unsupported`);
      if (!AUTH_MODES.has(route.auth_mode)) throw new Error(`route '${route.id}' auth mode '${route.auth_mode || "missing"}' unsupported`);
      if (!BILLING_MODES.has(route.billing_mode)) throw new Error(`route '${route.id}' billing mode '${route.billing_mode || "missing"}' unsupported`);
      if (!Array.isArray(route.access_methods) || route.access_methods.length === 0) {
        throw new Error(`route '${route.id}' access_methods are required`);
      }
      for (const method of route.access_methods) {
        if (!ACCESS_METHODS.has(method)) throw new Error(`route '${route.id}' access method '${method}' unsupported`);
      }
      for (const resourceId of route.quota_resources || []) {
        if (!policy.quota_resources?.[resourceId]) throw new Error(`route '${route.id}' references unknown quota resource '${resourceId}'`);
        if (policy.quota_resources[resourceId].provider && route.provider !== policy.quota_resources[resourceId].provider) {
          throw new Error(`route '${route.id}' provider '${route.provider}' mismatches quota resource '${resourceId}' provider '${policy.quota_resources[resourceId].provider}'`);
        }
      }
    }
  }
  return true;
}
