#!/usr/bin/env node
// MODEL-OS evidence gate — Stop hook that makes task-evidence closure must-happen,
// not prose (GLES-001). The 2026-07-16 audit found the evidence loop fully built but
// organically unused: dispatch receipts accumulated while zero real tasks were ever
// closed with task-evidence.mjs, so performance groups never calibrate and the
// adaptive control plane stays inert.
//
// Behavior — staleness-tiered so the gate is ALWAYS either green or one honest command
// away from green (FR-277.4: a gate that can never be made green trains everyone to
// ignore it — the "9 open task(s)" standing noise across ≥7 sessions):
//   - FRESH open task (organic run_kind work, task_id present, status completed, <7d,
//     no outcome): BLOCKS the stop ONCE and shows the exact close/defer command. The
//     agent either closes it after named machine: checks, or defers with a reason and
//     stops again — the second stop passes (stop_hook_active), so this never loops.
//   - STALE open task (same, but ≥7d old): NON-BLOCKING advisory. It renders as an
//     EXPIRY CANDIDATE with a one-command disposition (`task-evidence.mjs --expire`),
//     so an aged task is surfaced (never silently dropped) yet can never nag forever.
// Every listed task carries its exact disposition command, so the gate output is always
// actionable.
//
// Timestamp honesty (Codex review F2): the staleness DOWNGRADE (blocking → advisory) is
// only granted on a strictly valid ISO-8601 timestamp WITH timezone. A missing, garbage,
// or zoneless `at` keeps the task in the BLOCKING fresh tier — undatable work never
// earns the advisory downgrade (Date.parse maps "0" to ~year-2000 and zoneless strings
// to LOCAL time, either of which could fake its way across the 7-day boundary).
//
// Expiry coverage (Codex review F1): an "expired" disposition covers ONLY receipts
// at-or-before its recorded cutoff, so a LATER receipt reusing the task_id reopens the
// task. "deferred" keeps its designed task-level semantics (silence until closed).
//
// Failure behavior: this hook only ever BLOCKS on a positive FRESH detection. Missing
// state dir, unreadable files, any internal error, or a stale-only backlog exit 0 — a
// Stop hook must not hold a session hostage to broken telemetry or un-actionable aged
// work (the health hook reports telemetry problems separately). Regression suite:
// model-os/test-model-os-evidence-gate.ps1 + model-os/evidence-gate.test.mjs.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveStateDir } from "../state-store.mjs";
import { readOutcomes } from "../outcomes.mjs";
import { readDispositionCoverage, isStrictIsoTimestamp } from "../evidence-deferrals.mjs";

const OPEN_TASK_WINDOW_MS = 7 * 24 * 3600 * 1000;
const MAX_LISTED_TASKS = 5;

