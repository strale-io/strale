#!/usr/bin/env node
// Durable evidence-closure dispositions. When a completed dispatch receipt cannot be
// verification-closed (no runnable machine check, or work performed by another
// session/operator), the Stop-hook evidence gate would otherwise re-block every
// stop until the receipt ages out — the alert-fatigue failure the ledger warns
// about (acknowledged_candidates). A disposition is the on-the-record "seen, cannot
// close, here is why" that silences that one task_id without ever fabricating a
// pass/fail outcome. It is an acknowledgment, not a verification: it never feeds
// performance calibration, and closing the task later with a real machine check
// still records the authoritative outcome.
//
// Two dispositions share this ledger (both silence the gate, neither is a pass/fail):
//   - "deferred": temporary "seen, cannot close THIS session" — a task that may still
//     earn a real machine outcome later (the original alert-fatigue answer).
//   - "expired":  durable write-off of a STALE open task (aged past the gate's window)
//     that will never get a machine verification — e.g. work that predates receipt
//     discipline. This is the one-command disposition the gate offers for its expiry
//     candidates, so a stale open task is always one honest command away from green.
//
// An expiry is CUTOFF-BOUND (2026-07-16 Codex review F1): it records the newest receipt
// timestamp at expiry time and covers ONLY receipts at-or-before that cutoff. A later
// receipt reusing the same task_id REOPENS the task — an expiry can never pre-silence
// future work. A legacy/cutoff-less expired row covers nothing (fail closed).

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { appendBoundedJsonl, resolveStateDir } from "./state-store.mjs";
import { sanitizeBoundedText } from "./telemetry.mjs";

const DEFERRALS_FILE = "evidence-deferrals.jsonl";
const BOUNDED_ID = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,119}$/;
const DISPOSITIONS = new Set(["deferred", "expired"]);
// Strict ISO-8601 WITH an explicit timezone. Zoneless timestamps parse as LOCAL time
// (a ±2h Stockholm skew can cross the 7-day staleness boundary) and Date.parse("0")
// lands in ~2000 — so anything time-sensitive must clear this before Date.parse
// (2026-07-16 Codex review F2).
const STRICT_ISO_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})$/;

export function isStrictIsoTimestamp(value) {
  return typeof value === "string" && STRICT_ISO_TZ.test(value) && Number.isFinite(Date.parse(value));
}

export function recordDisposition({ taskId, reason, disposition = "deferred", cutoff = null,
  forced = false, stateDir = null, maxEntries = 2000, at = new Date().toISOString() } = {}) {
  if (typeof taskId !== "string" || !BOUNDED_ID.test(taskId)) {
    throw new Error("taskId must be a bounded identifier");
  }
  if (!DISPOSITIONS.has(disposition)) {
    throw new Error(`disposition must be one of ${[...DISPOSITIONS].join(", ")}`);
  }
  if (typeof reason !== "string" || !reason.trim()) {
    throw new Error(disposition === "expired"
      ? "an expiry requires a reason (why this stale task will never be machine-verified)"
      : "a deferral requires a reason (why closure is not possible now)");
  }
  if (disposition === "expired" && !isStrictIsoTimestamp(cutoff)) {
    throw new Error("an expiry requires a strict ISO-8601 cutoff with timezone (the newest receipt it covers)");
  }
  const row = {
    schema_version: 1,
    at,
    task_id: taskId,
    disposition,
    ...(disposition === "expired" ? { cutoff } : {}),
    ...(forced ? { forced: true } : {}),
    reason: sanitizeBoundedText(reason.trim(), { maxLength: 300 }),
  };
  appendBoundedJsonl({ stateDir: resolveStateDir(stateDir), fileName: DEFERRALS_FILE, row, maxEntries });
  return row;
}

// Back-compat wrapper: --defer records a "deferred" disposition.
export function recordDeferral(args = {}) {
  return recordDisposition({ ...args, disposition: "deferred" });
}

// Low-level ledger write for an "expired" disposition. Preconditions (task open + stale,
// or an explicit --force) live in task-evidence.mjs expireTaskEvidence — call that, not
// this, unless you have already computed the cutoff honestly.
export function recordExpiry(args = {}) {
  return recordDisposition({ ...args, disposition: "expired" });
}

// AUDIT/legacy view: every task_id carrying ANY disposition row. NOT the gate's
// silencing semantics anymore — the gate uses readDispositionCoverage, where an
// expiry covers only receipts ≤ its cutoff. Kept for reporting and back-compat.
export function readDeferredTaskIds({ stateDir = null } = {}) {
  const file = path.join(resolveStateDir(stateDir), DEFERRALS_FILE);
  if (!existsSync(file)) return new Set();
  const ids = new Set();
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (row && typeof row.task_id === "string" && row.task_id) ids.add(row.task_id);
  }
  return ids;
}

// Full disposition rows (for reporting/audit): {task_id, disposition, cutoff, forced, reason, at}.
export function readDispositions({ stateDir = null } = {}) {
  const file = path.join(resolveStateDir(stateDir), DEFERRALS_FILE);
  if (!existsSync(file)) return [];
  const rows = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (row && typeof row.task_id === "string" && row.task_id) {
      rows.push({ task_id: row.task_id, disposition: row.disposition || "deferred",
        cutoff: typeof row.cutoff === "string" ? row.cutoff : null,
        forced: row.forced === true, reason: row.reason || null, at: row.at || null });
    }
  }
  return rows;
}

// The gate's silencing semantics:
//   - deferred: silences the task_id outright ("cannot close YET" — a later machine
//     close supersedes it with a real outcome; unchanged, designed behavior).
//   - expired: silences ONLY receipts at-or-before the recorded cutoff; a newer receipt
//     reopens the task. A cutoff-less (legacy) expired row covers NOTHING — fail closed,
//     an expiry may never silence work it did not name.
export function readDispositionCoverage({ stateDir = null } = {}) {
  const deferred = new Set();
  const expiredCutoffs = new Map();
  for (const row of readDispositions({ stateDir })) {
    if (row.disposition === "expired") {
      if (isStrictIsoTimestamp(row.cutoff)) {
        const ms = Date.parse(row.cutoff);
        const previous = expiredCutoffs.get(row.task_id);
        if (previous == null || ms > previous) expiredCutoffs.set(row.task_id, ms);
      }
    } else {
      deferred.add(row.task_id);
    }
  }
  return { deferred, expiredCutoffs };
}
