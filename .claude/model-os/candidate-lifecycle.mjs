#!/usr/bin/env node
// Durable, local candidate lifecycle and separate rumor watchlist. Registry
// qualification remains human-ratified; this state can quarantine but not add a route.

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireWriteLock, appendBoundedJsonl, atomicWriteFile, releaseWriteLock, resolveStateDir } from "./state-store.mjs";
import { appendTelemetryEvent, hashOperationalValue, telemetryEnabled } from "./telemetry.mjs";
import { CANDIDATE_STATES, LIFECYCLE_SCHEMA_VERSION, TRANSITION_FILE, lifecyclePath, readLifecycle } from "./lifecycle-state.mjs";

export { CANDIDATE_STATES, LIFECYCLE_SCHEMA_VERSION, lifecyclePath, readLifecycle } from "./lifecycle-state.mjs";

export { TRANSITION_FILE } from "./lifecycle-state.mjs";
export const WATCH_FILE = "candidate.watch.jsonl";
const TRANSITIONS = new Map([
  ["discovered", new Set(["entitlement-check", "quarantined", "rejected"])],
  ["entitlement-check", new Set(["available-unassessed", "quarantined", "rejected"])],
  ["available-unassessed", new Set(["evaluating", "quarantined", "rejected"])],
  ["evaluating", new Set(["shadow", "available-unassessed", "quarantined", "rejected"])],
  ["shadow", new Set(["qualified", "available-unassessed", "quarantined", "rejected"])],
  ["qualified", new Set(["quarantined"])],
  ["quarantined", new Set(["available-unassessed", "rejected"])],
  ["rejected", new Set()],
]);
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._:@/|+-]{0,239}$/;

function safe(value, name) {
  if (typeof value !== "string" || !SAFE.test(value)) throw new Error(`${name} must be a bounded identifier`);
  return value;
}

function readJournal(stateDir) {
  const file = path.join(resolveStateDir(stateDir), TRANSITION_FILE);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`transition journal line ${index + 1}: ${error.message}`); }
  });
}

function normalizeTransition(input, current) {
  const candidateId = safe(input.candidate_id || input.candidateId, "candidate_id");
  const provider = safe(input.provider, "provider");
  const to = safe(input.to, "to");
  if (!CANDIDATE_STATES.has(to)) throw new Error(`candidate state '${to}' is invalid`);
  const from = current?.state || null;
  const expected = input.expected_state ?? input.expectedState ?? from;
  if (expected !== from) throw new Error(`stale-state: expected '${expected}', found '${from || "none"}'`);
  if (from == null && to !== "discovered") throw new Error("new candidates must enter at discovered");
  if (from != null && !TRANSITIONS.get(from)?.has(to)) throw new Error(`transition '${from}' -> '${to}' is not allowed`);
  const evidenceIds = [...new Set(input.evidence_ids || input.evidenceIds || [])];
  if (evidenceIds.length > 20) throw new Error("evidence_ids must contain at most 20 identifiers");
  evidenceIds.forEach((id) => safe(id, "evidence id"));
  if (!["discovered", "quarantined", "rejected"].includes(to) && evidenceIds.length === 0) {
    throw new Error(`transition to '${to}' requires evidence_ids`);
  }
  return {
    schema_version: LIFECYCLE_SCHEMA_VERSION,
    transition_id: safe(input.transition_id || input.transitionId || randomUUID(), "transition_id"),
    at: input.at || new Date().toISOString(), candidate_id: candidateId, provider,
    from_state: from, to_state: to, reason_code: safe(input.reason_code || input.reasonCode || "manual-transition", "reason_code"),
    evidence_ids: evidenceIds, actor: safe(input.actor || "operator", "actor"),
    attempt_count: Number.isInteger(input.attempt_count) && input.attempt_count >= 0 ? input.attempt_count : Number(current?.attempt_count || 0) + 1,
    retry_eligible: input.retry_eligible == null ? to !== "rejected" : Boolean(input.retry_eligible),
  };
}

