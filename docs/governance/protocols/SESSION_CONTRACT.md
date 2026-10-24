---
status: active
authority_active: true
adopted_by: DEC-20261024-A
moved_from: "CLAUDE.md heading: Session contract — both tools, every session"
moved_at: 2026-10-24
---

# Session contract — both tools, every session

> **Authoritative text.** Moved verbatim from `CLAUDE.md` in the contract cut
> (DEC-20261024-A, way-of-working review §4 step 3). Change it here; `AGENTS.md`
> routes to this file from its reading map.

1. **Orient first.** Read `docs/programs/README.md`, then the active track's
   `next_action` and `resume_file` in `docs/programs/<program>/tracks.yaml`.
   Claude Code prints this at SessionStart; Codex runs `npm run handoff:orient`.
   Work happens in one batch worktree (`strale-wt-<track>`) on a feature
   branch cut from `origin/main`; the trunk stays on `main` and clean
   (`WORKTREES.md`).
2. **Gate before stopping.** `npm run handoff:check` must pass before a session
   ends: no uncommitted paths, the branch pushed to its upstream, at most one
   batch worktree, no merged branch left locally or on the remote, and every
   code change accompanied by an updated `next_action` in the program register
   or a new `handoff/_general/from-code/` file. The check prints one fix per
   finding; apply them and rerun. Claude Code's Stop hook
   (`.claude/settings.json`) requests continuation on failure, with a
   six-block escape for repeated finding codes. That escape records failure;
   it does not mean the gate passed. Codex's notify
   wrapper (`scripts/handoff/codex-notify.mjs`, chained in
   `~/.codex/config.toml` by its trunk path, which must exist on `main`)
   records the result in
   `.claude/state/handoff/last-codex.json`, which the next session's
   orientation shows, and `.codex/hooks.json` blocks the stop the same way
   when the hook is enabled, trusted, discovered, and successfully invoked.
   Hook commands resolve their script from the current Git worktree root,
   including when the session starts in a subdirectory. Notify records a result
   after the turn; it does not block stopping.
   A Codex session runs the check itself
   before its final turn and fixes what it lists.
3. **Git hooks come with `npm ci`** (`prepare` runs the same installer as
   `npm run hooks:install`, setting `core.hooksPath=.githooks` for every
   worktree of the clone):
   pre-commit refuses a commit on `main` and an inventory-target edit without
   `npm run context:generate`; pre-push refuses a direct push to `main`.
   `main` changes only through reviewed PRs merged on GitHub; pushing the
   working branch is routine backup and needs no approval. Worktrees and
   branches recorded in `scripts/handoff/baseline.json` wait for a founder
   decision and are never deleted by a session.
