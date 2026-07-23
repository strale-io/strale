#!/usr/bin/env node
// Pure Phase 2 discovery kernel. Provider adapters are injected; this module owns
// observation/candidate semantics and never writes registry or policy files.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { extractFamilyVersion, filterRelevant, idsMatch } from "./refresh-lib.mjs";
import { validateLedgerPolicyCompatibility } from "./schema.mjs";
import { cleanupObservationStore, effectiveObservation, getObservation, observationRetentionKeys, readObservationStore, writeObservations } from "./state-store.mjs";

const MAX_PAGES = 20;

function versionTuple(value) {
  const match = String(value || "").match(/\d+(?:\.\d+)+/);
  return match ? match[0].split(".").map(Number) : [];
}

export function compareVersions(left, right) {
  const a = versionTuple(left);
  const b = versionTuple(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) {
    const delta = (a[index] || 0) - (b[index] || 0);
    if (delta) return delta;
  }
  return 0;
}

export async function listModelsViaRpc(request) {
  const models = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await request("model/list", { cursor, limit: 100, includeHidden: true });
    for (const item of response?.data || []) {
      const id = item.model || item.id;
      if (!id) continue;
      models.push({
        id,
        catalog_id: item.id || null,
        displayName: item.displayName || null,
        hidden: Boolean(item.hidden),
        isDefault: Boolean(item.isDefault),
        defaultReasoningEffort: item.defaultReasoningEffort || null,
        supportedReasoningEfforts: (item.supportedReasoningEfforts || []).map((entry) =>
          typeof entry === "string" ? entry : entry.reasoningEffort).filter(Boolean),
      });
    }
    cursor = response?.nextCursor || null;
    if (!cursor) return models;
  }
  throw new Error(`model/list exceeded the ${MAX_PAGES}-page safety bound`);
}

function ttlFor(policy, kind) {
  const ttl = policy?.discovery?.source_ttl?.[kind];
  if (!Number.isFinite(ttl) || ttl <= 0) throw new Error(`discovery TTL '${kind}' missing or invalid in policy`);
  return ttl;
}

function policyCappedObservation(store, key, ttl, now) {
  const value = store?.observations?.[key] || null;
  const capped = value && Number(value.ttl) > ttl ? { ...value, ttl } : value;
  return effectiveObservation(capped, now);
}

function observation(state, now, source, confidence, ttl, extra = {}) {
  return { state, observed_at: now, source, confidence, ttl, ...extra };
}

function safeError(error) {
  return String(error?.message || error || "unknown error").replace(/[\r\n]+/g, " ").slice(0, 240);
}

export function normalizeVisibleText(body) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(body || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
      const lower = entity.toLowerCase();
      if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
      if (lower.startsWith("#")) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
      return named[lower] ?? match;
    })
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function environmentAllows(item, environment) {
  return !Array.isArray(item.environments) || item.environments.includes(environment);
}

function modelKey(namespace, id, prefix) {
  if (typeof namespace !== "string" || !namespace.trim()) {
    throw new Error("discovery source observation_namespace is required");
  }
  return `${prefix}:${namespace}:${id}`;
}

function candidateKey(source, id) {
  return `candidate:${source.id}:${id}`;
}

function candidateFact({ source, model, registered, acknowledged, previous, now, ttl }) {
  if (registered && !previous) return null;
  const state = registered?.lifecycle_state || (acknowledged ? "acknowledged" : "discovered");
  return observation(state, now, `machine:discovery:${source.id}`, registered ? "high" : "medium", ttl, {
    model_id: model.id,
    provider: source.provider,
    surface: source.surface,
    account_scope: source.account_scope,
    lifecycle_state: registered?.lifecycle_state || "discovered",
    first_observed_at: previous?.first_observed_at || now,
    last_observed_at: now,
    promotion: registered ? "registry-ratified" : acknowledged ? "founder-acknowledged-not-adopted" : null,
    catalog_metadata: model,
  });
}