export function transitionCandidate(input, { stateDir = null, maxEntries = 2000, telemetry = true,
  appendTransition = appendBoundedJsonl, writeSnapshot = atomicWriteFile } = {}) {
  const dir = resolveStateDir(stateDir);
  const lock = acquireWriteLock(dir, { lockName: "candidate-lifecycle.lock" });
  let row; let next; let idempotent = false;
  try {
    const snapshot = readLifecycle({ stateDir: dir });
    if (snapshot.errors.length) throw new Error(snapshot.errors.join("; "));
    const journal = readJournal(dir);
    const requestedId = input.transition_id || input.transitionId;
    if (requestedId) {
      const prior = journal.find((item) => item.transition_id === requestedId);
      if (prior) { row = prior; next = snapshot; idempotent = true; }
    }
    if (!idempotent) {
      const current = snapshot.candidates[input.candidate_id || input.candidateId] || null;
      row = normalizeTransition(input, current);
      appendTransition({ stateDir: dir, fileName: TRANSITION_FILE, row, maxEntries });
      const record = { candidate_id: row.candidate_id, provider: row.provider, state: row.to_state,
        reason_code: row.reason_code, evidence_ids: row.evidence_ids, transitioned_at: row.at,
        last_transition_id: row.transition_id, attempt_count: row.attempt_count, retry_eligible: row.retry_eligible };
      next = { schema_version: LIFECYCLE_SCHEMA_VERSION, generated_at: row.at,
        journal_head_transition_id: row.transition_id, journal_entry_count: Math.min(journal.length + 1, maxEntries),
        candidates: { ...snapshot.candidates, [row.candidate_id]: record } };
      writeSnapshot(lifecyclePath(dir), `${JSON.stringify(next, null, 2)}\n`);
    }
  } finally { releaseWriteLock(lock); }
  if (idempotent) return { row, idempotent: true, snapshot: next };
  if (telemetry && telemetryEnabled()) {
    try { appendTelemetryEvent({ run_id: row.transition_id, at: row.at, component: "lifecycle", event: "lifecycle.transitioned",
      status: "completed", candidate_id: row.candidate_id, provider: row.provider, from_state: row.from_state || "none",
      to_state: row.to_state, reason_code: row.reason_code, attempt_count: row.attempt_count,
      retry_eligible: row.retry_eligible, evidence_ids: row.evidence_ids }, { stateDir, maxEntries }); } catch {}
  }
  return { row, idempotent: false, snapshot: next };
}

function validateJournalTransition(row, current, seenIds) {
  if (!row || row.schema_version !== LIFECYCLE_SCHEMA_VERSION) throw new Error("journal row schema unsupported");
  for (const [value, name] of [[row.transition_id, "transition_id"], [row.candidate_id, "candidate_id"],
    [row.provider, "provider"], [row.reason_code, "reason_code"], [row.actor, "actor"]]) safe(value, name);
  if (seenIds.has(row.transition_id)) throw new Error(`duplicate transition id '${row.transition_id}'`);
  seenIds.add(row.transition_id);
  if (!Number.isFinite(Date.parse(row.at))) throw new Error(`journal transition '${row.transition_id}' timestamp invalid`);
  if (!CANDIDATE_STATES.has(row.to_state)) throw new Error(`journal transition '${row.transition_id}' target invalid`);
  if (row.from_state != null && !CANDIDATE_STATES.has(row.from_state)) throw new Error(`journal transition '${row.transition_id}' prior invalid`);
  if ((current?.state || null) !== row.from_state) throw new Error(`journal transition '${row.transition_id}' has non-contiguous prior state`);
  if (current == null && row.to_state !== "discovered") throw new Error(`journal transition '${row.transition_id}' skips discovery`);
  if (current && !TRANSITIONS.get(current.state)?.has(row.to_state)) throw new Error(`journal transition '${row.transition_id}' is not allowed`);
  if (current?.provider && current.provider !== row.provider) throw new Error(`journal transition '${row.transition_id}' changes provider`);
  if (!Array.isArray(row.evidence_ids) || row.evidence_ids.length > 20) throw new Error(`journal transition '${row.transition_id}' evidence invalid`);
  row.evidence_ids.forEach((id) => safe(id, "evidence id"));
  if (!Number.isInteger(row.attempt_count) || row.attempt_count < 0 || typeof row.retry_eligible !== "boolean") {
    throw new Error(`journal transition '${row.transition_id}' retry metadata invalid`);
  }
}

