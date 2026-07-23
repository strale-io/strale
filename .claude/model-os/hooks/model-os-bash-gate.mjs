#!/usr/bin/env node
// MODEL-OS bash gate — PreToolUse hook for the Bash tool.
//
// PROBLEM (2026-07-16 audit): model-os-gate.mjs only matches Agent|Task|Workflow, so an
// agent can shell out `codex exec -m <model>` or `claude -p --model <model>` via Bash and
// launch a subscription model with zero role/calibre discipline — a structural bypass of
// the routing gate. The sanctioned role-enforced cross-provider path is `node
// model-os/dispatch.mjs` (fails closed without a ledger-qualified role); raw provider-CLI
// launches from Bash bypass that entirely.
//
// This hook closes the bypass at the ONE place it can be intercepted: the Bash tool call
// itself. It does NOT replicate model-os-gate.mjs's full role/calibre machinery — that
// lives in dispatch.mjs (see select.mjs's checkRoleQualification, shared with the gate).
// This hook only stops the two ways a raw CLI invocation dodges role discipline outright:
//   1. no explicit model at all (silently inherits the CLI default — an ungoverned launch)
//   2. a model that isn't even in the ledger (typo'd or invented name)
// A pinned, ledger-known model is ALLOWED (advisory only) — real role/calibre enforcement
// for that path is dispatch.mjs's job, and founders/agents legitimately use raw CLI calls
// for read-only probes, `codex auth`, etc. that dispatch.mjs doesn't cover.
//
// Matching is conservative and token-based (see detectInvocations below), specifically so
// it does NOT fire on: a git commit message or echo/printf string containing the words
// "codex exec", `grep codex` / `rg "codex exec"`, a path like `model-os/dispatch.mjs`
// (dispatch is the sanctioned path — invoked via `node`, never a provider-CLI launch),
// or a `# codex exec ...` shell comment.
//
// Failure behavior: fail-open on any parse error / internal exception, and when no ledger
// is found anywhere (same non-bricking philosophy as model-os-gate.mjs; the health hook
// reports a missing ledger separately) — a PreToolUse hook must never brick ordinary Bash
// use on malformed input or an unrelated repo/machine state.
//
// Contract: reads the tool call as JSON on stdin; exit 2 + stderr blocks and shows the
// message to the agent; exit 0 allows (with an optional stderr advisory). Regression
// suite: model-os/test-model-os-bash-gate.ps1.

import { readFileSync } from "node:fs";
import { findLedger } from "../select.mjs";

function block(msg) {
  process.stderr.write(msg + "\n");
  process.exit(2);
}

function basename(token) {
  const normalized = token.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1];
}

// Split a shell command into simple-command segments on unquoted &&, ||, |, ;, and
// newline, and drop unquoted `# ...` shell comments. Quote-aware (single/double/backtick)
// so none of this fires inside a quoted string — a git commit message or echo argument
// stays one opaque token, never inspected for sub-tokens.
function splitSegments(command) {
  const segments = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      current += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      current += c;
      continue;
    }
    if (c === "#" && (current.length === 0 || /\s$/.test(current))) {
      while (i < command.length && command[i] !== "\n") i++;
      continue;
    }
    if ((c === "&" && command[i + 1] === "&") || (c === "|" && command[i + 1] === "|")) {
      segments.push(current);
      current = "";
      i++;
      continue;
    }
    if (c === "|" || c === ";" || c === "\n") {
      segments.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  segments.push(current);
  return segments.map((s) => s.trim()).filter(Boolean);
}

// Whitespace tokenizer, quote-aware (quotes are stripped, their contents kept as one
// token) so `"codex exec"` stays a single opaque token, never two.
function tokenize(segment) {
  const tokens = [];
  let current = "";
  let inToken = false;
  let quote = null;
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    if (quote) {
      if (c === quote) { quote = null; continue; }
      current += c;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; inToken = true; continue; }
    if (/\s/.test(c)) {
      if (inToken) { tokens.push(current); current = ""; inToken = false; }
      continue;
    }
    current += c;
    inToken = true;
  }
  if (inToken) tokens.push(current);
  return tokens;
}

const CODEX_RE = /^codex(\.cmd|\.exe)?$/i;
const CLAUDE_RE = /^claude(\.cmd|\.exe)?$/i;

// Find every provider-CLI *invocation* across the whole command line: a token that IS the
// program `codex`/`codex.cmd`/`codex.exe` (optionally path-prefixed) followed by the
// `exec` subcommand, or `claude`/`claude.cmd` followed by `-p`/`--print`. Leading env-var
// assignments (`FOO=bar codex exec ...`) are skipped when identifying the program token.
// `node model-os/dispatch.mjs ...` / `node model-os/probe-entitlement.mjs ...` never match
// — the invoked program is `node`, not codex/claude, regardless of later arguments.
function detectInvocations(command) {
  const invocations = [];
  for (const segment of splitSegments(command)) {
    const tokens = tokenize(segment);
    let start = 0;
    while (start < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[start])) start++;
    if (start >= tokens.length) continue;
    const rest = tokens.slice(start);
    const program = rest[0];
    const base = basename(program);
    if (CODEX_RE.test(base)) {
      if (rest[1] === "exec") invocations.push({ cli: "codex", tokens: rest });
      continue;
    }
    if (CLAUDE_RE.test(base)) {
      if (rest.slice(1).some((t) => t === "-p" || t === "--print")) {
        invocations.push({ cli: "claude", tokens: rest });
      }
    }
  }
  return invocations;
}

