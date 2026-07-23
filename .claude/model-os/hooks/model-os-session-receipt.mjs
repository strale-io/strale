#!/usr/bin/env node
// model-os-session-receipt.mjs — Stop hook that records the OBJECTIVE main-loop routing receipt
// (idea-lab FR-311 / DEC-228). NEVER blocks: any missing field, unreadable transcript, oversized
// file, or internal error exits 0. It reads the Stop payload's `session_id`, `transcript_path`,
// and `effort.level`, and folds the newly-appended transcript bytes into the session's receipt via
// session-receipt.mjs (content-free: model ids + turn counts + token totals + effort only).
//
// Runs alongside model-os-evidence-gate.mjs on the Stop event; the two are independent (this one
// never blocks, the gate may). Regression: model-os/session-receipt.test.mjs.

import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recordSessionReceipt } from "../session-receipt.mjs";

// Generous cap: the largest observed transcript is ~70MB, but incremental reads only touch the
// newly-appended tail, so this guards only the very first Stop on a pre-existing huge transcript.
const MAX_TRANSCRIPT_BYTES = 128 * 1024 * 1024;

function main() {
  let input = {};
  try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { process.exit(0); }
  try {
    const sessionId = typeof input.session_id === "string" ? input.session_id : null;
    if (!sessionId) process.exit(0);
    const transcriptPath = typeof input.transcript_path === "string" ? input.transcript_path : null;
    let usableTranscript = null;
    if (transcriptPath) {
      try { if (statSync(transcriptPath).size <= MAX_TRANSCRIPT_BYTES) usableTranscript = transcriptPath; }
      catch { /* stat failed — record what we can without it */ }
    }
    const effort = typeof input?.effort?.level === "string" ? input.effort.level : null;
    recordSessionReceipt({
      sessionId,
      effort,
      transcriptPath: usableTranscript,
      boundModel: process.env.MODEL_OS_SESSION_MODEL_ID || null,
      surface: process.env.IDEALAB_RUNTIME || null,
    });
  } catch { /* a Stop hook must never hold a session hostage to telemetry */ }
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
