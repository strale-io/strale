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
// · codex CLI reachable (the independent-review lane) · role ladder integrity ·
// local-config drift (any model entry with a `resolution` block is re-resolved against its
// live CLI config file EVERY session; a cached-vs-live mismatch is flagged LOUDLY — the
// hook flags, a human fixes the ledger; it never self-writes).
// Output (stdout) is added to session context. Always exits 0 — this hook informs, the
// gate hook blocks.

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

// Fail-soft import: a partially-synced consumer repo missing the resolver must not
// crash the health hook — drift detection just degrades to absent for that session.
let resolveLocalConfig = null;
try {
  ({ resolveLocalConfig } = await import(new URL("./resolve-local-models.mjs", import.meta.url)));
} catch {}

function findLedger() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.MODEL_OS_LEDGER,
    process.env.CLAUDE_PROJECT_DIR &&
      path.join(process.env.CLAUDE_PROJECT_DIR, ".claude", "model-os", "routing.json"),
    path.join(os.homedir(), ".claude", "model-os", "routing.json"),
    path.join(here, "..", "routing.json"),
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

const flags = [];
const lines = [];

const ledgerPath = findLedger();
let ledger = null;
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
  // freshness
  const days = Math.floor((Date.now() - Date.parse(ledger.last_verified)) / 86400000);
  if (Number.isFinite(days) && days > (ledger.stale_after_days || 21)) {
    flags.push(`LEDGER STALE — last verified ${ledger.last_verified} (${days}d ago > ${ledger.stale_after_days}d). Run the refresh (model-os/MODEL-OS.md §refresh) before trusting the roster.`);
  }
  // ladder integrity
  const ids = new Set((ledger.models || []).map((m) => m.id));
  for (const [role, r] of Object.entries(ledger.roles || {})) {
    for (const m of [r.primary, ...(r.ladder || [])]) {
      if (m && !ids.has(m)) flags.push(`LEDGER INTEGRITY: role '${role}' references unknown model '${m}'.`);
    }
  }
  // local-config drift — re-resolve every resolution-bearing entry against its live
  // CLI config. Only an actual value mismatch is drift; a missing file/field is a soft
  // miss (the CLI may not be installed in this environment), not a flag.
  if (resolveLocalConfig) {
    for (const m of ledger.models || []) {
      if (!m.resolution || m.resolution.method !== "local-config") continue;
      const r = resolveLocalConfig(m.resolution);
      if (!r.found) continue;
      const idDrift = r.resolvedId !== m.id;
      const effortDrift =
        m.default_effort != null && r.resolvedEffort != null && r.resolvedEffort !== m.default_effort;
      if (idDrift || effortDrift) {
        const cached = [idDrift && m.id, effortDrift && `effort ${m.default_effort}`].filter(Boolean).join(" / ");
        const live = [idDrift && r.resolvedId, effortDrift && `effort ${r.resolvedEffort}`].filter(Boolean).join(" / ");
        flags.push(
          `MODEL-OS LEDGER DRIFT: '${m.alias}' — ledger caches '${cached}', but the live ${m.resolution.source} config now says '${live}'. The ledger is stale — update routing.json's id/default_effort for this entry (see model-os/MODEL-OS.md).`
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
      flags.push(`BILLING CHANGE ACTIVE for '${m.alias}' (since ${m.billing_watch.effective}): ${m.billing_watch.message} Ratify the ledger (primary/ladder/budget) before routing more work to it.`);
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

  // independent-review lane
  let codexOk = false;
  try { execSync("codex --version", { stdio: "ignore", timeout: 8000 }); codexOk = true; } catch {}
  if (!codexOk) {
    flags.push("codex CLI ABSENT — independent-review lane DOWN. Buyer-facing reviews queue as 'review: pending' (recorded, never skipped/self-certified).");
  }

  const roster = Object.entries(ledger.roles || {})
    .map(([role, r]) => {
      const m = (ledger.models || []).find((x) => x.id === r.primary);
      return `${role} -> ${m ? m.alias : r.primary}${(r.ladder || []).length ? ` (falls to ${r.ladder.map((l) => { const lm = (ledger.models || []).find((x) => x.id === l); return lm ? lm.alias : l; }).join(" -> ")}${r.silent_downgrade ? "" : " + FLAG, never silent"})` : ""}`;
    })
    .join(" | ");

  lines.push(
    "MODEL-OS active (ledger: " + ledgerPath + ", verified " + ledger.last_verified + ")."
  );
  lines.push("ROSTER: " + roster + ".");
  lines.push(
    "STEP-0 (every prompt that begins real work): state one line — '<task type> -> role <role> -> <model> (session on <current>) — proceed/switch'. " +
      "SEVERE mismatch (top tier on fan-out/mechanical work, or a buyer-facing/canon task on a low tier) = HARD STOP: name the right model, END THE TURN, wait for the founder to switch. " +
      "Trivial turns collapse to 'Model check: trivial -> proceed'. " +
      "Subagents: ALWAYS set model: explicitly (gate-enforced); top-tier launches need a 'calibre:' line in the prompt. " +
      "Fan-out width defaults to " + ((ledger.caps && ledger.caps.fanout_width_default) || 6) + " — state width+why in the plan before going wider. Subagents never spawn subagents unless the plan names it. " +
      "On a limit: fall down the SAME role's ladder and FLAG 'wanted X, fell to Y'. Cross-provider review per the ledger review_policy (buyer-facing UI/UX+copy: ALWAYS)."
  );
}

if (flags.length) {
  lines.unshift("!! MODEL-OS DEGRADED !!\n" + flags.map((f) => "  ‼ " + f).join("\n"));
}
process.stdout.write(lines.join("\n") + "\n");
process.exit(0);
