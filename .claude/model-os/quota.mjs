#!/usr/bin/env node
// Phase 3 quota refresh. Codex app-server is primary; a fresh rate-limit event
// from recent rollout JSONL is fallback-only. Writes observations, never policy.

import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { withCodexAppServer } from "./codex-app-server.mjs";
import { buildQuotaObservations, ingestClaudeStatusline, parseRolloutRateLimits, quotaTtlForAdapter } from "./quota-lib.mjs";
import { activeQuotaResourceIds, entitlementRecheckDue, findPolicy, loadRouteContext, readPolicy } from "./route-state.mjs";
import { cleanupObservationStore, getObservation, observationRetentionKeys,
  readObservationStore, writeObservations } from "./state-store.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_SERVER_TIMEOUT_MS = 8_000;
const MAX_ROLLOUT_FILES = 20;
const MAX_ROLLOUT_BYTES = 2 * 1024 * 1024;

function safeError(error) {
  return String(error?.message || error || "unknown error").replace(/[\r\n]+/g, " ").slice(0, 240);
}

function collectRollouts(root, output = []) {
  if (!root || !existsSync(root)) return output;
  let entries = [];
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return output; }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) collectRollouts(full, output);
    else if (entry.isFile() && entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) {
      try { output.push({ path: full, mtimeMs: statSync(full).mtimeMs, size: statSync(full).size }); } catch {}
    }
  }
  return output;
}

function readTail(file, size) {
  const length = Math.min(size, MAX_ROLLOUT_BYTES);
  const offset = Math.max(0, size - length);
  const buffer = Buffer.alloc(length);
  const handle = openSync(file, "r");
  try {
    readSync(handle, buffer, 0, length, offset);
    const text = buffer.toString("utf8");
    return offset === 0 ? text : text.slice(text.indexOf("\n") + 1);
  } finally { closeSync(handle); }
}

export function readFreshRolloutFallback({
  codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
  now = new Date().toISOString(),
  ttl = 900,
} = {}) {
  const candidates = [
    ...collectRollouts(path.join(codexHome, "sessions")),
    ...collectRollouts(path.join(codexHome, "archived_sessions")),
  ].sort((left, right) => right.mtimeMs - left.mtimeMs).slice(0, MAX_ROLLOUT_FILES);
  for (const candidate of candidates) {
    try {
      const text = readTail(candidate.path, candidate.size);
      const parsed = parseRolloutRateLimits(text, { now, ttl });
      if (parsed.status === "ok") return { status: "ok", text, path: candidate.path };
    } catch { /* try the next recent bounded file */ }
  }
  return { status: "unknown", reason: "no fresh bounded rollout rate-limit fallback found" };
}

export function assertCodexSubscriptionAccount(response) {
  if (response?.account?.type !== "chatgpt") {
    const error = new Error(`Codex quota source requires ChatGPT subscription auth; active account type is '${response?.account?.type || "unknown"}'`);
    error.code = "UNVERIFIED_SUBSCRIPTION_AUTH";
    throw error;
  }
  return { type: response.account.type, planType: response.account.planType || "unknown" };
}

export async function readCodexRateLimits() {
  return withCodexAppServer(async (request) => {
    assertCodexSubscriptionAccount(await request("account/read", { refreshToken: false }));
    return request("account/rateLimits/read", null);
  }, {
    timeoutMs: APP_SERVER_TIMEOUT_MS,
    clientName: "model_os_quota",
    clientTitle: "MODEL-OS Quota",
    clientVersion: "2.0.0-phase3",
  });
}

export async function refreshQuotaObservations({
  policyPath = findPolicy(null) || path.join(HERE, "policy.json"),
  stateDir = null,
  now = new Date().toISOString(),
  readCodex = readCodexRateLimits,
  readFallback = readFreshRolloutFallback,
} = {}) {
  const policy = readPolicy(policyPath);
  if (!policy) throw new Error("quota refresh requires policy");
  let codexPayload = null;
  let codexError = null;
  let rolloutText = null;
  try { codexPayload = await readCodex(); }
  catch (error) {
    codexError = error;
    if (error?.code !== "UNVERIFIED_SUBSCRIPTION_AUTH") {
      const fallback = readFallback({ now, ttl: quotaTtlForAdapter(policy, "codex-app-server-rate-limits") });
      if (fallback?.status === "ok") rolloutText = fallback.text;
      else if (fallback?.reason) codexError = new Error(`${safeError(error)}; ${fallback.reason}`);
    }
  }
  const built = buildQuotaObservations({ policy, codexPayload, codexError, rolloutText, now });
  if (Object.keys(built.observations).length) writeObservations({ stateDir, observations: built.observations });

  // Claude's stable signal arrives asynchronously through the status-line bridge.
  // Seed unknown only when no fresh status-line observation exists.
  ingestClaudeStatusline({ payload: {}, policy, stateDir, now });
  const store = readObservationStore({ stateDir });
  const resources = {};
  for (const [resourceId, resource] of Object.entries(policy.quota_resources || {})) {
    const fact = store.observations[resource.capacity_observation];
    resources[resourceId] = fact ? {
      state: fact.state,
      used_percent: fact.used_percent ?? null,
      resets_at: fact.resets_at ?? null,
      source: fact.source,
      confidence: fact.confidence,
      reason: fact.reason ?? null,
    } : { state: "unknown", reason: "missing" };
  }
  return {
    observed_at: now,
    codex_source: built.source,
    rollout_fallback_used: built.fallback_used,
    route_state_activation: "unchanged-by-quota-refresh",
    resources,
  };
}

