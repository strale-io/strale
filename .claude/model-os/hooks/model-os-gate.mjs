#!/usr/bin/env node
// MODEL-OS gate — PreToolUse hook for Agent/Task/Workflow launches (cross-platform: node,
// runs identically on the laptop and in cloud/phone containers, unlike the .ps1 hooks).
//
// Enforces, against model-os/routing.json (the ledger):
//   1. Every subagent launch names an explicit `model` — an unrouted agent inherits the
//      session tier, which on a top-tier session silently runs fan-out at top cost.
//   2. The model is one the ledger knows (alias or id) — no typo'd or stale names.
//   3. A top-tier launch (requires_calibre_line in the ledger) carries a
//      "calibre: <role> — <why>" line in its prompt — the justification the doctrine
//      demands, made must-happen. This is the anti-runaway brake: an agent cannot
//      quietly fan out on the most expensive tier.
//   4. Workflow scripts (the 2026-07-09 audit's silent gap #1): a Workflow's internal
//      agent() calls spawn subagents OUTSIDE the Agent tool, so rules 1-3 never see
//      them — and an unrouted agent() inherits the session model, i.e. a Fable session
//      could fan out dozens of top-tier agents ungated. This hook now also matches the
//      Workflow tool and blocks scripts that call agent() without ANY model: routing.
//      (Textual check, not a JS parse — it catches the dangerous default case, not a
//      determined evader; named workflows and unreadable scriptPaths fail open.)
//
// Contract: reads the tool call as JSON on stdin; exit 2 + stderr blocks and shows the
// message to the agent; exit 0 allows. Fail-OPEN on internal errors (a broken guard is
// worse than none) — the health hook separately flags a missing/unparseable ledger.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

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

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    const p = JSON.parse(raw);
    const input = (p && p.tool_input) || {};

    // --- Workflow branch (rule 4): gate the script's internal agent() calls. ---
    if (p.tool_name === "Workflow") {
      let script = typeof input.script === "string" ? input.script : "";
      if (!script && typeof input.scriptPath === "string") {
        try { script = readFileSync(input.scriptPath, "utf8"); } catch { /* fail open */ }
      }
      // Named workflows (input.name) and unreadable paths: nothing to inspect — allow.
      if (script && /\bagent\s*\(/.test(script) && !/\bmodel\s*:/.test(script)) {
        process.stderr.write(
          "BLOCKED (MODEL-OS): this Workflow script calls agent() with NO model: routing anywhere. " +
            "Workflow-spawned agents inherit the SESSION model — on a top-tier session that fans out " +
            "at top cost, ungated (the exact runaway MODEL-OS exists to prevent). Add model: (and " +
            "effort:) to each agent() call per the ledger roles — generate wide+cheap, judge " +
            "narrow+expensive — and relaunch.\n"
        );
        process.exit(2);
      }
      process.exit(0);
    }

    // --- Agent/Task branch (rules 1-3). ---
    const model = typeof input.model === "string" ? input.model.trim() : "";
    const prompt = typeof input.prompt === "string" ? input.prompt : "";

    const ledgerPath = findLedger();
    const ledger = ledgerPath ? JSON.parse(readFileSync(ledgerPath, "utf8")) : null;
    const models = (ledger && ledger.models) || [];
    const aliases = models.map((m) => m.alias).join("/") || "haiku/sonnet/opus/fable";

    if (!model) {
      process.stderr.write(
        "BLOCKED (MODEL-OS): this Agent launch has no explicit 'model'. An unrouted subagent " +
          "inherits the session tier — on a top-tier session that runs fan-out at top cost. " +
          `Pick ${aliases} per the ledger roles (generate wide+cheap, judge narrow+expensive) ` +
          "and relaunch with model set.\n"
      );
      process.exit(2);
    }

    if (ledger) {
      const entry = models.find(
        (m) => m.alias === model.toLowerCase() || m.id === model.toLowerCase()
      );
      if (!entry) {
        process.stderr.write(
          `BLOCKED (MODEL-OS): model '${model}' is not in the ledger (${ledgerPath}). ` +
            `Known: ${aliases}. If a new model genuinely exists, update the ledger first ` +
            "(that IS the living-library mechanism) — never route to an unregistered name.\n"
        );
        process.exit(2);
      }
      if (!(entry.access || []).includes("agent-model-param")) {
        process.stderr.write(
          `BLOCKED (MODEL-OS): '${model}' is not reachable via the Agent model param ` +
            `(access: ${(entry.access || []).join(", ")}). Reach it the way the ledger says ` +
            "(e.g. `codex exec --sandbox read-only` from Bash) instead of an Agent launch.\n"
        );
        process.exit(2);
      }
      if (entry.requires_calibre_line && !/calibre\s*:/i.test(prompt)) {
        process.stderr.write(
          `BLOCKED (MODEL-OS): '${model}' is a top-cost tier. State the justification IN the ` +
            "subagent prompt as 'calibre: <role> — <one-line why this needs the top tier>' and " +
            "relaunch. If the task is fan-out / execution / mechanical, route it down instead.\n"
        );
        process.exit(2);
      }
    }
    process.exit(0);
  } catch {
    process.exit(0); // fail-open
  }
});
