#!/usr/bin/env node
/**
 * Strale session-state manager (ported from tilja 2026-05-20).
 *
 * Auto-create-if-missing pattern:
 *   - ensure(): called by a SessionStart hook (or lazily by /end-session).
 *     Returns the current session-state, creates a fresh one if missing,
 *     archives + rotates if the existing one is older than STALE_HOURS (12h).
 *   - end(): archive the current session (called by /end-session command).
 *   - read(): read-only — does not mutate.
 *
 * State files (gitignored — see .gitignore '.claude/state/'):
 *   - .claude/state/session-state.json    live marker for the current session
 *   - .claude/state/session-archive/      closed sessions, named by timestamp+SHA
 *
 * Why this exists: session-close-check.ts previously used a fixed
 * "now - 6h" window to scope its checks, which truncated long sessions
 * and inflated short ones. With a persistent marker, the close-check
 * filters by the actual session start.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATE_DIR = resolve(REPO_ROOT, ".claude/state");
const STATE_FILE = resolve(STATE_DIR, "session-state.json");
const ARCHIVE_DIR = resolve(STATE_DIR, "session-archive");
const STALE_HOURS = 12;

function gitHead() {
  return execSync("git rev-parse HEAD", { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
}
function gitBranch() {
  return execSync("git rev-parse --abbrev-ref HEAD", {
    cwd: REPO_ROOT,
    encoding: "utf-8",
  }).trim();
}
function now() {
  return new Date().toISOString();
}

function ensureDirs() {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  if (!existsSync(ARCHIVE_DIR)) mkdirSync(ARCHIVE_DIR, { recursive: true });
}

function archiveCurrent(state) {
  ensureDirs();
  const archivedAt = now().replace(/[:.]/g, "-");
  const shortSha = (state.starting_commit ?? "unknown").slice(0, 8);
  const archivePath = resolve(ARCHIVE_DIR, `${archivedAt}-${shortSha}.json`);
  state.archived_at = now();
  writeFileSync(archivePath, JSON.stringify(state, null, 2));
  return archivePath;
}

function createNew(notes = "auto-created") {
  ensureDirs();
  const state = {
    session_started_at: now(),
    starting_commit: gitHead(),
    starting_branch: gitBranch(),
    notes,
  };
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  return state;
}

export function ensure() {
  if (!existsSync(STATE_FILE)) {
    return { state: createNew(), action: "created" };
  }

  const existing = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  const ageMs = Date.now() - new Date(existing.session_started_at).getTime();
  const ageHours = ageMs / 1000 / 3600;

  if (ageHours > STALE_HOURS) {
    const archivePath = archiveCurrent(existing);
    return {
      state: createNew(
        `auto-created after archiving stale session (${archivePath})`,
      ),
      action: "rotated",
      archived: archivePath,
    };
  }

  return { state: existing, action: "existing" };
}

export function end(notes = "manually ended") {
  if (!existsSync(STATE_FILE)) return { action: "no-session-to-end" };

  const state = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  state.ended_at = now();
  state.end_notes = notes;
  state.ending_commit = gitHead();
  state.ending_branch = gitBranch();

  const startMs = new Date(state.session_started_at).getTime();
  const endMs = new Date(state.ended_at).getTime();
  state.duration_ms = endMs - startMs;

  const archivePath = archiveCurrent(state);
  unlinkSync(STATE_FILE);
  return {
    action: "ended",
    archived: archivePath,
    session_started_at: state.session_started_at,
    ended_at: state.ended_at,
    duration_ms: state.duration_ms,
    starting_commit: state.starting_commit,
    ending_commit: state.ending_commit,
    starting_branch: state.starting_branch,
    ending_branch: state.ending_branch,
  };
}

export function read() {
  if (!existsSync(STATE_FILE)) return null;
  return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
}

// CLI entry point: `node scripts/session-state.mjs <ensure|end|read> [notes]`.
// pathToFileURL normalises Windows paths to the same scheme as
// import.meta.url ("file:///C:/..."), avoiding a backslash-vs-forward-slash
// mismatch that would silently skip the CLI block on Windows.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2];
  if (cmd === "ensure") {
    console.log(JSON.stringify(ensure(), null, 2));
  } else if (cmd === "end") {
    console.log(JSON.stringify(end(process.argv[3] ?? "manually ended"), null, 2));
  } else if (cmd === "read") {
    console.log(JSON.stringify(read(), null, 2));
  } else {
    console.error("Usage: node scripts/session-state.mjs <ensure|end|read> [notes]");
    process.exit(1);
  }
}