function extractModelFlag(tokens, flags) {
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (flags.includes(t)) return i + 1 < tokens.length ? tokens[i + 1] : "";
    for (const flag of flags) {
      if (t.startsWith(flag + "=")) return t.slice(flag.length + 1);
    }
  }
  return null;
}

function main() {
  let raw = "";
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    process.exit(0);
  }
  let payload;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    process.exit(0); // can't even identify the tool call — not ours to judge
  }

  try {
    const command = payload?.tool_input?.command;
    if (typeof command !== "string" || !command.trim()) process.exit(0);

    const invocations = detectInvocations(command);
    if (!invocations.length) process.exit(0); // no bare provider-CLI launch in this command

    const ledgerPath = findLedger();
    if (!ledgerPath) process.exit(0); // no ledger anywhere — the health hook flags this separately

    let ledger;
    try {
      ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
    } catch {
      process.exit(0); // broken ledger — not this hook's job to enforce (see model-os-gate.mjs)
    }
    const models = Array.isArray(ledger?.models) ? ledger.models : [];
    const aliases = models.map((m) => m.alias).filter(Boolean).join("/") || "see routing.json";

    const advisories = [];
    for (const invocation of invocations) {
      const flags = invocation.cli === "codex" ? ["-m", "--model"] : ["--model"];
      const cliLabel = invocation.cli === "codex" ? "codex exec" : "claude -p";
      const model = extractModelFlag(invocation.tokens, flags);

      if (model === null) {
        block(
          `BLOCKED (MODEL-OS-BASH): bare '${cliLabel}' has no explicit model flag and would ` +
          "silently inherit the CLI default — an ungoverned top-tier launch outside routing. " +
          `Either pin a ledger-known model (${aliases}) with ${invocation.cli === "codex" ? "-m/--model" : "--model"}, ` +
          "or, for role-enforced cross-provider work, route through `node model-os/dispatch.mjs` " +
          "(enforces FR-224 role discipline)."
        );
      }
      const entry = models.find(
        (m) => m.alias?.toLowerCase() === model.toLowerCase() || m.id?.toLowerCase() === model.toLowerCase()
      );
      if (!entry) {
        block(
          `BLOCKED (MODEL-OS-BASH): '${cliLabel}' pins '${model}', which is not in the ledger ` +
          `(${ledgerPath}). Known: ${aliases}. Update the ledger first — never launch an ` +
          "unregistered model name."
        );
      }
      // Effort must be EXPLICIT, never inherited (2026-07-17, self-report #5 — the third
      // distinct invocation path found running reviews at the CLI's default reasoning while
      // the roster said @high; per-tool fixes don't close the class, this chokepoint does).
      // The ledger's effort_controls map the abstract roster tier to the provider control
      // (e.g. sol: high -> xhigh), so the hint names the mapped value, not the raw tier.
      if (invocation.cli === "codex") {
        const hasEffort = invocation.tokens.some((t, i) =>
          t === "model_reasoning_effort" || t.startsWith("model_reasoning_effort=") ||
          ((t === "-c" || t === "--config") && String(invocation.tokens[i + 1] || "").startsWith("model_reasoning_effort=")));
        if (!hasEffort) {
          const suggested = entry.effort_controls?.high || entry.default_effort || "high";
          block(
            `BLOCKED (MODEL-OS-BASH): '${cliLabel} -m ${model}' sets no reasoning effort and would ` +
            "silently run at the CLI default — the roster's @<effort> was selected but never applied " +
            "(the recurring under-provisioning gap). Add the ledger-mapped provider control, e.g. " +
            `'-c model_reasoning_effort=${suggested}' (abstract high maps to '${suggested}' for ${model}), ` +
            "or route through `node model-os/dispatch.mjs` / `tools/codex-review.mjs`, which apply it."
          );
        }
      }
      advisories.push(
        `MODEL-OS-BASH advisory: '${cliLabel} ... ${invocation.cli === "codex" ? "-m" : "--model"} ${model}' ` +
        "is a raw provider-CLI launch — it bypasses role/calibre enforcement. For role-governed " +
        "cross-provider work, prefer `node model-os/dispatch.mjs`."
      );
    }
    if (advisories.length) process.stderr.write(advisories.join("\n") + "\n");
    process.exit(0);
  } catch {
    process.exit(0); // never brick Bash on an internal error
  }
}

main();
