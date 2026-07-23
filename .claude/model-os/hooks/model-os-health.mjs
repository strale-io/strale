#!/usr/bin/env node
// MODEL-OS health check — SessionStart hook (also runnable manually, and from Codex:
// `node <path>/model-os-health.mjs`). Cross-platform node so it behaves identically on
// the laptop and in cloud/phone containers.
//
// Job: BEFORE heavy work starts, verify the routing OS itself is operational and inject
// the step-0 protocol + current roster into context. Degradations are flagged LOUDLY —
// a session must never assume routing is enforced when it isn't.
//
// Checks: ledger present + parseable · ledger freshness (last_verified vs stale_after_days)
// · provider CLIs reachable · role-floor integrity ·
// local-config identity drift (any model entry with a `resolution` block is re-resolved
// against its live CLI config file EVERY session; a cached-vs-live model mismatch is
// flagged LOUDLY — effort is selector-owned per task, not binding drift. The hook flags,
// a human fixes the ledger; it never self-writes).
// Output (stdout) is added to session context. Always exits 0 — this hook informs, the
// gate hook blocks.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { findLedger, select as selectFn } from "../select.mjs";
import { catalogMaintenanceDue, commandOnPath, gateWiringDetail, routeMaintenanceDue, startBackgroundFreshnessMonitor, startBackgroundMaintenance } from "./health-lib.mjs";

// Fail-soft import: a partially-synced consumer repo missing the resolver must not
// crash the health hook — drift detection just degrades to absent for that session.
let resolveLocalConfig = null;
try {
  ({ resolveLocalConfig } = await import(new URL("./resolve-local-models.mjs", import.meta.url)));
} catch {}

let routeRuntime = null;
try {
  routeRuntime = await import(new URL("../route-state.mjs", import.meta.url));
} catch {}

let stateRuntime = null;
try {
  stateRuntime = await import(new URL("../state-store.mjs", import.meta.url));
} catch {}

const flags = [];
const lines = [];

function argValue(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")
    ? process.argv[index + 1]
    : null;
}

const explicitSessionModel = argValue("session-model") || process.env.MODEL_OS_SESSION_MODEL_ID || null;

// Gate-wiring check runs regardless of ledger state — an unwired gate leaves Agent/
// Workflow launches unenforced even when the ledger itself is fine.
const gateWiring = gateWiringDetail();
if (!gateWiring.wired) {
  flags.push(
    "MODEL-OS GATE NOT WIRED — no PreToolUse hook for model-os-gate.mjs (matcher covering Agent) " +
    "was found in user or project settings. Agent/Workflow launches are UNENFORCED this session. " +
    "Remedy: `pwsh -File model-os/install-global.ps1` (or re-run sync-model-os.ps1 for this repo)."
  );
}

const ledgerPath = findLedger();
let ledger = null;
let routeContext = null;
if (!ledgerPath) {
  flags.push("MODEL-OS LEDGER MISSING — routing is UNENFORCED this session. Flag to the founder before any heavy/loop work.");
} else {
  try {
    ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  } catch {
    flags.push(`MODEL-OS LEDGER UNPARSEABLE (${ledgerPath}) — routing is UNENFORCED. Fix the JSON before heavy work.`);
  }
}

