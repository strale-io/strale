---
name: "source-command-end-session"
description: "End-of-session verification — runs the close-check, then writes the handoff file with its session-log front matter, and surfaces loose threads."
---

# source-command-end-session

Use this skill when the user asks to run the migrated source command `end-session`.

## Command Template

# /end-session — verify, then write session artifacts + surface loose threads

Purpose: complete CLAUDE.md's Quick Session Checklist on Petter's behalf (AGENTS.md → "Session Checklists" carries the Codex-flavored pointer to the same list — AGENTS.md has no numbered checklist of its own, CLAUDE.md's is canonical). **This command DOES write the handoff file, with front matter carrying session identity** — that's the standing preference (set 2026-04-27, carried into repo-native form at the M4 cutover). It still does not create `docs/company/DECISION-QUEUE.md` entries, `docs/decisions/records/` files, or other governance artifacts without explicit per-item approval, and it does not mutate a program register's `next_action` beyond flagging drift.

Run these steps in order. After the checks, write the artifact (step 2, with the front matter added in step 3) before producing the final report.

## 1. Run the codebase close-check script

```
cd apps/api && npx tsx --env-file=../../.env scripts/session-close-check.ts
```

Checks git integrity, DB↔code parity, stuck caps, open breakers, uncommitted handoff files. Exit codes: `0` clean, `1` warnings, `2` blockers. Capture findings for the final report.

## 2. Write the session handoff file (CLAUDE.md Quick Session Checklist)

Author a handoff file at `handoff/_general/from-code/YYYY-MM-DD-<topic>.md` covering this session's work. Convention:

- First line is `Intent:` summarizing what the session set out to do.
- Body covers what shipped, what's open, non-obvious learnings, and cost (if any).
- Topic slug should be specific enough that future-you can grep for it (e.g. `x402scan-indexing-and-pr-cleanup`, not `cleanup`).

If a handoff file authored *this session* already exists for today's topic (e.g. an earlier `/go` invocation already wrote one), don't duplicate — report its path. Only one handoff per topic per day; if the session covered two distinct topics, write two files.

If the session was genuinely trivial (single trivial fix, nothing worth recording), still write a one-line handoff. Skipping is Petter's call, not yours.

## 3. Add the session-log front matter to the handoff file

Above the `Intent:` line, add a YAML front-matter block carrying what the Notion Journal entry used to carry:

```yaml
---
title: "Session log - <topic> YYYY-MM-DD"
type: session
source: code
actor: Codex
action_required: false    # true if the session left explicit follow-ups for Petter
---
Intent: <one line, as today>
```

`action_required: true` means a `docs/company/DECISION-QUEUE.md` `your_call` entry is open from this session, not a general reading-list flag (settled by `DQ-32` in `docs/company/DECISION-QUEUE.md`).

If a front-matter block for this session's handoff already exists (the file was written earlier this session), don't duplicate it — report its path.

**What this step does NOT do:**
- Create `docs/company/DECISION-QUEUE.md` or `docs/decisions/records/` entries — those still require explicit Petter approval per AGENTS.md governance authority thresholds.
- Mutate a program register's `next_action` — flag drift only.
- Update memory unless explicitly asked.

## 4. Check the active track's `next_action` for drift (replaces the Notion To-do DB query, which listed "in progress" items owned by `Codex`)

Read the active track's `next_action` in `docs/programs/*/tracks.yaml` (`npm run programs:check` validates the register itself):

a. **Does the active track's `next_action` still describe reality** after this session's work? If the session advanced or completed a batch, the `next_action` text must say so. Flag drift; do not silently leave a stale `next_action`.
b. There is no repo-native "in progress, owned by `Codex`" per-item list to check against — the register carries one `next_action` narrative per track, not a per-item ownership column.

Do NOT mutate `next_action`. Flag only.

## 5. Check for contradictions / unlogged decisions

Review the conversation for signals that require governance action per AGENTS.md:

- **Decisions made** (the user authorized a non-trivial tradeoff): check `docs/company/DECISION-QUEUE.md` for a `decided` entry and `docs/decisions/records/` for a formal record matching it; flag if neither exists.
- **Decisions Petter needs to make**: check `docs/company/DECISION-QUEUE.md` for a `your_call` entry matching anything this session surfaced that needs him; flag if missing.
- **Contradictions with active Decisions**: per AGENTS.md Workflow Invariants, supersessions must use the Contradiction Protocol. If this session contradicted an existing decision record without following it, flag RED.
- **Memory of precedent**: if something was agreed that'd benefit future sessions, user may want to save it to memory or update AGENTS.md.

Flag; do not write to `docs/company/DECISION-QUEUE.md` or `docs/decisions/records/`.

## 6. Surface remaining loose threads

From the script output + repo-native state (handoff front matter, `tracks.yaml`, `docs/company/DECISION-QUEUE.md`, `docs/decisions/records/`):

- Handoff files uncommitted → list them. Note any that are redundant and safe to delete.
- Caps stuck in `validating` → is this a known issue (existing `DECISION-QUEUE.md` entry?) or new? Flag per item.
- Open circuit breakers → is there an alert/task tracking each?
- Strategy brainstorms raised this session that are sitting un-discussed?

## 7. Final verification report

Give the user a structured summary:

```
=== Session close-out ===
✓ Green      (N items clean)
⚠ Yellow    (N items review)
✗ Red       (N items blockers)

Handoff file:                 ✓ <path> (written this session)
Front matter:              ✓ title/type/source/actor/action_required set
Decisions to log:          [0 | N to-confirm]
Supersessions:             [none | N requires Contradiction Protocol]
Active track next_action:  [current | N items need attention]
Codebase:                  [pushed | N unpushed on <branch>]
DB ↔ code parity:          [aligned | N drift items]

Loose threads for next session:
  1. ...
  2. ...

Ready to close? (yes / [which item you want to address first])
```

## Rules

- **Write the handoff file, with its front matter,** as part of the standard flow — Petter set this preference 2026-04-27. Don't ask first; don't flag it as missing for him to write. Skip only if a session-authored handoff for the same topic already exists.
- **Never write a `docs/company/DECISION-QUEUE.md` entry or a `docs/decisions/records/*.md` file on the user's behalf.** Decisions still require explicit Petter approval per AGENTS.md governance authority thresholds. Flag if the session made a decision that needs logging.
- **Never mutate a program register's `next_action` to claim state it did not actually reach.** Only overwrite it with the session's own truthful account.
- If `DATABASE_URL` isn't set, skip DB checks and flag in the report.
- Distinguish pre-existing issues from new ones honestly. Don't hide issues you introduced; don't take credit for issues you didn't.
- If the script exits 2 (red findings), default to "don't close yet" unless the user explicitly overrides — but still write the artifacts so the work is recorded.
