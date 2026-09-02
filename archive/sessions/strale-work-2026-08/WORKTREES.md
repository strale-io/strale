# Worktrees

This repo uses named permanent git worktrees with fixed roles. CC sessions
target a specific worktree by name. Sessions do not spawn ad-hoc worktrees.

## Canonical structure

| Worktree | Path | Role |
|---|---|---|
| trunk | `C:/Users/pette/Projects/strale` | Always on `main`. Branch operations, fetches, pulls, history inspection. No feature work here. |
| work | `C:/Users/pette/Projects/strale-work` | Feature branches for active code work. One active session per worktree. |
| research | `C:/Users/pette/Projects/strale-research` | Read-only research and audits. Multiple parallel sessions can share. |

For parallel code streams beyond one, add `strale-work-2`, `strale-work-3`,
etc. as needed. Each on its own feature branch.

## Rules

1. **Trunk stays on `main`.** Switching off main happens only for git
   management operations that strictly require it (rare). Returns to main
   immediately.
2. **Work-worktrees idle in detached HEAD on `origin/main`.** When a session
   starts, CC cuts a feature branch (`git switch -c fix/whatever`). When
   the session merges its PR, CC returns the worktree to detached HEAD on
   the new `origin/main` tip.
3. **No `Agent({isolation: "worktree"})`.** This auto-spawns ephemeral
   worktrees that never get cleaned up. Use the named worktrees above. If
   a session needs more isolation than `strale-work` provides, add
   `strale-work-2`.
4. **Every CC prompt declares its worktree in the header.** Format:
   `Repo: strale | Worktree: <name> | Tool: Claude Code | Model: <model>`.
   CC's first audit step verifies it's running in the declared worktree.
5. **Cross-worktree write-conflict check.** CC's audit phase checks
   `git status --porcelain` in every other worktree against its own
   modify-list. Halts on overlap with files modified within the last hour;
   warns and proceeds on stale (≥1h) modifications.

## Adding a worktree

    git worktree add --detach <path> origin/main

Update this file in the same PR.

## Removing a worktree

    git worktree remove <path>

The branch (if any) persists in `.git/`. Use `git branch -d <branch>` to
clean up the branch ref if no longer needed.

## Janitor: pruning orphan agent-isolation worktrees

Despite Rule 3, CC sub-agents occasionally leave filesystem residue under
`.claude/worktrees/*` that isn't registered in `git worktree list`. These
are orphans — directories without git-tracked context, often paired with
abandoned `claude/<adjective-name>` branches.

The janitor script `apps/api/scripts/prune-claude-worktrees.ts` cleans
these up safely.

Run on demand (or after a CC session that may have spawned isolation
worktrees):

    npx tsx apps/api/scripts/prune-claude-worktrees.ts

The script is **safe-by-construction**:

- Never removes a directory registered in `git worktree list`.
- Never force-deletes a branch (uses `git branch -d`, not `-D`).
- Refused branches (those with unmerged work) are logged for operator
  review, not deleted.
- Idempotent — running twice is harmless.

Output: list of directories removed, branches deleted, branches refused.

Run frequency: after any session that uses agent isolation, OR weekly as
a sweep. Not yet wired to CI; a future hook could automate this.