if (ledger) {
  const hasAccessRoutes = ledger.route_state_activation !== "deferred-until-observers" &&
    (ledger.models || []).some((model) => Array.isArray(model.access_routes) && model.access_routes.length);
  if (!routeRuntime) {
    if (hasAccessRoutes) {
      flags.push("MODEL-OS ROUTE RUNTIME MISSING — access_routes exist but route-state.mjs could not load.");
    }
  } else {
    try {
      const policyPath = routeRuntime.findPolicy(ledgerPath);
      routeContext = routeRuntime.loadRouteContext({ ledgerPath, policyPath });
      const activeQuotaIds = routeRuntime.activeQuotaResourceIds(ledger, routeContext.policy);
      const routeDue = routeMaintenanceDue({ ledger, context: routeContext, activeQuotaIds });
      const catalogDue = catalogMaintenanceDue({ policy: routeContext.policy, store: routeContext.store, now: routeContext.now });
      if (process.env.MODEL_OS_ROUTE_MAINTENANCE !== "0" && process.env.MODEL_OS_FRESHNESS_MONITOR !== "0") {
        try {
          const monitor = startBackgroundFreshnessMonitor({ ledgerPath, policyPath,
            stateDir: process.env.MODEL_OS_STATE_DIR || null });
          if (monitor.started && (routeDue || catalogDue)) lines.push("MAINTENANCE: due route/catalogue observations are refreshing in the background; the freshness monitor will continue checking this active session.");
        } catch (error) {
          flags.push(`BACKGROUND FRESHNESS MONITOR FAILED TO START — ${error.message}`);
        }
      } else if (process.env.MODEL_OS_ROUTE_MAINTENANCE !== "0" && (routeDue || catalogDue)) {
        try {
          const maintenance = startBackgroundMaintenance({ ledgerPath, policyPath,
            stateDir: process.env.MODEL_OS_STATE_DIR || null });
          if (maintenance.started) lines.push("MAINTENANCE: stale route/catalogue observations are refreshing in the background; this session continues on last-known-good data.");
        } catch (error) {
          flags.push(`BACKGROUND ROUTE MAINTENANCE FAILED TO START — ${error.message}`);
        }
      }
      for (const error of routeContext.store?.errors || []) flags.push(`OBSERVATION STORE: ${error}`);

      if (stateRuntime && routeContext.policy?.quota_resources) {
        const quotaRows = [];
        let unknownQuota = 0;
        for (const resourceId of activeQuotaIds) {
          const resource = routeContext.policy.quota_resources[resourceId];
          const fact = stateRuntime.getObservation(routeContext.store, resource.capacity_observation, routeContext.now);
          if (fact.state === "unknown") unknownQuota++;
          const used = Number.isFinite(fact.used_percent) ? `,${fact.used_percent}% used` : "";
          quotaRows.push(`${resourceId}=${fact.state}${used}`);
        }
        if (quotaRows.length) lines.push(`QUOTA: ${quotaRows.join(" | ")}.`);
        if (unknownQuota) flags.push(`QUOTA STATE UNKNOWN: ${unknownQuota} resource(s) have missing, expired, unsupported, or unratified telemetry.`);
      }

      if (hasAccessRoutes) {
        const lifecycleStates = new Set(routeContext.policy?.lifecycle?.states || []);
        for (const model of ledger.models || []) {
          if (!model.lifecycle_state || (lifecycleStates.size && !lifecycleStates.has(model.lifecycle_state))) {
            flags.push(`LEDGER INTEGRITY: model '${model.id}' has invalid lifecycle_state '${model.lifecycle_state || "missing"}'.`);
          }
        }
        const routeRows = [];
        let unknownCount = 0;
        let attemptableCount = 0;
        let anthropicAuthUnverified = false;
        for (const model of ledger.models || []) {
          const roles = Array.isArray(model.roles_qualified) ? model.roles_qualified : [];
          for (const route of model.access_routes || []) {
            const roleEvaluations = roles.map((role) => ({ role, evaluation: routeRuntime.evaluateRoute(model, route, routeContext, {
              role, taskClass: role, fanoutWidth: 1,
            }) }));
            const roleLabels = roleEvaluations.map(({ role, evaluation }) => `${role}:${routeRuntime.routeStatusLabel(evaluation)}`);
            const labels = roleEvaluations.map(({ evaluation }) => routeRuntime.routeStatusLabel(evaluation));
            const label = labels.includes("available") ? "available"
              : labels.includes("attemptable") ? "attemptable"
                : labels.includes("unknown") ? "unknown"
                : labels.length ? "unavailable" : "unqualified";
            if (label === "unknown") unknownCount++;
            if (label === "attemptable") attemptableCount++;
            // Detect the SPECIFIC auth cause so the banner can name the one-line remedy (2026-07-19:
            // the taste tier was blocked by an unverifiable `claude auth status` probe, and neither
            // the founder nor a peer session could tell WHY or how to fix it).
            if (route.provider === "anthropic" && roleEvaluations.some(({ evaluation }) =>
              (evaluation.reasons || []).some((r) => /spend guard unknown|auth unverifiable/i.test(r)))) {
              anthropicAuthUnverified = true;
            }
            routeRows.push(`${route.id}=${label}[${roleLabels.join(",") || "no-qualified-role"}]`);
          }
        }
        if (routeRows.length) lines.push(`ROUTES: ${routeRows.join(" | ")}.`);
        if (unknownCount) flags.push(`ROUTE STATE UNKNOWN: ${unknownCount} access route(s) lack safe authentication or have unresolved unsafe state.`);
        if (anthropicAuthUnverified) flags.push("  → FIX (Anthropic auth): run `claude auth status` — if it shows loggedIn:false, run `claude auth login` to sign the CLI into your claude.ai subscription. Until verified, the taste/canon tier stays blocked (MODEL-OS won't route where it can't confirm auth). This is a CLI-login gap, not a spend problem.");
        if (attemptableCount) flags.push(`ROUTE MAINTENANCE: ${attemptableCount} safe subscription route(s) have unknown/stale non-safety telemetry; they remain attemptable and refresh stays off the work hot path.`);
      }
    } catch (error) {
      flags.push(`MODEL-OS ROUTE STATE INVALID — ${error.message}`);
    }
  }

  if (explicitSessionModel) {
    const sessionEntry = (ledger.models || []).find((model) => model.id === explicitSessionModel || model.alias === explicitSessionModel);
    lines.push(`SESSION MODEL (explicit, not inferred from runtime binding): ${explicitSessionModel}${sessionEntry ? ` [ledger:${sessionEntry.id}]` : " [not in ledger]"}.`);
    if (!sessionEntry) flags.push(`SESSION MODEL UNKNOWN: explicit session identity '${explicitSessionModel}' is not in the ledger.`);
  } else {
    lines.push("SESSION MODEL: not supplied by this hook surface; runtime bindings describe CLI defaults, not this session's identity. Pass --session-model <ledger id> (or MODEL_OS_SESSION_MODEL_ID) before relying on an aligned-session claim.");
  }
  // freshness
  const days = Math.floor((Date.now() - Date.parse(ledger.last_verified)) / 86400000);
  if (Number.isFinite(days) && days > (ledger.stale_after_days || 21)) {
    flags.push(`LEDGER STALE — last verified ${ledger.last_verified} (${days}d ago > ${ledger.stale_after_days}d). Run the refresh (model-os/MODEL-OS.md §refresh) before trusting the roster.`);
  }
  // roles_qualified integrity — the eligibility contract the selector + gate share.
  const roleNameSet = new Set(Object.keys(ledger.roles || {}));
  for (const m of ledger.models || []) {
    if (m.roles_qualified != null && !Array.isArray(m.roles_qualified)) {
      // A malformed truthy non-array must never throw here (this loop is outside the roster
      // try/catch) — that would brick SessionStart. Flag it, don't iterate it (Sol #5).
      flags.push(`LEDGER INTEGRITY: model '${m.id}' roles_qualified is not an array.`);
      continue;
    }
    for (const rq of m.roles_qualified || []) {
      if (!roleNameSet.has(rq)) flags.push(`LEDGER INTEGRITY: model '${m.id}' roles_qualified names unknown role '${rq}'.`);
    }
  }
  for (const role of roleNameSet) {
    const qualified = (ledger.models || []).some((model) => (model.status || "current") === "current" &&
      Array.isArray(model.roles_qualified) && model.roles_qualified.includes(role));
    if (!qualified) flags.push(`LEDGER INTEGRITY: role '${role}' has no current roles_qualified model.`);
  }
  // runtime bindings — identity vs binding (2026-07-10): a binding records what a
  // CLI-backed lane ACTUALLY invokes right now, resolved live from its local config;
  // the assessed model entry is what roles route to, and its capability evidence never
  // silently transfers to a successor id. A missing file/field is a soft miss (the CLI
  // may not be installed in this environment), not a flag.
  if (resolveLocalConfig) {
    const modelById = (id) => (ledger.models || []).find((m) => m.id === id);
    for (const b of ledger.runtime_bindings || []) {
      if (!b.resolution || b.resolution.method !== "local-config") continue;
      const r = resolveLocalConfig(b.resolution);
      if (!r.found) continue;
      const assessed = modelById(b.assessed_model);
      if (assessed && r.resolvedId === assessed.id) {
        continue; // binding and assessed model agree
      }
      const liveEntry = modelById(r.resolvedId);
      if (liveEntry) {
        const known = b.last_seen && b.last_seen.id === r.resolvedId;
        flags.push(
          `RUNTIME BINDING DIVERGENCE${known ? " (known, unratified)" : ""}: '${b.id}' live config runs '${r.resolvedId}' (ledger status: ${liveEntry.status || "current"}), but roles route to the assessed '${b.assessed_model}'. Until ratified, invoke the assessed model EXPLICITLY — e.g. \`codex exec -m ${b.assessed_model}\` — or record 'review: pending'; unflagged ${b.id} output is ${r.resolvedId}, NOT the assessed reviewer.${known ? "" : " Also record runtime_bindings[].last_seen for this id."}`
        );
      } else {
        flags.push(
          `MODEL-OS LEDGER DRIFT: '${b.id}' live config runs '${r.resolvedId}', which the ledger does not know. Add a NEW status:unassessed model entry for it and record runtime_bindings[].last_seen — NEVER overwrite the assessed '${b.assessed_model}' entry in place (identity vs binding, MODEL-OS.md).`
        );
      }
    }
    // Legacy shape (pre-2026-07-10 synced ledgers): resolution block on the model entry.
    for (const m of ledger.models || []) {
      if (!m.resolution || m.resolution.method !== "local-config") continue;
      const r = resolveLocalConfig(m.resolution);
      if (!r.found) continue;
      const idDrift = r.resolvedId !== m.id;
      if (idDrift) {
        flags.push(
          `MODEL-OS LEDGER DRIFT: '${m.alias}' — ledger caches '${m.id}', but the live ${m.resolution.source} config now says '${r.resolvedId}'. This ledger copy predates the runtime_bindings split — re-sync it from wow-core (see model-os/MODEL-OS.md).`
        );
      }
    }
  }

  // billing watch — a model entry may carry billing_watch {effective, message} for a
  // KNOWN, DATED billing change (e.g. Fable 5 moving off the weekly plan cap onto metered
  // credits on 2026-07-12). Upcoming (≤7d out) and active changes both flag LOUDLY — the
  // no-surprise-bills guarantee must not depend on anyone remembering a date.
  for (const m of ledger.models || []) {
    const eff = m.billing_watch && Date.parse(m.billing_watch.effective);
    if (!Number.isFinite(eff)) continue;
    const daysUntil = Math.ceil((eff - Date.now()) / 86400000);
    if (daysUntil <= 0) {
      flags.push(`BILLING CHANGE ACTIVE for '${m.alias}' (since ${m.billing_watch.effective}): ${m.billing_watch.message} Ratify route eligibility and capability evidence before routing more work to it.`);
    } else if (daysUntil <= 7) {
      flags.push(`BILLING CHANGE in ${daysUntil}d for '${m.alias}' (${m.billing_watch.effective}): ${m.billing_watch.message}`);
    }
  }

  // sync staleness — when running from a per-repo synced copy, say how old it is.
  // An old copy silently diverges from wow-core (stale roster, missing guard fixes).
  try {
    const stampPath = path.join(path.dirname(ledgerPath), ".synced-from");
    if (existsSync(stampPath)) {
      const stamp = readFileSync(stampPath, "utf8").trim(); // "wow-core <hash> <YYYY-MM-DD>"
      const stampDate = Date.parse((stamp.match(/(\d{4}-\d{2}-\d{2})/) || [])[1]);
      const ageDays = Number.isFinite(stampDate) ? Math.floor((Date.now() - stampDate) / 86400000) : null;
      lines.push(`SYNCED COPY: ${stamp}${ageDays != null ? ` (${ageDays}d ago)` : ""}.`);
      if (ageDays != null && ageDays > 30) {
        flags.push(`SYNCED COPY STALE — this repo's model-os copy is ${ageDays}d old (${stamp}). Re-run sync-model-os.ps1 from the wow-core checkout at the next session seam.`);
      }
    }
  } catch { /* informational only — never break the hook */ }

  // Provider launch surfaces are symmetric dependencies. PATH inspection is local
  // and nonblocking; auth/quota refresh runs only in detached maintenance.
  // Entitlement probes remain explicit, event-bounded maintenance operations.
  for (const cli of ["codex", "claude"]) {
    if (!commandOnPath(cli)) {
      flags.push(`${cli} CLI ABSENT — ${cli === "codex" ? "independent-review and Codex route lanes" : "Claude route lanes"} DOWN. Unavailable work queues as blocked/review-pending; it is never skipped or self-certified.`);
    }
  }

  lines.push(
    "MODEL-OS active (ledger: " + ledgerPath + ", verified " + ledger.last_verified + ")."
  );

  // Global provider-neutral roster. Entry surface is passed only for parity
  // diagnostics; it never changes ranking.
  try {
    const fmt = (d) => d.status === "routable"
      ? `${d.selected.alias}@${d.selected.effort} [${d.selected.provider}; fallbacks ${d.fallbacks.map((item) => item.alias).join("→") || "none"}]`
      : d.status;
    const rows = Object.keys(ledger.roles || {}).map((role) => {
      if (role === "independent-review") {
        const claudeAuthored = selectFn({ role, surface: "codex", authorProvider: "anthropic", routeContext }, ledger);
        const codexAuthored = selectFn({ role, surface: "claude-code", authorProvider: "openai", routeContext }, ledger);
        return `${role}: reviews the OTHER provider — Claude-authored→${fmt(claudeAuthored)} · Codex-authored→${fmt(codexAuthored)}`;
      }
      const decision = selectFn({ role, surface: "codex", routeContext }, ledger);
      return `${role}: ${fmt(decision)}`;
    });
    lines.push("ROSTER (global provider-neutral ranking; entry surface does not change it):\n  " + rows.join("\n  "));
  } catch (error) {
    flags.push(`GLOBAL SCHEDULER ERROR — roster ranking failed: ${error.message}`);
  }

  lines.push(
    "STEP-0 (every prompt that begins real work): state one line — '<task profile> -> role <role> -> <globally selected model>@<abstract effort> (session on <current>) — proceed/dispatch'. " +
      "GLOBAL: provider identity and entry surface have zero ranking weight; select once per meaningful phase and use the returned ordered fallbacks after a real failure. " +
      "Session mismatch is advisory for reversible local work; dispatch the selected route at a meaningful phase boundary. HARD STOP only for unsafe spending or the relevant irreversible/outward transition. " +
      "Trivial turns collapse to 'Model check: trivial -> proceed'. " +
      "Subagents: ALWAYS set model: explicitly (gate-enforced); top-tier launches need a 'calibre: <role> — <why>' line, and the model must be roles_qualified for that role (gate-enforced, FR-224). " +
      "Fan-out width defaults to " + ((ledger.caps && ledger.caps.fanout_width_default) || 6) + " — state width+why in the plan before going wider. Subagents never spawn subagents unless the plan named it. " +
      "On a real failure: try the next globally ranked floor-clearing candidate and log 'wanted X, fell to Y'. Unknown telemetry never means BLACK-STATE; that label requires explicit unavailability/exhaustion of every safe candidate. Cross-provider review still requires the OTHER provider from the author."
  );
}

if (flags.length) {
  lines.unshift("!! MODEL-OS DEGRADED !!\n" + flags.map((f) => "  ‼ " + f).join("\n"));
}
process.stdout.write(lines.join("\n") + "\n");
process.exit(0);