async function collectSource({ source, adapter, ledger, store, now, policy }) {
  const writes = {};
  const ttl = ttlFor(policy, source.kind);
  const candidateTtl = ttlFor(policy, "candidate");
  const sourceKey = `discovery-source:${source.id}`;
  if (!adapter) {
    writes[sourceKey] = observation("unknown", now, `machine:discovery:${source.id}`, "low", ttl,
      { reason: `adapter '${source.adapter}' unavailable` });
    return { writes, summary: { id: source.id, state: "unknown", models: 0, reason: "adapter unavailable" } };
  }
  try {
    const result = await adapter(source);
    if (result?.status === "skipped") {
      writes[sourceKey] = observation("skipped", now, `machine:discovery:${source.id}`, "high", ttl,
        { reason: result.reason || "not applicable in this environment" });
      return { writes, summary: { id: source.id, state: "skipped", models: 0, reason: result.reason || null } };
    }
    if (result?.status && result.status !== "ok") throw new Error(result.reason || `adapter status ${result.status}`);
    const patterns = (source.model_patterns || []).map((pattern) => new RegExp(pattern));
    const models = (result?.models || []).filter((model) =>
      typeof model?.id === "string" && model.id &&
      (!patterns.length || patterns.some((pattern) => pattern.test(model.id))));
    writes[sourceKey] = observation("reachable", now, `machine:discovery:${source.id}`, "high", ttl,
      { model_count: models.length, method: result?.method || source.adapter });
    const providerModels = (ledger.models || []).filter((entry) => entry.provider === source.provider);
    const registeredModel = (id) => providerModels.find((entry) => idsMatch(entry.id, id));
    const relevance = filterRelevant(providerModels, models.map((model) => model.id)
      .filter((id) => !registeredModel(id)));
    const proposedIds = new Set([
      ...relevance.kept,
      ...relevance.newFamilies.flatMap((family) => family.ids),
    ]);
    let candidates = 0;
    for (const model of models) {
      const namespace = source.observation_namespace;
      writes[modelKey(namespace, model.id, "catalog")] = observation("present", now,
        `machine:discovery:${source.id}`, "high", ttl, { provider: source.provider, model_id: model.id });
      if (source.entitlement_signal) {
        const entitlementKey = modelKey(namespace, model.id, "entitlement");
        const previousEntitlement = getObservation(store, entitlementKey, now);
        const authoritativeState = new Set(["entitled", "not_entitled", "entitled_but_exhausted"])
          .has(previousEntitlement.state);
        // A model-list response proves catalogue presence, not execution
        // entitlement. Never downgrade a still-fresh probe/invocation result.
        if (!previousEntitlement.fresh || !authoritativeState) {
          writes[entitlementKey] = observation(source.entitlement_signal, now,
            `machine:discovery:${source.id}`, "medium", ttl, {
              provider: source.provider,
              model_id: model.id,
              probe_required: true,
              note: "catalog listing is not execution entitlement",
            });
        }
      }
      const key = candidateKey(source, model.id);
      const registered = registeredModel(model.id);
      const acknowledgements = ledger.acknowledged_candidates || {};
      const family = extractFamilyVersion(model.id).family;
      const acknowledged = (acknowledgements.ids || []).includes(model.id) ||
        (family && (acknowledgements.families || []).includes(family));
      if (!registered && !acknowledged && !proposedIds.has(model.id)) continue;
      const fact = candidateFact({ source, model, registered, acknowledged, previous: store.observations[key], now, ttl: candidateTtl });
      if (fact) {
        writes[key] = fact;
        if (!registered && !acknowledged) candidates++;
      }
    }
    return { writes, summary: { id: source.id, state: "reachable", models: models.length, candidates } };
  } catch (error) {
    const reason = safeError(error);
    writes[sourceKey] = observation("unknown", now, `machine:discovery:${source.id}`, "low", ttl, { reason });
    return { writes, summary: { id: source.id, state: "unknown", models: 0, reason } };
  }
}

