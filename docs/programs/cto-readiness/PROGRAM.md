---
doc_type: program-plan
authority_scope: none
program: cto-readiness
status: active
started: 2026-09-02
owner: claude-code
review_route: cross-provider
---

# CTO-readiness program

> Execution record, not project truth. This file and `tracks.yaml` say what is
> being done and what remains. They never restate product facts, state, or
> decisions; those live in `docs/project/` and `docs/decisions/`.

## Resume here

Any fresh session, **Claude Code or Codex**, resumes this program by doing
exactly this and nothing else:

1. Create an isolated worktree from current `origin/main`
   (`git worktree add --detach <path> origin/main`, then `git switch -c
   <type>/<kebab-name>`). Never work in the shared checkout at
   `C:\Users\pette\Projects\strale`; it belongs to other work.
2. Read `tracks.yaml`. The single track with `status: active` is the current
   batch. Its `next_action` is the next concrete step. Its `resume_file` is the
   handoff written by the last session that touched it.
3. Run `npm run programs:test`. If it fails, the register is inconsistent and
   repairing it is the first task.
4. Work the batch through the **batch loop** below. Do not start a second track
   unless the active one is blocked and the blocker is recorded.

Chat history, Notion, and older handoffs are never needed to resume.

## Goal

The repository is the place a newly hired CTO would read on day one and come
away understanding what Strale is, how it is built, how work happens, and what
is in flight, without asking anyone. Concretely:

- **One entry path.** A stranger opens `README.md`, then one start file, and is
  routed to everything else. Both AI tools land on the same files.
- **No residue.** No branch without an open PR older than seven days, no
  worktree without an active session, no report or handoff outside its indexed
  home, no file at the repo root that is not top-level canon.
- **Self-enforcing.** Cleanliness is checked by CI and the daily run, not by
  memory. A regression opens an issue.
- **Handoff-proof.** Every batch ends with the register updated and a handoff
  written, so the next session, on either tool, picks up in under five minutes.
- **The two existing programs close or are explicitly re-homed:** the
  repo-native operating-model migration (M2 through M7) and the 2026-08-20
  remediation program.

## Tracks

The register is `tracks.yaml`; this table is a human view of it and the
register wins on any disagreement.

| ID | Track | What "done" means |
|---|---|---|
| T1 | M2 closure audit | Machine-checked disposition register for every legacy-authority inventory entry and every preserved Decision source row; exact counts; explicit M2 exit-gap list; next collision-free Decision batch named. |
| T2 | Repo hygiene sweep | Every stale branch, worktree, rescue snapshot, and orphan directory either verified-landed-and-deleted or listed with a reason it must stay. Shared checkout returned to a clean, known state. |
| T3 | Hygiene enforcement | CI job flags branches older than seven days without an open PR and worktrees without a session; session-end rule deletes branch and worktree in the merging session; daily run reports and prunes rescue snapshots; `WORKTREES.md` describes reality. |
| T4 | Remediation closure | WP10 acceptance recorded as ACCEPT, EXTEND, or FAIL; WP9 observation closed; WP12's proxy-hop fact established read-only; WP15 integration lane owns its database; WP17 ledger shipped or formally deferred; WP13 dependency triage run; WP14 blocker and WP16 program re-homed as their own rows. |
| T5 | CTO-readable structure | `README.md` reads top-down for a stranger; `docs/` has one index; `archive/` and `handoff/` are indexed; root contains only top-level canon; the target information architecture in the migration plan §5 is reached or each deviation is recorded. |
| T6 | M3 repo-native workflows | Per migration plan §10 M3: Notion replacements for daily priorities, activity, vendor state; session start/end and `go` prepared against repo-native sources; protocol coverage manifest complete; nothing activated. |
| T7 | M4 atomic cutover | Per migration plan §10 M4. **Founder confirms the flip.** Entrypoints become peers, Notion consumers removed in one PR, guards blocking. |
| T8 | M5 to M7 closeout | Legacy authorities archived, clean-session acceptance passed on both tools, plan archived with evidence. |
| T9 | Discovery and retrieval (WP16) | Re-homed from remediation. Starts only after T7. Its own plan when opened. |

Ordering: T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9. T2 and T3 may run
between T1 sub-batches when T1 is waiting on review. Nothing in T6 or later
starts before T1's exit gate passes.

## The batch loop

Every batch, on either tool, runs this loop. A batch that skips a step is not
done.

1. **Worktree.** Fresh worktree and branch from `origin/main`.
2. **Plan.** A short stored plan in `archive/sessions/<date>-<track>-plan.md`:
   scope, files, exit test, what is explicitly out of scope.
3. **Implement**, with tests that fail before the change and pass after.
4. **Self-verify.** A fresh Claude agent with read-only tools is told the exit
   criteria and asked to break the work, not to praise it. Findings are fixed
   or explicitly carried.
5. **Independent review.** A fresh Codex task (`gpt-5.6-sol`, `xhigh`,
   read-only) reviews the exact commit. Cross-provider review is stronger than
   same-provider review; this is the spirit of the 2026-09-01 routing rule.
6. **Ship.** Open PR, wait for CI, merge, verify `origin/main` carries the
   commit.
7. **Record.** Update `tracks.yaml` in the same PR, write the handoff to
   `handoff/_general/from-code/<date>-<track>.md`, add a Journal entry while
   Notion remains authoritative.
8. **Clean.** Delete the branch, `git worktree remove` the worktree. The
   session that merges is the session that cleans.

## What needs Petter, and nothing else does

Per the Operating Charter (DEC-20260815-A), technical questions never go to
the founder. The following are expected to reach `docs/company/DECISION-QUEUE.md`
during this program; they are batched there, not asked one at a time:

- WP14 legal and data policy: Dilisense role, DPA, and assent evidence.
- Issue #438: the two `avg_latency_ms` production writes (already DQ-27).
- Any branch or rescue snapshot found to hold genuinely unmerged work whose
  disposition is a product call rather than a technical one.
- The M4 flip itself: one yes on the exact reviewed commit.
- Any new recurring cost, vendor contact, or one-way public act.

Everything else, including architecture, schema, tooling, test design,
sequencing, deleting merged branches, and re-homing programs, is decided by the
session and reported afterwards in plain English.

## Reporting cadence

After each merged batch: a plain-English summary of what changed, what it means,
and what is queued, at most 300 words, in the PR description and the handoff.
The daily run's morning brief carries the program's one-line status. No
engineering detail reaches the founder unless a decision in the list above
depends on it.

## Hard boundaries inherited from the migration plan

No M4 cutover, Notion retirement, or dual-write before T7. No production write,
vendor switch, routing change, or credential mutation. No secrets in Git or
evidence. No editing existing Notion Journal or Decision content. Shared-checkout
and no-stash rules from `CLAUDE.md` apply to every batch.
