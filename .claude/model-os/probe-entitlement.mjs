#!/usr/bin/env node
// Spend-safe, event-bounded entitlement probe. It never invokes a provider CLI
// unless a current machine observation proves metered fallback/auto-top-up is
// disabled for the route's account scope.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findLedger } from "./select.mjs";
import { entitlementRecheckDue, findRoute, loadRouteContext, resolveEffectiveBilling, ZERO_SPEND_BILLING } from "./route-state.mjs";
import { getObservation, resolveStateDir, writeObservations } from "./state-store.mjs";
import { subscriptionOnlyDispatchEnv } from "./provider-adapters/common.mjs";

const ALLOWED_EVENTS = new Set(["entitlement-change", "new-model", "ttl-expiry"]);
const FIXED_PROMPT = "Reply with exactly OK.";

export function subscriptionOnlyChildEnv(source = process.env) {
  return subscriptionOnlyDispatchEnv(source);
}

export function classifyProbeResult({ exitCode, stdout = "", stderr = "" }) {
  const text = `${stdout}\n${stderr}`.toLowerCase();
  if (/billing|payment|credit|metered|purchase/.test(text)) return "metered_only";
  if (exitCode === 0) return stdout.trim() === "OK" ? "entitled" : "unknown";
  if (/usage limit|rate limit|quota|exhausted|capacity/.test(text)) return "entitled_but_exhausted";
  if (/not entitled|not available|access denied|model[_ -]?not[_ -]?found|unsupported model|may not exist or you may not have access/.test(text)) return "not_entitled";
  return "unknown";
}

export function buildCliProbeInvocation(model, route, {
  platform = process.platform,
  comSpec = process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
} = {}) {
  let command;
  let args;
  if (route.surface === "claude-code") {
    if (!/^[A-Za-z0-9._:-]+$/.test(model.id || "")) {
      throw new Error(`unsafe Claude model id '${model.id || "missing"}'`);
    }
    if (platform === "win32") {
      command = comSpec;
      args = ["/d", "/s", "/c", `call claude.cmd -p --model ${model.id} --effort low --tools "" --permission-mode plan`];
    } else {
      command = "claude";
      args = ["-p", "--model", model.id, "--effort", "low", "--tools", "", "--permission-mode", "plan"];
    }
  } else if (route.surface === "codex") {
    if (!/^[A-Za-z0-9._:-]+$/.test(model.id || "")) {
      throw new Error(`unsafe Codex model id '${model.id || "missing"}'`);
    }
    if (platform === "win32") {
      command = comSpec;
      args = ["/d", "/s", "/c", `call codex.cmd exec -m ${model.id} --sandbox read-only --skip-git-repo-check -c model_reasoning_effort=low -`];
    } else {
      command = "codex";
      args = ["exec", "-m", model.id, "--sandbox", "read-only", "--skip-git-repo-check", "-c", "model_reasoning_effort=low", "-"];
    }
  } else {
    return null;
  }
  return { command, args };
}

function executeCliProbe(model, route) {
  let invocation;
  try {
    invocation = buildCliProbeInvocation(model, route);
  } catch (error) {
    return { exitCode: 1, stdout: "", stderr: error.message };
  }
  if (!invocation) return { exitCode: 1, stdout: "", stderr: `no probe adapter for surface '${route.surface}'` };
  const { command, args } = invocation;
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    timeout: 30000,
    maxBuffer: 65536,
    windowsHide: true,
    input: FIXED_PROMPT,
    env: subscriptionOnlyChildEnv(),
  });
  return {
    exitCode: Number.isInteger(result.status) ? result.status : 1,
    stdout: result.stdout || "",
    stderr: result.error ? `${result.stderr || ""}\n${result.error.message}` : (result.stderr || ""),
  };
}

