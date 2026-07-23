#!/usr/bin/env node
// MODEL-OS gate — PreToolUse hook for Agent/Task/Workflow launches (cross-platform: node,
// runs identically on the laptop and in cloud/phone containers, unlike the .ps1 hooks).
//
// Enforces, against model-os/routing.json (the ledger):
//   1. Every subagent launch names an explicit `model` — an unrouted agent inherits the
//      session tier, which on a top-tier session silently runs fan-out at top cost.
//   2. The model is one the ledger knows (alias or id) — no typo'd or stale names.
//   3. The model is reachable via the Agent model param (codex is not — the ledger names
//      the access path: `codex exec`).
//   4. A top-tier launch (requires_calibre_line in the ledger) carries a REAL calibre
//      declaration in its prompt: `calibre: <ledger role> — <reason>`. A bare `calibre:`,
//      an unknown role, or a missing reason is a violation, not compliance (2026-07-10
//      live-fire: the old presence-only regex passed all three).
//   5. Workflow scripts: EVERY `agent()` call inside the script is put through the SAME
//      checks 1-4 (2026-07-10 live-fire: the old any-`model:`-anywhere check passed
//      mixed routing, invented models, and top-tier calls with no calibre line).
//      Textual parse, not a JS engine — a call whose `model:` is not a string literal
//      is blocked because its identity cannot be checked before launch. Named workflows /
//      unreadable scriptPaths still pass through because there is no script body to inspect.
//
// Failure behavior (nuanced by design — 2026-07-10 review, Claude+Codex converged):
//   - NO ledger found anywhere: structural rules (explicit model per launch/call) still
//     apply; identity/access/calibre checks are skipped. The health hook flags the
//     missing ledger separately. A machine-global hook must not brick unrelated repos.
//   - Ledger FOUND but unparseable, or an internal error AFTER a ledger was located:
//     BLOCK. A repo that claims MODEL-OS routing must not fan out on a broken policy.
//
// Contract: reads the tool call as JSON on stdin; exit 2 + stderr blocks and shows the
// message to the agent; exit 0 allows. Regression suite: model-os/test-model-os-gate.ps1.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findLedger } from "../select.mjs";
import * as routeRuntime from "../route-state.mjs";

function block(msg) {
  process.stderr.write(msg + "\n");
  process.exit(2);
}

/**
 * Validate one launch (an Agent/Task call, or one agent() call inside a Workflow
 * script) against the ledger. Returns an error string to block with, or null to allow.
 *   model      — the launch's model string ("" = absent), already trimmed.
 *   promptText — the text the calibre line must live in (Agent prompt / workflow call text).
 *   ledger     — parsed ledger or null (null = structural rules only).
 *   where      — human label for error messages ("this Agent launch" / "agent() call #2").
 */
