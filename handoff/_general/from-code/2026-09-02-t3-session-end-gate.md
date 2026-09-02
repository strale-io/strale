Intent: make session end automatic and identical for Claude Code and Codex, so no session can leave uncommitted work, an unpushed branch, a stray worktree, a merged-but-present branch, or a stale resume surface behind (track T3 of the CTO-readiness program, founder specification of 2026-09-02).

## What landed

One checker, four layers, one contract:

- **`npm run handoff:check`** (`scripts/handoff/handoff-check.mjs`): fails with
  one fix per finding on `dirty`, `branch` (trunk off main; batch worktree on
  main or detached), `ahead` (unpushed, or no upstream), `worktree` (a second
  batch worktree, or one holding no branch), `merged-branch` (a local or remote
  branch whose work has landed on main: ancestor, or every commit
  patch-equivalent via `git cherry`), `resume-surface` (an active track without
  a `next_action`, or code changed without a `docs/programs/*/tracks.yaml` or
  `handoff/_general/from-code/` update), `release-commit`/`release-push`
  (main only through PRs unless a human sets `STRALE_ALLOW_MAIN_PUSH=1`), and
  `inventory` (inventory targets staged without `npm run context:generate`).
  Modes `session`, `pre-commit`, `pre-push`; `baseline` records worktrees and
  branches that wait for a founder decision (`scripts/handoff/baseline.json`,
  empty today). 25 tests plant each failure mode in a throwaway repository
  (`npm run handoff:test`, in CI).
- **Claude Code**: `.claude/settings.json` is now tracked (un-ignored; local
  additions go in `settings.local.json`). SessionStart runs
  `.claude/hooks/handoff-session-start.mjs` (records the session's start
  commit, installs the git hooks, prints `scripts/handoff/orient.mjs`:
  checkout, worktrees, active track and next action, last gate results). Stop
  runs `.claude/hooks/handoff-stop.mjs`, which returns
  `{"decision":"block","reason":…}` until the gate passes (loop guard: six
  blocks on identical findings let the stop through and leave the failure in
  `.claude/state/handoff/last-claude.json`).
- **Codex**: `~/.codex/config.toml` `notify` now chains
  `scripts/handoff/codex-notify.mjs` in front of the existing Tilja wrapper and
  the original notifier; it runs the gate for the repository of the turn's
  `cwd`, scopes the code-change rule to the thread (start commit recorded at
  the first turn), and writes `.claude/state/handoff/last-codex.json`, which
  orientation prints. `.codex/hooks.json` declares the same SessionStart and
  Stop hooks in Codex's Claude-compatible hook format (`[features]
  codex_hooks = true` added to the config). AGENTS.md carries the contract.
- **Git hooks**: `.githooks/pre-commit` and `pre-push`; `npm run
  hooks:install` (also `prepare`, so `npm ci` does it) sets
  `core.hooksPath=.githooks` for every worktree of the clone.
- **Weekly `stale-branches` workflow**: lists remote branches older than seven
  days with no open PR and keeps one tracking issue current; deletes nothing.
- **Shared contract**: an identical "Session contract — both tools, every
  session" block in CLAUDE.md and AGENTS.md (orient first; gate before
  stopping; hooks come with `npm ci`; main only through PRs).
- **Machine state**: the morning check-in task's prompt now works in
  `strale-wt-checkin` on a dated branch and removes it after its PR merges;
  `strale-wt-0902` was removed and the trunk is on `main`, clean. Allowed set
  today: trunk + `strale-wt-t3`. Of the eleven plain directories the T2
  report listed, ten were deleted after a file-level check proved every file's
  content already exists as an object in this repository's history
  (`strale-wt-a2a`, `-fix`, `-san`, `strale-phase7a`,
  `strale-public-remediation-wt`, `strale-website-design-handoff-2026-08-25`,
  and `C:/tmp/strale-wt-{docs,docs3,fixture,promote}`); nothing unique was
  removed.

## Evidence

- Gate run in this worktree before the commit: `dirty`, `worktree` (while
  `strale-wt-t2` still existed), `resume-surface` reported with fixes; after
  the fixes, pass.
- Stop hook with a fake payload: `{"decision":"block","reason":"HANDOFF GATE
  FAILED (block 1/6)…"}`; SessionStart hook printed the orientation and
  `core.hooksPath = .githooks`.
- pre-commit hook fired on a real commit attempt (`Handoff gate passed
  (pre-commit)`); its first version let an inventory-target commit through
  because `check-project-context.mjs` is warning-only by contract, so the hook
  now reads the checker's `--json` findings and fails on any.
- Codex wrapper with a fake `agent-turn-complete` payload wrote
  `last-codex.json` and the thread marker, and forwarded to the next command.
- Codex 0.147.0's binary carries the notify payload keys (`type`, `thread-id`,
  `turn-id`, `cwd`, …) and a Claude-compatible hooks engine
  (`stop.command.output` with `decision: block` / `reason`). The live Codex
  layer is unverified until a Codex turn runs here (quota exhausted until
  2026-09-07).

## Open

- Prove `stale-branches` with a `workflow_dispatch` run against a planted
  branch after merge.
- `C:\Users\pette\Projects\strale-codex-handoff-v2` (61 files of website
  design/copy handoff documents, 60 of which never existed in this
  repository's history) is the one plain directory left; it belongs with the
  website project, and whether to file it under `strale-frontend` or drop it is
  Petter's call (DQ companion note).
- Multi-commit squash merges leave no git-visible trace on the local branch;
  the batch loop deletes the branch after merging, and the weekly workflow
  catches the remote copy.
- Re-review by Codex when it returns (PROGRAM.md step 6).

## Non-obvious learnings

- `npm run context:generate` hashes the git index, not the working tree:
  stage inventory-target edits before regenerating, or CI reports drift on the
  next commit.
- `git branch --merged` lists `(HEAD detached at …)` as a pseudo-branch when
  HEAD is detached; filter names starting with `(`.
- git alone cannot tell a freshly cut branch from a fast-forwarded one when
  both sit at main's tip, so a checked-out branch with no commits beyond main
  is a note, never a failure.
- An interrupted `npm ci` can leave a package directory without its entry
  file (`yaml/index.js` here); the gate reports it as `gate-error` with the
  fix `npm ci` rather than crashing.