export async function refreshStaleQuotaObservations({
  ledger,
  policyPath = findPolicy(null) || path.join(HERE, "policy.json"),
  stateDir = null,
  now = new Date().toISOString(),
  resourceIds = null,
  refreshCodex = refreshQuotaObservations,
} = {}) {
  const policy = readPolicy(policyPath);
  if (!ledger || !policy) throw new Error("lazy quota refresh requires registry and policy");
  const allActive = activeQuotaResourceIds(ledger, policy);
  const requested = resourceIds == null ? allActive : new Set(resourceIds);
  const active = new Set([...allActive].filter((resourceId) => requested.has(resourceId)));
  const store = readObservationStore({ stateDir });
  const staleResources = [...active].filter((resourceId) => {
    const resource = policy.quota_resources?.[resourceId];
    return getObservation(store, resource?.capacity_observation, now).fresh !== true;
  });
  const staleAdapters = new Set(staleResources.map((resourceId) => policy.quota_resources[resourceId].adapter));
  const attempted = [];
  if (staleAdapters.has("codex-app-server-rate-limits")) {
    attempted.push("codex-app-server-rate-limits");
    await refreshCodex({ policyPath, stateDir, now });
  }
  return {
    active_resources: [...active],
    stale_resources: staleResources,
    attempted_adapters: attempted,
    passive_adapters: [...staleAdapters].filter((adapter) => adapter !== "codex-app-server-rate-limits"),
  };
}

function relevantRoutes(ledger, policy, { role = null, modelId = null } = {}) {
  const routable = new Set(policy?.lifecycle?.routable_states || ["qualified"]);
  const rows = [];
  for (const model of ledger?.models || []) {
    if ((model.status || "current") !== "current" || !routable.has(model.lifecycle_state)) continue;
    if (modelId && model.id !== modelId && model.alias !== String(modelId).toLowerCase()) continue;
    if (role && Array.isArray(model.roles_qualified) && !model.roles_qualified.includes(role)) continue;
    for (const route of model.access_routes || []) rows.push({ model, route });
  }
  return rows;
}

// Provider-neutral route maintenance used by both selection surfaces and the Claude
// launch gate. Refresh adapters may still return unknown; this function never makes a
// route available itself — callers always reload and evaluate the newly stored facts.
export async function refreshRouteObservations({
  ledger,
  ledgerPath = null,
  policyPath = findPolicy(ledgerPath) || path.join(HERE, "policy.json"),
  stateDir = null,
  now = new Date().toISOString(),
  role = null,
  surface = null,
  modelId = null,
  observeGuards = null,
  refreshCodex = refreshQuotaObservations,
  probe = null,
  allowEntitlementProbes = process.env.MODEL_OS_PROBE_CHILD !== "1",
} = {}) {
  const policy = readPolicy(policyPath);
  if (!ledger || !policy) throw new Error("route refresh requires registry and policy");
  const routes = relevantRoutes(ledger, policy, { role, modelId });
  const localRoutes = surface ? routes.filter(({ route }) => route.surface === surface) : routes;
  const localIds = new Set(localRoutes.map(({ route }) => route.id));
  const candidates = surface ? [...localRoutes, ...routes.filter(({ route }) => !localIds.has(route.id))] : routes;
  const result = { routes: candidates.map(({ route }) => route.id), guards: null, quota: null, probes: [] };
  let context = loadRouteContext({ ledgerPath, policyPath, stateDir, now });

  if (candidates.some(({ route }) => getObservation(context.store, route.spend_guard_observation, now).fresh !== true)) {
    try {
      if (!observeGuards) ({ observeAuthGuards: observeGuards } = await import("./observe-auth.mjs"));
      result.guards = await observeGuards({ ledger, policy, stateDir, now });
    } catch (error) {
      result.guards = { error: safeError(error) };
    }
  }

  try {
    const resourceIds = new Set(candidates.flatMap(({ route }) => route.quota_resources || []));
    result.quota = await refreshStaleQuotaObservations({ ledger, policyPath, stateDir, now,
      resourceIds, refreshCodex });
  } catch (error) {
    result.quota = { error: safeError(error) };
  }
  context = loadRouteContext({ ledgerPath, policyPath, stateDir, now });

  if (allowEntitlementProbes) {
    if (!probe) ({ probeEntitlement: probe } = await import("./probe-entitlement.mjs"));
    for (const { route } of candidates) {
      const entitlement = getObservation(context.store, route.entitlement_observation, now);
      if (entitlement.fresh === true && !entitlementRecheckDue(route, entitlement, now)) continue;
      try {
        const probeResult = probe({ event: "ttl-expiry", routeId: route.id, ledger, context, stateDir, now });
        result.probes.push(probeResult);
        if (probeResult?.status === "recorded") {
          context = loadRouteContext({ ledgerPath, policyPath, stateDir, now });
        }
      } catch (error) {
        result.probes.push({ status: "refused", route: route.id, reason: safeError(error) });
      }
    }
  }
  result.cleanup = cleanupObservationStore({ stateDir, now,
    retainKeys: observationRetentionKeys(ledger, policy) });
  return result;
}

function parseArgs(argv) {
  const result = { policyPath: findPolicy(null) || path.join(HERE, "policy.json"), stateDir: null, json: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--json") result.json = true;
    else if (arg === "--policy" || arg === "--state-dir") {
      const next = argv[++index];
      if (!next) throw new Error(`${arg} requires a value`);
      if (arg === "--policy") result.policyPath = path.resolve(next);
      else result.stateDir = path.resolve(next);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return result;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const summary = await refreshQuotaObservations(options);
  process.stdout.write(options.json ? `${JSON.stringify(summary, null, 2)}\n` :
    `${Object.entries(summary.resources).map(([id, fact]) => `${id}=${fact.state}`).join(" | ")}\n`);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`MODEL-OS quota refresh failed: ${safeError(error)}\n`);
    process.exitCode = 3;
  });
}