async function collectTerms({ source, fetchTerm, store, now, policy }) {
  const key = `terms:${source.id}`;
  const ttl = ttlFor(policy, "terms");
  const previous = store.observations[key];
  try {
    if (!fetchTerm) throw new Error("terms fetch adapter unavailable");
    const result = await fetchTerm(source, previous || null);
    if (result?.notModified) {
      if (!previous?.fingerprint) throw new Error("terms source returned not-modified without a prior fingerprint");
      return {
        key,
        fact: observation("unchanged", now, `machine:terms:${source.id}`, "high", ttl, {
          provider: source.provider, kind: source.kind, url: result?.finalUrl || previous.url || source.url,
          fingerprint: previous.fingerprint, fingerprint_basis: previous.fingerprint_basis || "normalized-visible-text-v1",
          normalized_text_length: previous.normalized_text_length || null,
          previous_fingerprint: previous.fingerprint, last_successful_observation: now,
          etag: result?.etag || previous.etag || null, last_modified: result?.lastModified || previous.last_modified || null,
        }),
        summary: { id: source.id, state: "unchanged" },
      };
    }
    const body = String(result?.body || "");
    const normalizedText = normalizeVisibleText(body);
    if (!normalizedText) throw new Error("terms source returned no visible text");
    const fingerprint = createHash("sha256").update(normalizedText, "utf8").digest("hex");
    const fingerprintBasis = "normalized-visible-text-v1";
    const rebased = Boolean(previous?.fingerprint && previous.fingerprint_basis !== fingerprintBasis);
    const state = !previous?.fingerprint || rebased ? "baseline" :
      previous.fingerprint === fingerprint ? "unchanged" : "changed";
    return {
      key,
      fact: observation(state, now, `machine:terms:${source.id}`, "high", ttl, {
        provider: source.provider,
        kind: source.kind,
        url: result?.finalUrl || source.url,
        fingerprint,
        fingerprint_basis: fingerprintBasis,
        fingerprint_rebased_from: rebased ? previous.fingerprint_basis || "raw-body-v0" : null,
        normalized_text_length: normalizedText.length,
        previous_fingerprint: previous?.fingerprint || null,
        last_successful_observation: now,
        etag: result?.etag || null,
        last_modified: result?.lastModified || null,
      }),
      summary: { id: source.id, state },
    };
  } catch (error) {
    const reason = safeError(error);
    const retained = previous?.fingerprint ? {
      fingerprint: previous.fingerprint,
      fingerprint_basis: previous.fingerprint_basis || null,
      last_successful_observation: previous.last_successful_observation || previous.observed_at,
    } : {};
    return {
      key,
      fact: observation("unknown", now, `machine:terms:${source.id}`, "low", ttl,
        { provider: source.provider, kind: source.kind, url: source.url, reason, ...retained }),
      summary: { id: source.id, state: "unknown", reason },
    };
  }
}

async function collectCli({ requirement, inspectCli, now, policy }) {
  const key = `cli:${requirement.id}`;
  const ttl = ttlFor(policy, "cli_compatibility");
  try {
    if (!inspectCli) throw new Error("CLI inspector unavailable");
    const result = await inspectCli(requirement);
    if (result?.status === "skipped") {
      return { key, fact: observation("skipped", now, `machine:cli:${requirement.id}`, "high", ttl,
        { reason: result.reason || "not applicable" }), summary: { id: requirement.id, state: "skipped" } };
    }
    if (!result?.version) throw new Error("version unavailable");
    if (!versionTuple(result.version).length || !versionTuple(requirement.minimum_version).length) {
      throw new Error("version could not be parsed");
    }
    const state = compareVersions(result.version, requirement.minimum_version) >= 0 ? "compatible" : "incompatible";
    return {
      key,
      fact: observation(state, now, `machine:cli:${requirement.id}`, "high", ttl,
        { version: result.version, minimum_version: requirement.minimum_version }),
      summary: { id: requirement.id, state, version: result.version },
    };
  } catch (error) {
    const reason = safeError(error);
    return { key, fact: observation("unknown", now, `machine:cli:${requirement.id}`, "low", ttl,
      { minimum_version: requirement.minimum_version, reason }), summary: { id: requirement.id, state: "unknown", reason } };
  }
}

