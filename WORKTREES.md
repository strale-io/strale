# Worktrees

**State on 2026-09-02, after the T2 hygiene sweep.** This file describes what
exists and the rule that keeps it that way. The rule is enforced by the
session-end gate (`npm run handoff:check`, track T3): Claude Code's Stop hook
and Codex's notify wrapper and Stop hook run it, the git hooks under
`.githooks/` run its structural half on every commit and push, and the weekly
`stale-branches` workflow reports remote branches nobody is using.

## The rule

Two kinds of checkout exist on the machine, and normally two checkouts in
total: the trunk and one batch worktree. A second batch worktree may exist
only while the previous batch's PR waits for its review verdict; the session
that started the next batch merges that PR and removes its worktree before it
ends (the gate refuses to end a session while two batch worktrees exist).

| Checkout | Path | Role |
|---|---|---|
| trunk | `C:\Users\pette\Projects\strale` | On `main`, clean. Fetches, history, branch bookkeeping. **No work is done here.** |
| batch worktree | `C:\Users\pette\Projects\strale-wt-<track>` | One per active batch, on a `type/kebab-name` branch cut from `origin/main`. Removed by the session that merges its PR. |

A third worktree is allowed only while it is recorded, with a reason, in
`scripts/handoff/baseline.json` (none today); the gate reports recorded
worktrees as notes and never deletes them. The scheduled morning check-in
works like any batch: `strale-wt-checkin` on `chore/checkin-<date>`, merged
through a PR and removed afterwards.

Creating a worktree:

    git worktree add -b <type>/<name> C:\Users\pette\Projects\strale-wt-<track> origin/main
    cd C:\Users\pette\Projects\strale-wt-<track> && npm ci

Never link `node_modules` between checkouts. Removing a worktree:

    git worktree remove C:\Users\pette\Projects\strale-wt-<track>

If `git worktree remove` refuses, stop and look; never fall back to `rm -rf`.
On 2026-09-02 exactly that fallback deleted the trunk, `.git` included
(`docs/company/LESSONS.md`, F12 incident 5).

## Idle state

The trunk is on `main`. The gate also accepts a trunk detached exactly at
`origin/main` as idle (a re-clone lands there); anything else fails.

## What is not a worktree

Sibling directories named `strale-*` that are separate repositories
(`strale-frontend`, `strale-context-archive`, `strale-beacon`,
`strale-examples`, `strale-public-remediation`) are unaffected by this file.
Plain directories left from earlier sessions are listed in
`archive/sessions/2026-09-02-t2-repo-hygiene-sweep-report.md` for a reviewed
decision.

## Shared-checkout hazards (still true)

- Never `git checkout` a branch in the trunk while another process may hold
  file locks; on Windows the delete-then-rewrite sequence can strand ~1,000
  tracked files (2026-08-14, three times).
- Never `git stash` anywhere in this clone; `refs/stash` is shared across all
  worktrees (2026-08-16).
- `scripts/guard-tree-integrity.mjs` repairs tracked-and-deleted paths and is
  wired as a PostToolUse hook in `.claude/settings.json` (tracked since T3,
  next to the SessionStart and Stop hooks; machine-local additions go in the
  ignored `settings.local.json`).
