---
doc_type: session-plan
authority_scope: none
status: planned
complete: false
phase: M2
authority_active: false
created_at: 2026-09-02
owners:
  - claude-code
review_route: author-self-verification-plus-fresh-codex-review; Claude fallback while Codex is unavailable
---

# T3 — Automatic session-end gate: stored plan

> Execution record for track T3 of the CTO-readiness program. Not project truth.
> Founder specification received 2026-09-02 (verbatim in the Problem and
> Solution sections); reconciliations with existing repo rules follow.

## Problem (founder's words, condensed)

Sessions in Claude Code and Codex end without a clean handoff: uncommitted or
unpushed work, leftover worktrees and branches, status docs not updated. The
next session cannot tell what was done or where to pick up. The gate must be
automatic; the founder will not remember to run a command.

## Solution: four layers

1. **`npm run handoff:check`** fails, with exact fix instructions, if: the
   worktree has uncommitted changes; the current branch is ahead of its remote;
   any worktree other than the allowed ones exists; a merged branch still
   exists locally or on the remote; or a session that changed code did not
   update the resume surface.
2. **Claude Code hooks** (`.claude/settings.json`, which T3 removes from
   `.gitignore` and commits; machine-local overrides stay in the still-ignored
   `settings.local.json`, so the file holds hooks only, never secrets): a SessionStart
   hook runs the orientation script (program register check plus a short
   "where we are" print); a Stop hook runs `handoff:check` and returns
   `{"decision":"block","reason":…}` on failure so the session keeps working
   until the repo is clean.
3. **Codex**: the `notify` hook in `~/.codex/config.toml` (turn-ended) runs the
   same check through a wrapper that also preserves the existing notify
   command, and writes the result to an ignored status file the orientation
   script surfaces next session; `AGENTS.md` instructs Codex to run
   `handoff:check` before finishing. A blocking Codex hook is used if the
   installed version supports one.
4. **Git hooks** (`core.hooksPath=.githooks`, installed by `npm run
   hooks:install`, which the SessionStart hook calls): pre-commit runs the
   fast structural checks; pre-push runs the full gate and refuses direct
   pushes to `main`.

## Reconciliations with existing rules (decided, technical)

- *Canonical folder.* The shared-checkout rule (CLAUDE.md) forbids working in
  the trunk and requires an isolated worktree per batch. Allowed set: the
  trunk (`C:\Users\pette\Projects\strale`, always on `main`, clean) plus one
  batch worktree whose path and branch are recorded in
  `.claude/session-worktree.json` (ignored). Every other worktree fails the
  gate. `strale-wt-0902` (the check-in worktree that holds `main`) stays
  allowed until the daily run is re-pointed (a T3 sub-item).
- *Status doc.* The resume surface is `docs/programs/cto-readiness/tracks.yaml`
  (active track `next_action`) plus the active track's handoff. The gate
  requires that a commit range containing code changes also touches the
  register or a handoff. Generic `CURRENT_STATE` filenames are rejected by
  the migration plan's guard design, so none is introduced.
- *Release branch.* `main` deploys to production; the charter allows a session
  to merge its own reviewed PR. Implementation: pre-push refuses any direct
  push to `main`; merges happen only through reviewed PRs on GitHub.
- *Shared contract block.* One identical block in `CLAUDE.md` and `AGENTS.md`:
  read the register first; run the gate before stopping; the entrypoint
  symmetry check already planned for M4 will enforce identity.

## Exit test

- Planting each failure mode (dirty file, unpushed commit, extra worktree,
  merged-but-present branch, code change without register update) makes
  `handoff:check` fail with a one-line fix instruction; a clean repo passes.
- A Claude Code Stop with a dirty worktree is blocked (hook evidence in the
  PR); a SessionStart prints the active track.
- `git push origin main` from a workstation is refused by the hook.
- The Codex notify wrapper writes the status file and the orientation script
  prints it.

## Out of scope

Rewriting WORKTREES.md beyond the allowed-set rule; the daily-run re-point
(recorded as a T3 sub-item, done after the gate ships); any Notion change.
