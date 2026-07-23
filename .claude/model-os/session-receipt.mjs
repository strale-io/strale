#!/usr/bin/env node
// session-receipt.mjs (idea-lab FR-311 / DEC-228) — the OBJECTIVE main-loop routing record.
//
// WHY THIS EXISTS: dispatched work (subagents via dispatch.mjs) leaves auto-linked receipts with
// exact identity + verification, so the field-review can audit it against ground truth. The
// ORCHESTRATOR — the session's own main loop, where most tokens are spent — left no receipt, so
// the review could only trust the session's self-report for main-loop routing (the last named
// residual of the routing loop). The Stop hook payload carries no `model`, BUT it carries
// `transcript_path`, and the transcript records `message.model` + `message.usage` on every
// assistant turn — objective ground truth. This module turns that into a per-session receipt.
//
// CONTENT-FREE (strict, same doctrine as dispatch receipts): only model ids, integer turn counts,
// integer token totals, and the effort string are extracted. Prompt/message/tool text is NEVER
// read into the receipt. This is routing PROVENANCE, not performance evidence — a session has no
// single verification outcome, so a session receipt NEVER feeds capability scoring.
//
// INCREMENTAL: Stop fires once per TURN (there is no session-end event), and transcripts reach
// tens of MB. A full re-parse every turn is O(N^2). Instead we persist a byte OFFSET per session
// and tally only the bytes appended since the last Stop. Truncation (size < offset) resets to 0.
// A partial trailing line (no newline yet) is left for the next Stop by advancing the offset only
// to the last newline boundary.

import { openSync, fstatSync, readSync, closeSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWriteFile, resolveStateDir } from "./state-store.mjs";

export const SESSION_RECEIPTS_FILE = "session.receipts.json";
export const SESSION_SCHEMA_VERSION = 1;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const EFFORT = /^[a-z]{1,12}$/;

// Tally per-model assistant turns + tokens from a chunk of transcript JSONL. Pure, content-free.
// Returns { models: { id: {turns, input_tokens, output_tokens} }, turns }.
export function tallyTranscriptChunk(text) {
  const models = {};
  let turns = 0;
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    const msg = row?.message;
    const isAssistant = row?.type === "assistant" || msg?.role === "assistant";
    if (!isAssistant) continue;
    const id = msg?.model || row?.model;
    if (typeof id !== "string" || !MODEL_ID.test(id)) continue;
    turns++;
    const bucket = models[id] || (models[id] = { turns: 0, input_tokens: 0, output_tokens: 0 });
    bucket.turns++;
    const u = msg?.usage || {};
    if (Number.isFinite(u.input_tokens)) bucket.input_tokens += u.input_tokens;
    if (Number.isFinite(u.output_tokens)) bucket.output_tokens += u.output_tokens;
  }
  return { models, turns };
}

// Merge a chunk tally into a running per-model map (mutates + returns `into`).
export function mergeTally(into, chunk) {
  for (const [id, b] of Object.entries(chunk.models || {})) {
    const dst = into[id] || (into[id] = { turns: 0, input_tokens: 0, output_tokens: 0 });
    dst.turns += b.turns; dst.input_tokens += b.input_tokens; dst.output_tokens += b.output_tokens;
  }
  return into;
}

export function primaryModel(models) {
  let primary = null, max = -1;
  for (const [id, b] of Object.entries(models || {})) if (b.turns > max) { max = b.turns; primary = id; }
  return primary;
}

// Read transcript bytes from `offset` to EOF; return { text, nextOffset, reset }. `text` ends at the
// last newline (a partial trailing line is left for next time). reset=true when the file shrank.
function readSince(transcriptPath, offset) {
  const fd = openSync(transcriptPath, "r");
  try {
    const size = fstatSync(fd).size;
    let start = offset;
    let reset = false;
    if (!Number.isInteger(start) || start < 0 || start > size) { start = 0; reset = true; }
    const length = size - start;
    if (length <= 0) return { text: "", nextOffset: size, reset };
    const buf = Buffer.allocUnsafe(length);
    const read = readSync(fd, buf, 0, length, start);
    const lastNl = buf.lastIndexOf(0x0a, read - 1);
    if (lastNl < 0) return { text: "", nextOffset: start, reset }; // no complete line yet
    return { text: buf.toString("utf8", 0, lastNl + 1), nextOffset: start + lastNl + 1, reset };
  } finally { closeSync(fd); }
}

export function sessionReceiptsPath(stateDir = null) {
  return path.join(resolveStateDir(stateDir), SESSION_RECEIPTS_FILE);
}

export function readSessionReceipts({ stateDir = null } = {}) {
  const file = sessionReceiptsPath(stateDir);
  if (!existsSync(file)) return { schema_version: SESSION_SCHEMA_VERSION, sessions: {} };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (parsed?.schema_version === SESSION_SCHEMA_VERSION && parsed.sessions && typeof parsed.sessions === "object") return parsed;
  } catch { /* corrupt = start clean, never throw on the hot path */ }
  return { schema_version: SESSION_SCHEMA_VERSION, sessions: {} };
}

// Upsert one session's objective routing record. Incremental: reads only bytes appended since the
// last call. Returns the updated row. Never throws on a missing/short transcript — records what it can.
export function recordSessionReceipt({ sessionId, effort = null, transcriptPath = null, boundModel = null,
  surface = null, stateDir = null, now = new Date().toISOString(), maxSessions = 500 } = {}) {
  if (typeof sessionId !== "string" || !sessionId) throw new Error("sessionId is required");
  const store = readSessionReceipts({ stateDir });
  const prev = store.sessions[sessionId] || { offset: 0, models: {} };
  let models = prev.models || {};
  let offset = Number.isInteger(prev.offset) ? prev.offset : 0;

  if (transcriptPath && existsSync(transcriptPath)) {
    try {
      const { text, nextOffset, reset } = readSince(transcriptPath, offset);
      if (reset) models = {};
      mergeTally(models, tallyTranscriptChunk(text));
      offset = nextOffset;
    } catch { /* transcript unreadable this tick — keep the prior tally, never block the stop */ }
  }

  const totalTurns = Object.values(models).reduce((s, b) => s + b.turns, 0);
  const primary = primaryModel(models);
  const row = {
    session_id: sessionId, at: now, offset,
    primary_model: primary, models, total_turns: totalTurns,
    effort: typeof effort === "string" && EFFORT.test(effort) ? effort : null,
    bound_model: typeof boundModel === "string" && MODEL_ID.test(boundModel) ? boundModel : null,
    surface: typeof surface === "string" && /^[a-z-]{1,32}$/.test(surface) ? surface : null,
    identity_source: primary ? "transcript" : "unknown",
    // The self-grading antidote for the field-review: did the explicit binding match what ACTUALLY ran?
    binding_matches: (boundModel && primary) ? boundModel === primary : null,
  };
  store.sessions[sessionId] = row;

  // Bound the keyed store: drop the oldest sessions by `at` beyond maxSessions.
  const ids = Object.keys(store.sessions);
  if (ids.length > maxSessions) {
    const keep = new Set(ids.sort((a, b) => String(store.sessions[b].at).localeCompare(String(store.sessions[a].at))).slice(0, maxSessions));
    for (const id of ids) if (!keep.has(id)) delete store.sessions[id];
  }
  atomicWriteFile(sessionReceiptsPath(stateDir), JSON.stringify(store, null, 2) + "\n");
  return row;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // CLI: print the current session receipts (read-only) for the field-review / status.
  const store = readSessionReceipts({});
  process.stdout.write(JSON.stringify(store, null, 2) + "\n");
}
