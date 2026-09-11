---
status: candidate
authority_active: false
source: CLAUDE.md
source_heading: "Shared-Checkout Rule (concurrency safety)"
---

# Shared-Checkout Rule (concurrency safety)

> [!CAUTION]
> **INACTIVE MIRROR: CLAUDE.md REMAINS THE AUTHORITY UNTIL M4.**
> This file is a byte-identical copy of the protocol's section in `CLAUDE.md`,
> extracted so the coverage manifest and future protocol router can reference
> a full-body path (T6 M3 batch 6b). It carries no authority of its own and
> must never be edited on its own: any change belongs in `CLAUDE.md` first,
> then re-extracted here. `npm run protocols:check` fails if the two copies
> diverge.

> [!NOTE]
> The "Worktree node_modules Hazard" section that follows this one in
> `CLAUDE.md` is a separate rule and is not part of this mirror.

<!-- BEGIN VERBATIM FROM CLAUDE.md -->
### Shared-Checkout Rule (concurrency safety)

**This checkout is shared.** Several Claude Code sessions and background agents
run against the same working tree at once. Git branch switching is not
concurrency-safe here.

**The failure mode:** an agent runs `git checkout <branch>` in the main tree
while another process holds file locks (tsc, vitest, npm, an editor). On
Windows git's delete-then-rewrite sequence fails partway — the old files are
unlinked, the new ones never written. ~1,000 tracked files vanish from disk
while the index still lists them, always in `apps/api/**` and `packages/**`
where node holds handles. Hit three times on 2026-08-14.

**Rules:**

1. **Any agent that edits files MUST be launched with `isolation: "worktree"`.**
   An agent working in the shared checkout will eventually collide with the
   main loop or another agent. This is the actual prevention.
2. **Agents must never `git checkout` a branch in the main tree.** If an agent
   without worktree isolation needs a branch, it should create its own worktree
   (`git worktree add`) rather than moving the shared one.
3. **Before branch-switching in the main tree, check `git status`** for another
   session's uncommitted work. Uncommitted changes travel across branch
   switches and can end up staged onto the wrong branch.
4. **Never "fix" phantom breakage.** If files that are committed suddenly
   ENOENT, that is this bug, not a real deletion. Run
   `node scripts/guard-tree-integrity.mjs` (or just any Bash command, if the
   PostToolUse hook is wired) and re-check before diagnosing further.
5. **Never use `git stash` in any worktree of this clone.** `refs/stash` is
   repo-wide, shared across ALL worktrees — concurrent sessions' stash
   push/pop interleave, and a pop in one worktree can consume (and on
   conflict, destroy) another session's stashed work. Hit on 2026-08-16:
   one agent's `stash pop` returned a sibling agent's quality-floor changes.
   For fail-before verification or temporary reverts, use
   `git checkout <base-sha> -- <paths>` + `git checkout <branch> -- <paths>`
   to restore, or a temporary WIP commit. If a stash accident happens,
   recover via `git fsck --dangling` (stash commits survive as dangling
   commits) and save the foreign diff to a patch file — never discard it.

The guard at `scripts/guard-tree-integrity.mjs` auto-repairs the damage and is
wired as a PostToolUse/Bash hook in `.claude/settings.json` (tracked since
T3 alongside the session hooks; machine-local additions go in the ignored
`settings.local.json`). It only ever restores tracked-and-deleted paths, so it
cannot discard work. It is a safety net, not a substitute for rule 1.
<!-- END VERBATIM FROM CLAUDE.md -->
