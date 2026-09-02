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
review_route: author-self-verification-plus-fresh-codex-review
---

# T2 — Repo hygiene sweep: stored plan

> Execution record for track T2 of the CTO-readiness program. Not project truth.

## Evidence snapshot (2026-09-02, read-only)

Remote branches not merged into `origin/main`: 50 (before this session's two
PR branches). Per-branch PR lookup (`gh pr list --state all --head <branch>`)
gives:

| Category | Count | Meaning |
|---|---:|---|
| MERGED-EXACT | 24 | A merged PR whose head SHA equals the branch tip. Content is on main under a squash commit. Safe to delete. |
| MERGED-BUT-TIP-MOVED | 10 | A merged PR, but the branch received commits after the PR head. Seven of the ten hold only merge-from-main commits; three hold one real follow-up commit each (`fix/js-yaml-quadratic-dos`, `fix/sharp-libvips-cves`, `fix/x402-body-limit`), and each of those follow-ups was itself merged through a later PR (#394, #396, #411). Safe to delete once that is re-verified per branch. |
| NO-PR, rescue snapshots | 11 | Janitor snapshots of uncommitted work. Six of them (`main-*` dated 08-27 to 09-01) capture the same 13 scratch files (`apps/api/cc.mjs`, `who*.mjs`, `daily.ts`, …) from the `strale-wt-checkin` worktree. Two capture the WP9 alerting work that still sits uncommitted in the shared checkout. One each: package-lock only; image-resize limits (landed via #399/#411); vendor-control-tower edits (still uncommitted in `C:/tmp/strale-vendor-control-tower`); preflight scripts (untracked in `strale-wt-pf`). |
| NO-PR, real branches | 4 | `remediation/program` (superseded by the per-WP PRs; carries `_tmp_*` scripts), `remediation/wp9-artifacts` (WP9 landed via #360; residual docs commits noted in CURRENT-STATE.md), `codex/repo-native-operating-model` (the pre-containment migration branch; its context-pack files were deliberately removed from the public tree in M0 — must not be merged), `codex/docs-email-finder-provider-research-2026-08-31` (one archived research doc, never PR'd). |
| CLOSED-UNMERGED | 1 | `feat/phase-7a-it-stakeholders` (#135 closed 2026-08-14, Italian stakeholders capability). |
| OPEN | 2 | This session's #476 and #477. |

Local branches: 57. 18 are ancestors of main (delete), 10 match main by
content (delete), the rest mirror the remote categories above.

Worktrees: 31 linked plus the shared checkout. Dirty: shared checkout (WP9
alerting work, identical to rescue branch `rescue/wip-2026-09-01-remediation-
wp9-artifacts-37af338`), `strale-wt-checkin` (13 untracked scratch files, all in
the `main-*` rescue snapshots), `strale-wt-pf` (3 untracked preflight scripts,
in a rescue snapshot), `C:/tmp/strale-vendor-control-tower` (2 modified files,
in a rescue snapshot), the orphan `.claude/worktrees/agent-…` (package-lock).
`C:/Users/pette/Projects/strale-work` is not a git checkout at all: it is a
directory of old session reports.

## Scope

1. Delete every MERGED-EXACT and verified MERGED-BUT-TIP-MOVED branch, remote
   and local.
2. Delete local branches that are ancestors of main or match it by content.
3. Preserve the four real NO-PR branches and the closed one as **archive
   tags** (`archive/<branch>` pointing at the tip) before deleting the branch,
   so no history is lost and the branch list is clean. Record each in the
   sweep report with the reason.
4. Rescue snapshots: keep one tag per distinct content set (four sets), delete
   the duplicates, and list what each set contains. Do not discard the WP9
   alerting work or the vendor-control-tower edits; both are unmerged code.
5. Worktrees: remove every worktree whose branch is deleted; keep
   `strale-wt-t1`/program worktrees until their PRs merge, then remove them.
   Return the shared checkout to `main`, clean, only after its uncommitted
   work is confirmed identical to the tagged rescue snapshot.
6. `strale-work`: move its reports under `archive/sessions/` (Report Filing
   Convention) in a PR, then delete the directory.

## Founder-facing items (batched to DECISION-QUEUE.md, not asked now)

- Whether the WP9 alerting isolation work and the vendor-control-tower edits
  should be finished or dropped. Technical assessment goes in the report;
  the call is product/priority, so it is queued, and the code is preserved
  either way.
- Whether `feat/phase-7a-it-stakeholders` (Italian stakeholders capability,
  closed unmerged) is still wanted.

## Exit test

- `git branch -r --no-merged origin/main` lists only branches with an open PR.
- `git worktree list` lists only worktrees with an active session.
- Every deleted branch appears in the sweep report with its landed evidence
  (PR number and merge commit) or its archive tag.
- The shared checkout is on `main` with a clean status.

## Out of scope

Deleting any content that is not provably on main or under an archive tag.
Any production, Notion, vendor, or product change.
