---
description: End-of-session verification — runs the close-check, then writes the handoff file and Journal entry, and surfaces loose threads.
argument-hint: "(no args)"
---

# /end-session — verify, then write session artifacts + surface loose threads

Purpose: complete the CLAUDE.md Quick Session Checklist on Petter's behalf. **This command DOES write the handoff file and Journal entry** — that's the standing preference (set 2026-04-27). It still does not create Decisions DB entries, To-do mutations, or other governance artifacts without explicit per-item approval.

Run these steps in order. After the checks, write the artifacts (steps 2 and 3) before producing the final report.

## 1. Run the codebase close-check script

```
cd apps/api && npx tsx --env-file=../../.env scripts/session-close-check.ts
```

Checks git integrity, DB↔code parity, stuck caps, open breakers, uncommitted handoff files. Exit codes: `0` clean, `1` warnings, `2` blockers. Capture findings for the final report.

## 2. Write the session handoff file (CLAUDE.md step 6)

Author a handoff file at `handoff/_general/from-code/YYYY-MM-DD-<topic>.md` covering this session's work. Convention:

- First line is `Intent:` summarizing what the session set out to do.
- Body covers what shipped, what's open, non-obvious learnings, and cost (if any).
- Topic slug should be specific enough that future-you can grep for it (e.g. `x402scan-indexing-and-pr-cleanup`, not `cleanup`).

If a handoff file authored *this session* already exists for today's topic (e.g. an earlier `/go` invocation already wrote one), don't duplicate — report its path. Only one handoff per topic per day; if the session covered two distinct topics, write two files.

If the session was genuinely trivial (single trivial fix, nothing worth recording), still write a one-line handoff. Skipping is Petter's call, not yours.

## 3. Create the Journal entry in Notion (CLAUDE.md step 7)

Create a session-log entry in the Journal data source (`collection://8f54383b-3227-42c2-bee4-77a091027f8f`) with:

- `Title`: `Session log — <topic> YYYY-MM-DD` (matches existing entry pattern)
- `Type`: `session`
- `Source`: `code`
- `Actor`: `claude-code`
- `Action Required`: `no` (unless the session left explicit follow-ups for Petter)
- `Content`: mirror the handoff file's structure — Intent, Outcome, Open, Non-obvious learnings. Don't duplicate the entire handoff verbatim, but cover the same ground.

If a Journal entry from this session already exists, don't duplicate — report its title + URL. Use `notion-search` with `filters.created_date_range` = today and `Actor = claude-code` to check first.

**What this step does NOT do:**
- Create Decisions DB entries — those still require explicit Petter approval per CLAUDE.md governance authority thresholds.
- Mutate the To-do DB — flag drift only.
- Update memory unless explicitly asked.

## 4. Check Notion To-do DB for state drift

Query the To-do DB (`collection://33a67c87-082c-8033-8ac5-000ba9922392`):

a. **"In progress" items owned by `Claude code`:** list them. Are any actually abandoned (haven't been touched in days)? Surface them — user decides what to do.

b. **"Done" items updated today:** per CLAUDE.md "Move completed To-do items to Archive > Completed To-dos (page `34067c87-082c-814e-a45c-fa8d851c8f12`)", these should be archived. Flag if any aren't yet.

Do NOT mutate status. Flag only.

## 5. Check for contradictions / unlogged decisions

Review the conversation for signals that require governance action per CLAUDE.md:

- **Decisions made** (the user authorized a non-trivial tradeoff): check Decisions DB (`ea57671f-7167-44e4-a254-c0a1de79e7f9`) for an entry matching; flag if missing.
- **Contradictions with active Decisions**: per CLAUDE.md Workflow Invariants, supersessions must use the Contradiction Protocol. If this session contradicted an existing Decision without following it, flag RED.
- **Memory of precedent**: if something was agreed that'd benefit future sessions, user may want to save it to memory or update CLAUDE.md.

Flag; do not mutate.

## 6. Surface remaining loose threads

From the script output + Notion state:

- Handoff files uncommitted → list them. Note any that are redundant (already captured in Notion) and safe to delete.
- Caps stuck in `validating` → is this a known issue (existing Notion task?) or new? Flag per item.
- Open circuit breakers → is there an alert/task tracking each?
- Strategy brainstorms raised this session that are sitting un-discussed?

## 7. Archive session marker + final verification report

Archive the persistent session marker (written at session start by `scripts/session-state.mjs`). This captures real start/end timestamps + duration + starting/ending commit. Run from the repo root:

```
node scripts/session-state.mjs end "ended via /end-session"
```

The script prints a JSON block with `session_started_at`, `ended_at`, `duration_ms`, `starting_commit`, `ending_commit`, `starting_branch`, `ending_branch`, and `archived` (path under `.claude/state/session-archive/`). If the response is `{"action":"no-session-to-end"}`, the marker was never created this session — note "duration unknown" in the report and recommend the user install the SessionStart hook (snippet in the PR that landed this feature).

Then give the user a structured summary:

```
=== Session close-out ===
✓ Green      (N items clean)
⚠ Yellow    (N items review)
✗ Red       (N items blockers)

Session start:             <ISO from marker> (or "unknown — no marker")
Session end:               <ISO now>
Duration:                  <Hh Mm> (or "unknown")
Starting commit:           <SHA8>
Ending commit:             <SHA8>
Branch at end:             <branch>
Archive:                   <path returned by session-state end>

Handoff file (step 6):     ✓ <path> (written this session)
Journal entry (step 7):    ✓ <title + URL> (written this session)
Decisions to log:          [0 | N to-confirm]
Supersessions:             [none | N requires Contradiction Protocol]
To-do DB state:            [clean | N items need attention]
Codebase:                  [pushed | N unpushed on <branch>]
DB ↔ code parity:          [aligned | N drift items]

Loose threads for next session:
  1. ...
  2. ...

Ready to close? (yes / [which item you want to address first])
```

## Rules

- **Write the handoff file and Journal entry** as part of the standard flow — Petter set this preference 2026-04-27. Don't ask first; don't flag them as missing for him to write. Skip only if a session-authored handoff for the same topic already exists.
- **Never create a Decisions DB entry on the user's behalf.** Decisions still require explicit Petter approval per CLAUDE.md governance authority thresholds. Flag if the session made a decision that needs logging.
- **Never mutate Notion to-do status** without explicit per-item user confirmation.
- If `DATABASE_URL` isn't set, skip DB checks and flag in the report.
- If Notion MCP tools are unavailable, write the handoff file anyway (filesystem); skip the Journal step and flag loudly — never silently proceed.
- Distinguish pre-existing issues from new ones honestly. Don't hide issues you introduced; don't take credit for issues you didn't.
- If the script exits 2 (red findings), default to "don't close yet" unless the user explicitly overrides — but still write the artifacts so the work is recorded.
- **Always archive the session marker** in step 7, even when the close-check returned red — the archive is a historical record, not a quality gate. The "don't close yet" recommendation is advisory; the archive captures whatever state the session actually ended in.