export function replayLifecycle({ stateDir = null } = {}) {
  const dir = resolveStateDir(stateDir);
  const lock = acquireWriteLock(dir, { lockName: "candidate-lifecycle.lock" });
  try {
    const rows = readJournal(dir); const candidates = {}; const seenIds = new Set();
    for (const row of rows) {
      const current = candidates[row.candidate_id] || null;
      validateJournalTransition(row, current, seenIds);
      candidates[row.candidate_id] = { candidate_id: row.candidate_id, provider: row.provider, state: row.to_state,
        reason_code: row.reason_code, evidence_ids: row.evidence_ids, transitioned_at: row.at,
        last_transition_id: row.transition_id, attempt_count: row.attempt_count, retry_eligible: row.retry_eligible };
    }
    const snapshot = { schema_version: LIFECYCLE_SCHEMA_VERSION, generated_at: new Date().toISOString(),
      journal_head_transition_id: rows.at(-1)?.transition_id || null, journal_entry_count: rows.length, candidates };
    atomicWriteFile(lifecyclePath(dir), `${JSON.stringify(snapshot, null, 2)}\n`);
    return snapshot;
  } finally { releaseWriteLock(lock); }
}

export function watchRumor(input, { stateDir = null, maxEntries = 1000 } = {}) {
  const row = { schema_version: 1, id: randomUUID(), at: input.at || new Date().toISOString(), status: "watch",
    provider: safe(input.provider, "provider"), source_class: safe(input.source_class || input.sourceClass, "source_class"),
    watch_label: safe(input.watch_label || input.watchLabel, "watch_label"),
    claim_hash: input.claim_hash || input.claimHash || hashOperationalValue(input.claim || input.watch_label || input.watchLabel) };
  if (!/^[a-f0-9]{64}$/.test(row.claim_hash)) throw new Error("claim_hash must be sha256");
  const dir = resolveStateDir(stateDir);
  const lock = acquireWriteLock(dir, { lockName: "candidate-watch-cas.lock" });
  try {
    const watch = readWatchlist({ stateDir: dir });
    if (watch.errors.length) throw new Error(`candidate watchlist unreadable: ${watch.errors.join("; ")}`);
    const prior = watch.rows.find((item) => item.provider === row.provider && item.source_class === row.source_class
      && item.watch_label === row.watch_label && item.claim_hash === row.claim_hash);
    if (prior) return { ...prior, idempotent: true };
    appendBoundedJsonl({ stateDir: dir, fileName: WATCH_FILE, row, maxEntries });
  } finally { releaseWriteLock(lock); }
  if (telemetryEnabled()) {
    try { appendTelemetryEvent({ run_id: row.id, at: row.at, component: "lifecycle", event: "rumor.watched", status: "watch",
      provider: row.provider, source_class: row.source_class, watch_label: row.watch_label, claim_hash: row.claim_hash }, { stateDir, maxEntries }); } catch {}
  }
  return row;
}

export function readWatchlist({ stateDir = null } = {}) {
  const file = path.join(resolveStateDir(stateDir), WATCH_FILE);
  if (!existsSync(file)) return { rows: [], errors: [], file };
  const rows = []; const errors = [];
  readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).forEach((line, index) => {
    try { const row = JSON.parse(line); if (row.status !== "watch") throw new Error("status is not watch"); rows.push(row); }
    catch (error) { errors.push(`line ${index + 1}: ${error.message}`); }
  });
  return { rows, errors, file };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) { const key = argv[i].replace(/^--/, ""); args[key] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true; }
  return args;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.replay) { process.stdout.write(`${JSON.stringify(replayLifecycle({ stateDir: args["state-dir"] }), null, 2)}\n`); return 0; }
  if (!args["input-file"]) throw new Error("--input-file is required");
  const input = JSON.parse(readFileSync(path.resolve(args["input-file"]), "utf8"));
  const result = args.rumor ? watchRumor(input, { stateDir: args["state-dir"] }) : transitionCandidate(input, { stateDir: args["state-dir"] });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((error) => { process.stderr.write(`MODEL-OS lifecycle error: ${error.message}\n`); process.exitCode = 3; });
}