export function probeEntitlement({
  event,
  routeId,
  ledger,
  context,
  stateDir = null,
  execute = executeCliProbe,
  now = new Date().toISOString(),
}) {
  if (!ALLOWED_EVENTS.has(event)) {
    return { status: "refused", reason: `probe event must be entitlement-change, new-model, or ttl-expiry (got '${event || "missing"}')` };
  }
  const found = findRoute(ledger, routeId);
  if (!found) return { status: "refused", reason: `unknown access route '${routeId}'` };
  const { model, route } = found;
  if (event === "ttl-expiry") {
    const current = getObservation(context?.store, route.entitlement_observation, now);
    if (current.fresh === true && !entitlementRecheckDue(route, current, now)) {
      return { status: "not-due", reason: "entitlement observation is still fresh", route: route.id };
    }
  }
  const spendGuard = getObservation(context?.store, route.spend_guard_observation, now);
  const verifiedSpendGuard = spendGuard.state === "disabled" && spendGuard.confidence === "high" &&
    typeof spendGuard.source === "string" && spendGuard.source.startsWith("machine:");
  if (!verifiedSpendGuard) {
    return {
      status: "refused",
      reason: `spend guard is not machine-verified disabled (state=${spendGuard.state}, confidence=${spendGuard.confidence || "none"}, source=${spendGuard.source || "none"}, ${spendGuard.reason || "observed"}); metered fallback/auto-top-up must be a current high-confidence machine:* observation before probing`,
    };
  }
  const billing = resolveEffectiveBilling(route, context?.policy, context?.store, now);
  // An unknown (never invalid) billing boundary blocks WORK routing, but it must
  // not deadlock this probe: the bounded probe is the designed recovery
  // observation for exactly that missing telemetry, and with a current
  // machine-verified disabled spend guard the account cannot cross into
  // metered/credit spend — the same safety argument that already authorizes
  // recovery probes against explicitly exhausted quota. Fall back to the
  // route's base billing mode, which must still be zero-spend authorized.
  const boundaryUnknown = billing.status === "unknown";
  if (billing.reason && !boundaryUnknown) return { status: "refused", reason: billing.reason };
  const effectiveMode = boundaryUnknown ? route.billing_mode : billing.mode;
  const allowedModes = new Set(context?.policy?.billing?.autonomous_allowed_modes || []);
  if (!allowedModes.has(effectiveMode) || !ZERO_SPEND_BILLING.has(effectiveMode)) {
    return {
      status: "refused",
      reason: boundaryUnknown
        ? `billing boundary is unknown and base billing mode '${effectiveMode}' is not zero-spend probe-authorized`
        : `effective billing mode '${effectiveMode}' is not zero-spend probe-authorized`,
    };
  }
  const defaultTtl = context?.policy?.observation_ttl?.entitlement || 86400;
  let ttl = defaultTtl;
  if (route.entitlement_recheck_at != null) {
    const recheckAt = Date.parse(route.entitlement_recheck_at);
    const observedAt = Date.parse(now);
    if (!Number.isFinite(recheckAt) || !Number.isFinite(observedAt)) {
      return { status: "refused", reason: "entitlement_recheck_at or probe time is invalid" };
    }
    if (observedAt < recheckAt) {
      ttl = Math.max(1, Math.min(defaultTtl, Math.floor((recheckAt - observedAt) / 1000)));
    }
  }

  const raw = execute(model, route);
  const classification = classifyProbeResult(raw);
  const observation = {
    state: classification,
    observed_at: now,
    source: `bounded-probe:${route.surface}`,
    confidence: classification === "unknown" ? "low" : "high",
    ttl,
    probed_model_id: model.id,
  };
  const observations = { [route.entitlement_observation]: observation };
  let catalogObservation = null;
  if (["entitled", "entitled_but_exhausted"].includes(classification)) {
    catalogObservation = {
      state: "present",
      observed_at: now,
      source: `bounded-probe:${route.surface}`,
      confidence: "high",
      ttl: context?.policy?.observation_ttl?.catalog || 604800,
      probed_model_id: model.id,
    };
    observations[route.catalog_observation] = catalogObservation;
  }
  writeObservations({ stateDir: resolveStateDir(stateDir), observations });
  return { status: "recorded", classification, observation, catalogObservation, route: route.id,
    warnings: boundaryUnknown ? ["billing-boundary-unknown-at-probe"] : [] };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    out[key] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const ledgerPath = args.ledger || findLedger();
  if (!ledgerPath) {
    process.stderr.write("probe-entitlement: no routing.json found.\n");
    process.exit(3);
  }
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const context = loadRouteContext({ ledgerPath, policyPath: args.policy, stateDir: args["state-dir"] });
  const result = probeEntitlement({
    event: args.event,
    routeId: args.route,
    ledger,
    context,
    stateDir: args["state-dir"],
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(result.status === "recorded" ? 0 : 4);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