// Returns every open task (fresh AND stale), each tagged `stale`. Stale tasks are no
// longer silently dropped — the gate renders them as non-blocking expiry candidates.
// `ignoreDispositionsForTask` lets task-evidence.mjs --expire evaluate a task's own
// receipts as if it had no prior dispositions (a prior silencing must not hide the
// receipts from the expiry precondition check).
export function findOpenTasks({ stateDir = null, now = Date.now(), ignoreDispositionsForTask = null, sessionId = null } = {}) {
  const dir = resolveStateDir(stateDir);
  const receiptsFile = path.join(dir, "dispatch.receipts.jsonl");
  if (!existsSync(receiptsFile)) return [];

  const latestReceipts = new Map();
  for (const line of readFileSync(receiptsFile, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (!row?.id) continue;
    const previous = latestReceipts.get(row.id);
    if (!previous || Date.parse(row.at || 0) >= Date.parse(previous.at || 0)) {
      latestReceipts.set(row.id, row);
    }
  }

  let outcomes = [];
  try { outcomes = readOutcomes({ stateDir: dir }); } catch { outcomes = []; }
  const closedReceiptIds = new Set(
    outcomes.filter((row) => ["passed", "failed"].includes(row.verification)).map((row) => row.receipt_id)
  );
  let coverage = { deferred: new Set(), expiredCutoffs: new Map() };
  try { coverage = readDispositionCoverage({ stateDir: dir }); } catch { /* unreadable = no coverage */ }

  const open = new Map();
  for (const receipt of latestReceipts.values()) {
    if (receipt.run_kind !== "work" || receipt.status !== "completed") continue;
    if (typeof receipt.task_id !== "string" || !receipt.task_id) continue;
    // Session scoping (2026-07-19 field report): the ~/.model-os store is tree-wide, so a Stop
    // hook must only gate THIS session's own dispatches — never peers' open work. When the
    // stopping session's id is known, keep only receipts stamped with it; a receipt with no
    // session_id (legacy/pre-stamp or dispatched outside a CC session) is attributed to nobody
    // (it ages into the stale/expiry tier), never to whoever happens to stop next.
    if (sessionId != null && receipt.session_id !== sessionId) continue;
    if (closedReceiptIds.has(receipt.id)) continue;
    const datable = isStrictIsoTimestamp(receipt.at);
    const atMs = datable ? Date.parse(receipt.at) : NaN;
    if (receipt.task_id !== ignoreDispositionsForTask) {
      if (coverage.deferred.has(receipt.task_id)) continue;
      const cutoffMs = coverage.expiredCutoffs.get(receipt.task_id);
      // Only a DATABLE receipt at-or-before the cutoff is covered by an expiry; an
      // undatable receipt can never be proven covered, so it stays open (fail closed).
      if (datable && cutoffMs != null && atMs <= cutoffMs) continue;
    }
    const entry = open.get(receipt.task_id) ||
      { task_id: receipt.task_id, receipts: 0, latest_at: 0, undatable: false };
    entry.receipts += 1;
    if (datable) entry.latest_at = Math.max(entry.latest_at, atMs);
    else entry.undatable = true;
    open.set(receipt.task_id, entry);
  }
  // stale (the advisory downgrade) requires every receipt to be strictly datable and the
  // newest to be past the window; any undatable receipt pins the task to the fresh tier.
  return [...open.values()]
    .map((entry) => ({ ...entry,
      stale: !entry.undatable && entry.latest_at > 0 && now - entry.latest_at > OPEN_TASK_WINDOW_MS }))
    .sort((a, b) => b.latest_at - a.latest_at);
}

// Split into blocking (fresh) and advisory (stale) tiers.
export function partitionTasks(openTasks) {
  return {
    fresh: openTasks.filter((task) => !task.stale),
    stale: openTasks.filter((task) => task.stale),
  };
}

export function evidenceGateMessage(openTasks, modelOsDir) {
  const { fresh, stale } = partitionTasks(openTasks);
  const closer = path.join(modelOsDir, "task-evidence.mjs").replace(/\\/g, "/");
  const lines = [];

  if (fresh.length) {
    const listed = fresh.slice(0, MAX_LISTED_TASKS);
    lines.push(
      "MODEL-OS EVIDENCE GATE: this session dispatched cross-model work that was never",
      `verification-closed — ${fresh.length} recent open task(s) with completed organic receipts and no outcome.`,
      "Unclosed tasks never calibrate performance groups, so routing cannot learn from this work.",
      "Before stopping, for each task either:",
      "  a) close it after the named machine checks you already ran:",
      ...listed.map((task) =>
        `     node ${closer} --task-id ${task.task_id} --verification passed|failed --source machine:<suite> --checks <check1,check2>`),
      ...(fresh.length > listed.length ? [`     (…and ${fresh.length - listed.length} more — list via status.mjs)`] : []),
      "  b) or, if closure is not possible (no runnable machine check, or work another session ran),",
      "     record a durable deferral so it stops re-blocking — on the record, never a fabricated pass:",
      ...listed.map((task) =>
        `     node ${closer} --defer --task-id ${task.task_id} --reason "<why closure is not possible>"`),
      "Only named machine: checks may claim passed/failed — self-grading is rejected by task-evidence.mjs.",
    );
  }

  if (stale.length) {
    if (lines.length) lines.push("");
    const listed = stale.slice(0, MAX_LISTED_TASKS);
    lines.push(
      `MODEL-OS EVIDENCE GATE (advisory — not blocking): ${stale.length} EXPIRY CANDIDATE(S) open >7 days.`,
      "Aged, un-actionable work no longer nags on every stop. Disposition each with ONE command —",
      "close it if a machine check exists, or expire it (durable write-off, never a fabricated pass):",
      ...listed.map((task) =>
        `     node ${closer} --expire --task-id ${task.task_id} --reason "<why this will never be machine-verified>"`),
      ...(stale.length > listed.length ? [`     (…and ${stale.length - listed.length} more — list via status.mjs)`] : []),
    );
  }

  return lines.join("\n");
}

function main() {
  let input = {};
  try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { /* absent input = ordinary stop */ }
  if (input.stop_hook_active === true) process.exit(0); // one nudge per stop, never a loop
  // The stopping session's id scopes attribution to its OWN dispatches (Stop payload first, env
  // fallback). If neither is present we cannot scope — fall back to the prior tree-wide behavior
  // rather than silently gate nothing (a missing id must not disable the gate entirely).
  const sessionId = (typeof input.session_id === "string" && input.session_id)
    ? input.session_id : (process.env.CLAUDE_CODE_SESSION_ID || null);
  let openTasks = [];
  try { openTasks = findOpenTasks({ sessionId }); } catch { process.exit(0); }
  if (!openTasks.length) process.exit(0);
  const modelOsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { fresh } = partitionTasks(openTasks);
  process.stderr.write(evidenceGateMessage(openTasks, modelOsDir) + "\n");
  // Only a FRESH open backlog blocks; a stale-only backlog is a non-blocking advisory
  // (fail-open) so the gate is always either green or one honest --expire away from it.
  process.exit(fresh.length ? 2 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
