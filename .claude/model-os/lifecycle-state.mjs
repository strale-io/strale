// Lightweight read-only candidate lifecycle view for the routing hot path.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolveStateDir } from "./state-store.mjs";

export const LIFECYCLE_SCHEMA_VERSION = 1;
export const LIFECYCLE_FILE = "candidate-lifecycle.json";
export const TRANSITION_FILE = "candidate.transitions.jsonl";
export const CANDIDATE_STATES = new Set(["discovered", "entitlement-check", "available-unassessed", "evaluating", "shadow", "qualified", "quarantined", "rejected"]);
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._:@/|+-]{0,239}$/;

export function lifecyclePath(stateDir = null) { return path.join(resolveStateDir(stateDir), LIFECYCLE_FILE); }

export function readLifecycle({ stateDir = null } = {}) {
  const file = lifecyclePath(stateDir);
  const journal = path.join(resolveStateDir(stateDir), TRANSITION_FILE);
  const journalLines = existsSync(journal) ? readFileSync(journal, "utf8").split(/\r?\n/).filter(Boolean) : [];
  let journalHead = null;
  let journalError = null;
  if (journalLines.length) {
    try {
      const row = JSON.parse(journalLines.at(-1));
      if (!SAFE.test(row?.transition_id || "")) throw new Error("journal head transition id invalid");
      journalHead = row.transition_id;
    } catch (error) { journalError = error.message; }
  }
  if (!existsSync(file)) {
    const errors = journalLines.length ? [journalError
      ? `candidate transition journal unreadable (${journal}): ${journalError}`
      : `candidate lifecycle snapshot missing while journal head is '${journalHead}'; replay required`] : [];
    return { schema_version: LIFECYCLE_SCHEMA_VERSION, generated_at: null, candidates: {}, errors, file };
  }
  try {
    if (journalError) throw new Error(`transition journal unreadable: ${journalError}`);
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (parsed?.schema_version !== LIFECYCLE_SCHEMA_VERSION || !parsed.candidates || typeof parsed.candidates !== "object" || Array.isArray(parsed.candidates)) {
      throw new Error("schema unsupported");
    }
    for (const [id, record] of Object.entries(parsed.candidates)) {
      if (!SAFE.test(id)) throw new Error("candidate id invalid");
      if (!CANDIDATE_STATES.has(record?.state)) throw new Error(`candidate '${id}' state invalid`);
    }
    if ((parsed.journal_head_transition_id || null) !== journalHead || Number(parsed.journal_entry_count || 0) !== journalLines.length) {
      throw new Error("snapshot and transition journal are not synchronized; replay required");
    }
    return { ...parsed, errors: [], file };
  } catch (error) {
    return { schema_version: LIFECYCLE_SCHEMA_VERSION, generated_at: null, candidates: {}, errors: [`candidate lifecycle unreadable (${file}): ${error.message}`], file };
  }
}