function declaredRoles(promptText) {
  const matches = [...promptText.matchAll(/(?:^|["'`])[ \t]*calibre[ \t]*:[ \t]*([A-Za-z][A-Za-z0-9-]*)([^\r\n]*)/gim)];
  return { matches, roles: [...new Set(matches.map((match) => match[1].toLowerCase()))] };
}

// Conservative signature of mechanical/fan-out-shaped work — strong, low-false-positive
// verbs only. A false positive costs one advisory line, never a block, and the advisory
// itself says "proceed if judgment-heavy", so erring toward silence is the priority.
const MECHANICAL_SIGNATURE =
  /\b(commit|stamp|lint|rename|typo|reformat|formatting|status[ -]?check|file inventory|inventory sweep|capture loop|re-?run the|fixed[ -]script|link[ -]?check|search fan-?out|dead[ -]link)\b/i;

function isReachableViaAgentParam(entry) {
  if ((entry.access || []).includes("agent-model-param")) return true;
  return (entry.access_routes || []).some((route) =>
    Array.isArray(route.access_methods) && route.access_methods.includes("agent-model-param"));
}

// Cheapest mechanical-qualified model the ledger offers on the same launch surface (an
// Agent launch can only reach agent-model-param models), for the down-route suggestion.
function suggestMechanicalModel(ledger) {
  const cheapRank = { low: 0, mid: 1, high: 2, top: 3 };
  const mechanical = (ledger.models || []).filter((m) =>
    Array.isArray(m.roles_qualified) && m.roles_qualified.includes("mechanical") && (m.status || "current") === "current");
  const reachable = mechanical.filter(isReachableViaAgentParam);
  const pool = reachable.length ? reachable : mechanical;
  if (!pool.length) return null;
  return pool.sort((a, b) =>
    (cheapRank[a.cost_class] ?? 9) - (cheapRank[b.cost_class] ?? 9) ||
    (a.quality_rank ?? 99) - (b.quality_rank ?? 99))[0];
}

// Non-blocking down-route advisory (DEC-187: suggest, never block). Fires when a launch
// is mechanical/fan-out-shaped AND names a top-cost-class model. An EXPLICITLY declared
// role always wins (Codex review F3): a launch declaring a non-mechanical role (e.g.
// `calibre: heavy-analysis`) is never nudged just because its prompt mentions committing
// or linting — the signature is an inference of last resort, applied ONLY when no role
// is declared at all. Recovers top-tier quota from mechanical work (usage mining: Opus
// was 76% of assistant messages, Haiku 53 msgs in 4 weeks). Never throws — a malformed
// ledger/prompt yields null, never a false block on a valid launch.
export function downRouteNudge(model, promptText, ledger, where = "this launch") {
  try {
    if (!ledger || !model || typeof promptText !== "string") return null;
    const entry = (ledger.models || []).find(
      (m) => m.alias === model.toLowerCase() || m.id === model.toLowerCase());
    if (!entry || entry.cost_class !== "top") return null;
    const declaredRole = declaredRoles(promptText).roles[0] || null;
    const mechanicalProfile = declaredRole
      ? declaredRole === "mechanical" || declaredRole === "fan-out"
      : MECHANICAL_SIGNATURE.test(promptText);
    if (!mechanicalProfile) return null;
    const suggested = suggestMechanicalModel(ledger);
    const name = suggested ? (suggested.alias || suggested.id) : "the mechanical-role model";
    return `NUDGE (MODEL-OS): mechanical-profile ${where} on top tier '${model}' — ` +
      `roster suggests '${name}' for mechanical/fan-out work; proceed if judgment-heavy.`;
  } catch { return null; }
}

// Author-provider declaration for cross-provider review (independent-review role only).
// Anchored the same way as the calibre line (line start or an opening quote). Accepts
// `author: <provider>` and `reviewing: <provider>-authored`; both normalize to a bare
// provider string (anthropic|openai) so it can be compared against the launched model's
// ledger `entry.provider`.
function declaredAuthorProvider(promptText) {
  const matches = [...promptText.matchAll(/(?:^|["'`])[ \t]*(?:author|reviewing)[ \t]*:[ \t]*([A-Za-z][A-Za-z0-9-]*)/gim)];
  if (!matches.length) return null;
  const raw = matches[0][1].toLowerCase();
  return raw.endsWith("-authored") ? raw.slice(0, -"-authored".length) : raw;
}

function validateLaunch(model, promptText, ledger, where, routeContext = null,
  { fanoutWidth = 1, fanoutWidthByResource = null } = {}) {
  const models = (ledger && ledger.models) || [];
  const roles = (ledger && ledger.roles) || {};
  const aliases = models.map((m) => m.alias).join("/") || "haiku/sonnet/opus/fable";

  if (!model) {
    return (
      `BLOCKED (MODEL-OS): ${where} has no explicit 'model'. An unrouted subagent ` +
      "inherits the session tier — on a top-tier session that runs fan-out at top cost. " +
      `Pick ${aliases} per the ledger roles (generate wide+cheap, judge narrow+expensive) ` +
      "and relaunch with model set."
    );
  }
  if (!ledger) return null; // structural rule satisfied; nothing to validate against

  const entry = models.find(
    (m) => m.alias === model.toLowerCase() || m.id === model.toLowerCase()
  );
  if (!entry) {
    return (
      `BLOCKED (MODEL-OS): ${where} routes to '${model}', which is not in the ledger. ` +
      `Known: ${aliases}. If a new model genuinely exists, update the ledger first ` +
      "(that IS the living-library mechanism) — never route to an unregistered name."
    );
  }
  // Parse calibre declaration(s) — anchored to a LINE START or an opening quote (so a workflow's
  // `agent("calibre: ...")` counts, but a mid-prose mention of "calibre:" does NOT), collect ALL,
  // and reject conflicting roles so a launch can't be laundered through the first eligible one
  // (2026-07-11 re-review, Sol #2). Was: an unanchored first-match regex.
  const parsedCalibre = declaredRoles(promptText);
  const calibreMatches = parsedCalibre.matches;
  const declaredRoleNames = parsedCalibre.roles;
  const declaredRole = declaredRoleNames[0] || null;
  const roleNames = Object.keys(roles);

  if (declaredRoleNames.length > 1) {
    return `BLOCKED (MODEL-OS): ${where} declares conflicting calibre roles (${declaredRoleNames.join(", ")}). Declare exactly one.`;
  }
  const routeAware = Array.isArray(entry.access_routes) && entry.access_routes.length && routeContext;
  if (routeAware && (!declaredRole || !roleNames.includes(declaredRole))) {
    return (
      `BLOCKED (MODEL-OS): ${where} needs one mandatory MODEL-OS role declaration so quota ` +
      `prediction has a ratified task class: 'calibre: <role> — <reason>' (${roleNames.join(", ")}). ` +
      "Missing or unknown roles have no fallback (DEC-198)."
    );
  }
  if (entry.requires_calibre_line) {
    // Real declaration required: calibre: <known ledger role> <separator> <reason text>.
    const reason = calibreMatches[0] ? calibreMatches[0][2].replace(/^[\s—–:-]+/, "").trim() : "";
    if (!calibreMatches.length || (roleNames.length && !roleNames.includes(declaredRole)) || !/[A-Za-z]{3}/.test(reason)) {
      return (
        `BLOCKED (MODEL-OS): '${model}' (${where}) is a top-cost tier and needs a real ` +
        "calibre declaration in the prompt: 'calibre: <role> — <one-line why this needs " +
        `the top tier>' where <role> is a ledger role (${roleNames.join(", ") || "see ledger"}) ` +
        "and the reason is non-empty. A bare or vague calibre line is the runaway this " +
        "gate exists to stop. If the task is fan-out / execution / mechanical, route it down instead."
      );
    }
  }

  // Role-eligibility (FR-224): a declared, KNOWN role must be one the model is roles_qualified for —
  // the SAME `roles_qualified` the selector routes by, so where a role IS declared the gate and the
  // selector cannot authorize different models. Enforced only when the ledger tags this model; an
  // unmigrated model with no roles_qualified skips (fail-soft). NOTE: launches that declare NO role
  // are not role-checked — full "every launch names its role" enforcement is a tracked follow-on.
  if (declaredRole && roleNames.includes(declaredRole) && Array.isArray(entry.roles_qualified) &&
      !entry.roles_qualified.includes(declaredRole)) {
    return (
      `BLOCKED (MODEL-OS): '${model}' (${where}) is not qualified for role '${declaredRole}' ` +
      `(ledger roles_qualified: ${entry.roles_qualified.join(", ") || "none"}). Launch a model that ` +
      "clears that role's floor (see the ledger / select.mjs), or correct the calibre role."
    );
  }

  // Cross-provider review (independent-review only): the ledger role is explicit that
  // review must ALWAYS be a different provider than the artifact's author (routing.json
  // roles). The gate has no other way to learn who authored the artifact, so the launch
  // must declare it — a missing declaration or a same-provider declaration both block.
  if (declaredRole === "independent-review") {
    const authorProvider = declaredAuthorProvider(promptText);
    if (!authorProvider) {
      return (
        `BLOCKED (MODEL-OS): ${where} declares calibre role 'independent-review' but no author-provider ` +
        "declaration is present. Independent review must declare the artifact's author provider so the " +
        "gate can enforce de-correlation: 'author: <provider>' or 'reviewing: <provider>-authored' " +
        "(e.g. 'author: anthropic', 'reviewing: openai-authored')."
      );
    }
    if (entry.provider && authorProvider === String(entry.provider).toLowerCase()) {
      return (
        `BLOCKED (MODEL-OS): ${where} declares the artifact author as '${authorProvider}' but '${model}' ` +
        `is also provider '${entry.provider}' — same-provider review is not independent. Route to a model ` +
        "from a different provider for this review."
      );
    }
  }

  if (routeAware) {
    if (!routeRuntime) return `BLOCKED (MODEL-OS): v2 access routes exist but route-state.mjs is missing.`;
    const routeChecks = routeRuntime.routeEvaluations(entry, routeContext, {
      surface: "claude-code",
      role: declaredRole,
      taskClass: declaredRole,
      fanoutWidth,
      fanoutWidthByResource,
    }).filter((evaluation) => (evaluation.route.access_methods || []).includes("agent-model-param"));
    const available = routeChecks.find((evaluation) => evaluation.routable);
    if (!available) {
      const detail = routeChecks.length
        ? routeChecks.map((evaluation) => `${evaluation.route.id}: ${evaluation.reasons.join(", ")}`).join(" | ")
        : "no claude-code agent-model-param access route";
      return (
        `BLOCKED (MODEL-OS): '${model}' (${where}) has no currently routable Agent access route. ` +
        `${detail}. Missing/expired observations are unknown, never silently available.`
      );
    }
  } else if (!(entry.access || []).includes("agent-model-param")) {
    return (
      `BLOCKED (MODEL-OS): '${model}' (${where}) is not reachable via the Agent model ` +
      `param (access: ${(entry.access || []).join(", ")}). Reach it the way the ledger ` +
      "says (e.g. `codex exec --sandbox read-only` from Bash) instead of an Agent launch."
    );
  }
  return null;
}

/**
 * Extract the argument text of every `agent(...)` call in a Workflow script.
 * Balanced-paren scan with string awareness — textual, not a JS parser (see header).
 */
function extractAgentCalls(script) {
  const calls = [];
  const re = /\bagent\s*\(/g;
  let m;
  while ((m = re.exec(script))) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    let quote = null;
    while (i < script.length && depth > 0) {
      const c = script[i];
      if (quote) {
        if (c === "\\") i++; // skip escaped char
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "(") depth++;
      else if (c === ")") depth--;
      i++;
    }
    calls.push(script.slice(start, depth === 0 ? i - 1 : i));
    re.lastIndex = i;
  }
  return calls;
}

// Wired as a hook (`node model-os-gate.mjs` with the tool call on stdin) — but also
// imported by tests for its pure exports (downRouteNudge). Guard the stdin wiring behind
// the main-module check so an import has NO side effect; an unconditional stdin listener
// keeps any importer's event loop alive forever (the same pattern the other hooks use).
function runGate() {
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", async () => {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0); // can't even identify the tool call — not ours to judge
  }

  const input = (payload && payload.tool_input) || {};
  let ledgerPath = null;
  try {
    ledgerPath = findLedger();
    const ledger = ledgerPath ? JSON.parse(readFileSync(ledgerPath, "utf8")) : null;
    const hasAccessRoutes = ledger && ledger.route_state_activation !== "deferred-until-observers" &&
      (ledger.models || []).some((model) => Array.isArray(model.access_routes) && model.access_routes.length);
    let routeContext = hasAccessRoutes ? routeRuntime.loadRouteContext({ ledgerPath }) : null;

    const entryFor = (model) => (ledger?.models || []).find((entry) =>
      entry.alias === String(model || "").toLowerCase() || entry.id === String(model || "").toLowerCase());
    const resourcesFor = (entry) => new Set((entry?.access_routes || [])
      .filter((route) => (route.access_methods || []).includes("agent-model-param"))
      .flatMap((route) => route.quota_resources || []));
    const fanoutFor = (record, records) => {
      const resources = resourcesFor(entryFor(record.model));
      const byResource = {};
      for (const resourceId of resources) {
        byResource[resourceId] = records.filter((other) => resourcesFor(entryFor(other.model)).has(resourceId)).length;
      }
      const widths = Object.values(byResource);
      return { fanoutWidth: widths.length ? Math.max(...widths) : 1, fanoutWidthByResource: byResource };
    };

    // --- Workflow branch: run EVERY agent() call through the shared checks. ---
    if (payload.tool_name === "Workflow") {
      let script = typeof input.script === "string" ? input.script : "";
      if (!script && typeof input.scriptPath === "string") {
        try { script = readFileSync(input.scriptPath, "utf8"); } catch { /* pass-through */ }
      }
      if (!script) process.exit(0); // named workflow / unreadable path — nothing to inspect

      const calls = extractAgentCalls(script);
      const records = calls.map((call) => {
        const lit = /\bmodel\s*:\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/.exec(call);
        const anyModel = /\bmodel\s*:/.test(call);
        return { prompt: call, model: lit ? (lit[1] ?? lit[2] ?? lit[3] ?? "").trim() : anyModel ? null : "" };
      });
      const nudges = [];
      for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        const where = `agent() call #${i + 1} in this Workflow script`;
        // Look for a model: property with a string-literal value. A non-literal value
        // cannot be checked against identity/access/role/quota policy, so fail closed.
        const model = records[i].model;
        if (model === null) {
          block(`BLOCKED (MODEL-OS): ${where} uses a non-literal model expression. ` +
            "Use a ledger-known string literal so routing identity, access, role, and quota can be enforced before launch.");
        }
        const err = validateLaunch(model, call, ledger, where, routeContext, fanoutFor(records[i], records));
        if (err) block(err + " Fix the script and relaunch the Workflow.");
        const nudge = downRouteNudge(model, call, ledger, where);
        if (nudge) nudges.push(nudge);
      }
      if (nudges.length) process.stderr.write(nudges.join("\n") + "\n"); // advisory, never blocks
      process.exit(0);
    }

    // --- Agent/Task branch. ---
    const model = typeof input.model === "string" ? input.model.trim() : "";
    const prompt = typeof input.prompt === "string" ? input.prompt : "";
    const err = validateLaunch(model, prompt, ledger, "this Agent launch", routeContext);
    if (err) block(err);
    const nudge = downRouteNudge(model, prompt, ledger, "this Agent launch");
    if (nudge) process.stderr.write(nudge + "\n"); // advisory, never blocks
    process.exit(0);
  } catch (e) {
    if (ledgerPath) {
      // A ledger exists but couldn't be applied — this repo claims MODEL-OS routing,
      // so a broken policy blocks launches rather than silently waving them through.
      block(
        `BLOCKED (MODEL-OS): the ledger at ${ledgerPath} could not be applied ` +
        `(${e && e.message ? e.message : "internal error"}). Fix routing.json (or the gate) ` +
        "before launching subagents — a repo that claims MODEL-OS routing must not fan out " +
        "on a broken policy. The health hook has details."
      );
    }
    process.exit(0); // no ledger anywhere — not a MODEL-OS repo/machine state we can judge
  }
});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runGate();
