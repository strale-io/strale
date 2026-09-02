Intent: leave the repository with no stale branches, no stale worktrees, and every deletion backed by evidence, so both AI tools start from one clean shape.

## What landed

Track T2 of the CTO-readiness program. Full record:
`archive/sessions/2026-09-02-t2-repo-hygiene-sweep-report.md`.

- Remote branches other than `main`: 52 → 0 (plus the 28 rescue branches the
  morning check-in created, converted to tags). 45 archive tags preserve
  everything that was not provably landed.
- Local branches: 57 → 1. Linked worktrees: 30 → 2. Seventeen dead directory
  copies of merged Codex batches removed. `strale-work` removed after every
  file was verified byte-identical to a copy already tracked on `origin/main`
  (nothing imported).
- `WORKTREES.md` rewritten to describe the allowed set (trunk plus one batch
  worktree) and the current exception.
- Register: T2 done; T3 (automatic session-end gate) active with the founder's
  four-layer specification as its stored plan.

## The incident

My worktree script deleted the primary checkout, `.git` included (path-format
mismatch in its keep-list, then an `rm -rf` fallback). The concurrent morning
check-in re-cloned it; committed content is intact; the root `.env`,
`apps/api/.env`, `.claude/settings.json` (recreated), reflogs, and stashes are
gone. Cause recorded in LESSONS.md F12; founder action DQ-29 (restore the two
`.env` files). Every deletion after the incident used explicit allowlists of
absolute paths with per-path checks.

## Decisions taken (technical, mine)

- Archive tags rather than branches for everything preserved: lossless, and
  the branch list stays empty.
- The trunk stays detached at `origin/main` until T3 re-points the check-in
  run off `main`; forcing it now would require touching a possibly active
  session's worktree.
- Seven unmapped plain directories and three frontend orphan worktrees were
  not deleted; they are listed for a reviewed decision in T3.

## Review trail

Author self-verification: fresh read-only Claude agent (independent review
under the 2026-09-02 Codex-unavailable fallback). Result recorded in the PR.

## What the next session should do

1. T3 is active: `archive/sessions/2026-09-02-t3-session-end-gate-plan.md`.
   Build `handoff:check`, the Claude hooks, the Codex wrapper, the git hooks;
   then re-point the daily run, return the trunk to `main`, decide the seven
   directories, add the weekly stale-branch job.
2. If `.env` is still missing, local database and vendor scripts will fail;
   that is DQ-29, not a bug.

## Not done

No production, Notion, vendor, or product change. No Decision content moved.