export async function runDiscovery({
  ledger,
  policy,
  stateDir,
  adapters = {},
  fetchTerm = null,
  inspectCli = null,
  environment = "local",
  now = new Date().toISOString(),
  respectFreshness = false,
}) {
  if (!ledger || !policy?.discovery) throw new Error("discovery requires registry and policy.discovery");
  const store = readObservationStore({ stateDir });
  if (store.errors.length) throw new Error(`observation store invalid: ${store.errors.join("; ")}`);
  const configuredSources = policy.discovery.sources || [];
  const sourceResults = await Promise.all(configuredSources.map((source) => {
    const cached = policyCappedObservation(store, `discovery-source:${source.id}`, ttlFor(policy, source.kind), now);
    if (respectFreshness && cached.fresh === true) {
      return { writes: {}, summary: { id: source.id, state: "fresh", cached: true, models: 0 } };
    }
    if (!environmentAllows(source, environment)) {
      return collectSource({ source, adapter: async () => ({ status: "skipped", reason: `source is not configured for '${environment}'` }), ledger, store, now, policy });
    }
    return collectSource({ source, adapter: adapters[source.adapter], ledger, store, now, policy });
  }));
  const termResults = await Promise.all((policy.discovery.terms_sources || []).map((source) => {
    const cached = policyCappedObservation(store, `terms:${source.id}`, ttlFor(policy, "terms"), now);
    if (respectFreshness && cached.fresh === true) {
      return { key: `terms:${source.id}`, fact: null, summary: { id: source.id, state: "fresh", cached: true } };
    }
    return collectTerms({ source, fetchTerm, store, now, policy });
  }));
  const cliResults = await Promise.all((policy.discovery.cli_requirements || []).map((requirement) => {
    const cached = policyCappedObservation(store, `cli:${requirement.id}`, ttlFor(policy, "cli_compatibility"), now);
    if (respectFreshness && cached.fresh === true) {
      return { key: `cli:${requirement.id}`, fact: null, summary: { id: requirement.id, state: "fresh", cached: true } };
    }
    if (!environmentAllows(requirement, environment)) {
      return collectCli({ requirement, inspectCli: async () => ({ status: "skipped", reason: `CLI is not configured for '${environment}'` }), now, policy });
    }
    return collectCli({ requirement, inspectCli, now, policy });
  }));

  const writes = {};
  for (const result of sourceResults) Object.assign(writes, result.writes);
  for (const result of termResults) if (result.fact) writes[result.key] = result.fact;
  for (const result of cliResults) if (result.fact) writes[result.key] = result.fact;
  if (Object.keys(writes).length) writeObservations({ stateDir, observations: writes });
  cleanupObservationStore({ stateDir, now, retainKeys: observationRetentionKeys(ledger, policy) });

  const sources = sourceResults.map((result) => result.summary);
  const terms = termResults.map((result) => result.summary);
  const cli = cliResults.map((result) => result.summary);
  const candidateCount = sources.reduce((sum, source) => sum + (source.candidates || 0), 0);
  const hasFinding = candidateCount > 0 || terms.some((item) => item.state === "changed") || cli.some((item) => item.state === "incompatible");
  const hasUnknown = [...sources, ...terms, ...cli].some((item) => item.state === "unknown");
  return {
    observed_at: now,
    findings: hasFinding ? "yes" : hasUnknown ? "unknown" : "no",
    route_state_activation: ledger.route_state_activation || null,
    sources,
    terms,
    cli,
    candidate_count: candidateCount,
    observation_count: Object.keys(writes).length,
  };
}

export async function discoverFromFiles({ ledgerPath, policyPath, ...options }) {
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  validateLedgerPolicyCompatibility(ledger, policy);
  return runDiscovery({ ledger, policy, ...options });
}

export function renderDiscoveryReport(summary) {
  const rows = [
    `# MODEL-OS discovery — ${summary.observed_at.slice(0, 10)}`,
    "",
    `Route activation: **${summary.route_state_activation || "legacy/unset"}**. Discovery writes observations and candidates only; it does not edit the registry or activate routes.`,
    "",
    `Candidates discovered: ${summary.candidate_count}. Observations written: ${summary.observation_count}.`,
    "",
    "## Catalog sources",
    ...summary.sources.map((item) => `- ${item.id}: **${item.state}** · models ${item.models || 0} · candidates ${item.candidates || 0}${item.reason ? ` · ${item.reason}` : ""}`),
    "",
    "## Terms sources",
    ...summary.terms.map((item) => `- ${item.id}: **${item.state}**${item.reason ? ` · ${item.reason}` : ""}`),
    "",
    "## CLI compatibility",
    ...summary.cli.map((item) => `- ${item.id}: **${item.state}**${item.version ? ` · ${item.version}` : ""}${item.reason ? ` · ${item.reason}` : ""}`),
    "",
    `<!-- model-os-discovery: findings=${summary.findings} -->`,
    "",
  ];
  return rows.join("\n");
}
