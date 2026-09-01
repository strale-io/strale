---
doc_type: session-plan
authority_scope: none
status: agreed
complete: false
phase: M2
authority_active: false
created_at: 2026-09-02
owners:
  - codex
reviewed_by:
  - codex-gpt-5.6-sol
review_route: independent-codex-review-by-founder-direction
review_meaning: technical-navigation-review-not-authority-cutover
---

# Fresh-session readiness plan

> [!CAUTION]
> **PRE-CUTOVER NAVIGATION ONLY — NOT ACTIVE PROJECT AUTHORITY.**
> This change makes the current migration checkpoint findable from both active
> entrypoints. It does not activate candidate project truth, replace a Notion
> consumer, or authorize M4.

## Problem

The latest evidence and handoffs are complete on `origin/main`, but a new
Claude Code session could start in a stale dirty checkout. `START-HERE.md` and
`RECENT.md` are intentionally inert, while older progress notes in the durable
migration plan still contain superseded `Next:` sentences. Reconstruction is
possible but not immediate or deterministic.

## Change

1. Add matching temporary pre-cutover navigation pointers to `CLAUDE.md` and
   `AGENTS.md`.
2. Add one top-level current continuation checkpoint to the durable migration
   plan; it explicitly supersedes older progress-note `Next:` wording.
3. Refresh the inactive STATE/ROADMAP candidates with completed M2 batches and
   the next bounded M2 closure audit; keep vendor-state preparation queued
   behind the M2 exit gate.
4. Add one dated handoff written for a clean Claude Code continuation.
5. Regenerate tracked context, validate, obtain a fresh exact-commit Codex
   review, merge, and remove the isolated worktree after ancestry proof.

## Acceptance

- A clean session reading either entrypoint is sent to one stable checkpoint.
- The checkpoint names one next bounded task and one latest handoff.
- The next task respects the plan's M2-before-M3 sequence and produces the
  evidence needed to decide which Decision batch follows.
- The dirty shared checkout is explicitly rejected as a work surface.
- M2 candidates remain inactive and all M4/Notion-retirement boundaries remain.
- No source Notion content, product/runtime behavior, database, vendor, secret,
  or production state changes.
- `npm run context:generate`, `npm run context:test`,
  `npm run context:check -- --json`, and `git diff --check` pass.
- A fresh separate Codex task returns no unresolved material finding.

## Plan-review outcome

The first independent Codex review found that the draft incorrectly advanced
to M3 before the plan's remaining M2 Decision/disposition work was complete,
and that `STATE.md` placed a 2026-09-02 navigation change under 2026-09-01
verification metadata. The checkpoint was corrected to make an M2 closure
audit the next task, queue vendor-state preparation behind the M2 exit gate,
and remove the mismatched state claim. Re-review returned PASS with no material
findings.
