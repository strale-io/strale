---
doc_type: program-plan
authority_scope: none
program: cto-readiness
status: active
started: 2026-09-02
owner: claude-code
review_route: author-self-verification-plus-fresh-codex-review
---

# CTO-readiness program

> Execution record, not project truth. This file and `tracks.yaml` say what is
> being done and what remains. They never restate product facts, state, or
> decisions; those live in `docs/project/` and `docs/decisions/`.

## Resume here

Any fresh session, **Claude Code or Codex**, resumes this program by starting
here and following only the pointers below:

1. `git fetch origin`, then create an isolated worktree from current
   `origin/main` (`git worktree add --detach <path> origin/main`, then
   `git switch -c <type>/<kebab-name>`) and run `npm ci` inside it. Worktrees
   do not share `node_modules`, and linking is forbidden. Never work in the
   shared checkout at `C:\Users\pette\Projects\strale`; it belongs to other
   work.
2. Read `tracks.yaml`. The single track with `status: active` is the current
   batch. Its `next_action` is the next concrete step. Read its `resume_file`
   in full: it is the handoff written by the last session that touched the
   track and names any further sources that batch needs.
3. Run `npm run programs:check`. If it fails, the register is inconsistent and
   repairing it is the first task.
4. Work the batch through the **batch loop** below. Do not start a second track
   unless the active one is blocked and the blocker is recorded.

Chat history, Notion, and handoffs other than the active track's `resume_file`
are never needed to resume.

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
| T5 | CTO-readable structure | `README.md` reads top-down for a stranger; `docs/` has one index; `archive/` and `handoff/` are indexed; root contains only top-level canon; the target information architecture in the migration plan section 5 is reached or each deviation is recorded. |
| T10 | M2 exit-gap closure | The closure register's blocking gap count is 0 and the closing independent review of the M2 candidate set is archived. This is the M2 exit gate; T6 depends on it. |
| T6 | M3 repo-native workflows | Per migration plan section 10 M3: Notion replacements for daily priorities, activity, vendor state; session start/end and `go` prepared against repo-native sources; protocol coverage manifest complete; nothing activated. |
| T7 | M4 atomic cutover | Per migration plan section 10 M4. **Founder confirms the flip.** Entrypoints become peers, Notion consumers removed in one PR, guards blocking. |
| T8 | M5 to M7 closeout | Legacy authorities archived, clean-session acceptance passed on both tools, plan archived with evidence. |
| T9 | Discovery and retrieval (WP16) | Re-homed from remediation. Starts only after T7. Its own plan when opened. |
| T15 | Receipts and migration ledger | Test and audit evidence is an immutable receipt file cited by path, never a count in prose; every migration block is ledgered, append-only, with no two blocks writing the same column. |
| T14 | Cheap extras | Every environment variable read by code has a manifest row with holder and cost class and the example files are generated; every model id lives in one registry with a pinned date and decision; a claims register says which public claims are allowed, need evidence, or are forbidden, and a check refuses forbidden phrases on the public surfaces. |
| T13 | Design tokens as data | `design/tokens/active.json` is what production runs per surface; candidates carry a status; promotion is a decision record plus a file swap; `design:check` in CI refuses off-token values in the consumers and a swap without a decision. |
| T12 | Research contract | Every `docs/research` file carries status and supersession front matter, one current answer per topic, a generated index, and a checker in CI that refuses drift and refuses active decisions citing superseded research. |
| T11 | Website repo hygiene and design preservation | Every website folder outside a git checkout preserved (tag or release asset with checksum) and removed; `strale-frontend` holds only `main`, owned work branches and archive tags, and runs the same session-end gate; the monorepo direction (redesign built as `apps/web` here) recorded in ROADMAP section 7 and filed as a decision record through the M2 path. |

Intended order: T1, T2, T3, T11, T12, T13, T14, T5, T15, T4, T10, T6, T7, T8,
T9 (T11 to T15 were inserted on 2026-09-02 when the founder approved the
website sweep and the authority plan; T5 ran before T4 because T4 is blocked
on the lost .env files, DQ-29). Only `depends_on` in the
register is enforced: T2 and T4 do not depend on T1, so either may become the
active track while T1 waits on review, provided T1 is marked `blocked` with the
review named as its blocker. Nothing in T6 or later starts before T1 is done.

Every track also declares a `gate` (`none`, `m2`, `m2-exit`, `post-m2`).
The M2 closure register's validator reads this file and refuses any
`post-m2` track that is active or done while a blocking M2 gap remains, or
that does not depend on the `m2-exit` track. The declaration alone is not
trusted: the closure register's validator carries a reviewed list of the
tracks allowed outside the gate (T1 to T5, T11 to T15), and any track not on that list is
gated whatever it declares. Adding an independent track is a reviewed edit
to that list.

The register carries a `program_status`. While it is `active`, exactly one
track is active. It becomes `paused` only when every runnable track is done
and the remaining work waits on a founder gate (T7 becomes `founder_gated`
with the approval named as its blocker; the technical preparation of the
cutover is session work and stays session-owned). It becomes `complete` when
every track is done or rehomed.

## The batch loop

Every batch, on either tool, runs this loop. A batch that skips a step is not
done.

1. **Worktree.** Fresh worktree and branch from `origin/main`, `npm ci` inside.
2. **Plan.** A short stored plan in `archive/sessions/<date>-<track>-plan.md`:
   scope, files, exit test, what is explicitly out of scope.
3. **Implement**, with tests that fail before the change and pass after.
4. **Record on the branch.** Update `tracks.yaml` (status, evidence,
   `resume_file`) and write the handoff to
   `handoff/_general/from-code/<date>-<track>.md` as commits on the same
   branch, so the reviewed commit already carries the register change.
5. **Self-verify in the author's own environment.** A fresh read-only agent of
   the same tool that authored the batch (a Claude sub-agent for Claude Code
   work, a Codex sub-task for Codex work) is told the exit criteria and asked
   to break the work, not to praise it. Findings are fixed or explicitly
   carried. Claude is never invoked as the independent reviewer of
   Codex-authored work; that is the founder's 2026-09-01 review-routing rule
   recorded in `AGENTS.md` and `CLAUDE.md`, and it stands until a recorded
   supersession says otherwise. Where an older handoff says "do not invoke
   Claude for review" without qualification, it means this independent
   review; same-tool self-verification of Claude-authored work is permitted.
6. **Independent review.** A fresh, separate Codex task (`gpt-5.6-sol`,
   `xhigh`, read-only, closed after its verdict) reviews the exact final
   commit, register change included. Blocking findings are fixed and
   re-reviewed; nothing ships on a FAIL. **While Codex is unavailable**
   (founder instruction 2026-09-02: Codex quota exhausted), the independent
   review is a fresh read-only Claude agent that did not author the batch,
   given the same brief; the PR must say the review was same-provider, and
   the first Codex session after quota returns re-reviews anything merged
   under this fallback that touched money, compliance, production, or the
   M4 cutover.
7. **Ship.** Open PR, wait for CI, merge, verify `origin/main` carries the
   commit.
8. **After merge.** Add a Journal entry while Notion remains authoritative,
   delete the branch, `git worktree remove` the worktree. The session that
   merges is the session that cleans.

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
