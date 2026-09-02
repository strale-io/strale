Intent: Run the 2026-09-02 morning operating session — and, once the run found the
primary checkout destroyed mid-session, preserve every commit that had only one
copy left and restore the working environment before anything else.

Proactivity level 5. Production was never affected; the whole incident is local.

## Headline

| | |
|---|---|
| Last completed week (08-24) | €73.03 / 1,295 calls · 13 payers · top share **76.0%** · unchanged from Sunday's read |
| Week in progress (08-31, day 3) | €28.54 / 523 calls — **no verdict drawn**, partial window |
| Rolling 7d (dashboard, independent window) | €79.05 · 16 buyers · 100% identity |
| Deployed commit | `5e91091d` == `origin/main` tip |
| CI on main | green · Open PRs: 0 |
| Vendor tower | ACTION NEEDED — 4 CRITICAL, all OpenRegister, all known and by design |
| **Local repository** | **primary checkout destroyed ~06:13Z; 28 branch tips recovered; 0 commits lost** |

## Step A — measure

`scripts/commercial-brief.ts` and `scripts/ceo-dashboard.ts`, production
read-only, both through `lib/metrics`. **No new business fact since 08-31**, and
that is the correct outcome rather than a gap: the last completed ISO week is
still 08-24, so the pack returns the same figures Sunday's run reported. The
next genuine reading is the 08-31 week's close.

What *is* new and is safe to state, because it is an absolute daily rate for one
identified payer and not a ratio over a partial window: **the largest buyer has
not paused.** €28.00 of the week-in-progress's €28.54 is theirs across roughly
2.25 elapsed days — about €12/day against the €8–9/day they ran in the two
completed weeks. After the 2026-08-22 settlement-volume scare, "is the one buyer
still buying" is the question worth answering daily, and today it answers yes.

Second-sourced by the dashboard's rolling 7d (€79.05 / 16 buyers / 100%
attribution) — a different window on the same canonical population, agreeing on
direction and attribution.

**Deliberately not written down:** the week-in-progress top share of 98.1%, and
the €0.54 from non-largest payers in it. Both are partial-window artefacts of
exactly the kind `Concentration.comparable` exists to refuse, and the 08-28
"absolute euros can only understate" argument cuts the other way here — a low
partial figure is what a partial window looks like, not evidence of anything.

## Step B — overnight health

`npm run vendor:status`, production read-only. **ACTION NEEDED, nothing new.**

Four CRITICAL, all OpenRegister: 0/500 credits with `german-company-data` and
the three DE solutions auto-suspended until the **2026-09-06T23:40Z** free reset.
Settled 08-27 as not worth buying (€1.80 observed demand against €59/month).
**Sixth consecutive morning with the identical finding** — an instrument
faithfully reporting a deliberate commercial choice. Does not reach the brief.

Five WARNINGs, all pre-existing and unchanged: `esortcode` finite credits with no
balance endpoint; `anthropic` and `cdp` declaring spend monitoring that has never
reported; `cobalt-intelligence`, `einsearch`, `sec-api-io` paid/finite with no
vendor account record.

Browserless 998/1000 (resets 09-25). Serper **47,322**/50,000 — 101 queries in
two days, consistent with light real traffic; expires 2026-11-08. Dilisense and
Anthropic healthy.

Production verified live rather than inferred: `GET /health` returns
`5e91091d29eb` == `origin/main` tip; `/x402/email-validate` answers **402** with
a challenge; a free-tier `/v1/do` call returns `completed` in **29 ms**. CI green
on main across the last twelve runs. Zero open PRs.

## The incident — the primary checkout was destroyed mid-session

### Timeline

| time (UTC) | what |
|---|---|
| ~06:00 | Session fetches and fast-forwards the `strale-wt-checkin` worktree to `origin/main`. Git works normally. |
| ~06:05 | `git ls-remote` returns **one** remote branch, `main`. `gh api` agrees. On 08-31 there were ~36. |
| ~06:08 | Commercial pack, dashboard and vendor tower all run to completion from that worktree. |
| ~06:13 | `git push` fails. Diagnosis: not a remote problem — `not a git repository: C:/Users/pette/Projects/strale/.git/worktrees/strale-wt-checkin`. |
| ~06:14 | `C:\Users\pette\Projects\strale` contains **zero entries**. `.git` is gone. |
| 06:2x | 28 branch tips pinned on GitHub. Primary checkout re-cloned, dependencies reinstalled. |

### What was established, and how

- **Every checkout on this machine was a worktree of the destroyed primary.**
  All 24 in `git worktree list` resolve `.git` to a file pointing into the
  deleted admin directory; none is a full clone. No local object store for this
  repository survived anywhere.
- **Working-tree files survived**; history did not.
- **The remote had already collapsed to `main` before the local destruction.**
  Verified twice by `git ls-remote` and twice more, minutes apart, by `gh api`
  (a separate transport and a separate credential). The repo is public and
  `gh auth status` is healthy, so neither reading is an auth artefact.
- **Production untouched**, verified live on both rails as above.

### What was NOT established, and is not asserted anywhere

- **What deleted it.** The GitHub events feed shows no bulk deletion *and is
  demonstrably incomplete* — head branches deleted after 20:08Z on 09-01
  produced no `DeleteEvent` — so it can neither enumerate nor exclude anything.
  The three `C:/tmp` worktrees are also absent from disk, which is consistent
  with a worktree-cleanup sweep continuing into the primary, but their deletion
  cannot be dated and the inference is not drawn.
- **Whether the two events share a cause.** Ordering is known; connection is not.

### Recovery

GitHub still served every deleted commit by SHA — checked on seven before
committing to the approach. The 28 tips captured from `git worktree list` at
session start were pinned as `rescue/2026-09-02/<original-name>`:

`fix/vendor-control-tower` `ee55a8bd` · `docs/vendor-control-tower-handoff` `5868a4e8` ·
`fix/vendor-restore-timestamp` `bc3daac3` · `detached/agent-a8a67eb62d7014255` `06d438b2` ·
`codex/docs-email-finder-provider-research-2026-08-31` `b5427ef7` · `detached/prod-sync` `7097805d` ·
`docs/remediation-rebaseline` `bab183c0` · `fix/audit-raw-error-leak` `a4c37f29` ·
`codex/repo-native-foundation-m1` `3501c354` · `codex/repo-native-operating-model` `b2951094` ·
`fix/image-resize-format-validation` `5588e82f` · `feat/arrival-shape-instrument` `f1cbfe04` ·
`fix/js-yaml-test-review-followup` `0540f296` · `fix/js-yaml-quadratic-dos` `e9c23d55` ·
`codex/repo-native-m2-canonical-product-state` `b354079f` ·
`codex/repo-native-m2-operator-actions-pending` `287a142c` ·
`codex/repo-native-m2-product-state-audit` `fe8431e3` · `codex/repo-native-m2-unblock` `28cc3de3` ·
`feat/receipt-phase5` `37331362` · `chore/preflight-image-resize` `a2babd61` ·
`docs/receipt-phase4-reconciliation` `8c47c1c1` · `fix/sharp-libvips-cves` `ff95371c` ·
`fix/sharp-test-review-followup` `6a6cfd26` · `feat/sync-field-allowlist` `4caa0cca` ·
`docs/receipt-phases-1-3-accepted` `8be0a7ff` · `fix/x402-body-limit` `9be5959c` ·
`fix/x402-geometry-and-413-followup` `5dd2a609` · `remediation/wp9-artifacts` `fda70aba`

All 28 verified present afterwards against the remote (29 refs total, = `main` +
28). Closed-unmerged PRs were enumerated separately as a second search space —
only #356 and #409, both deliberately closed long ago, neither needing rescue.
`remediation/wp9-artifacts` was checked before the loss and carries **17 commits
absent from `main` by patch-id and by subject**, so it was real unmerged work and
is the clearest reason the pinning mattered.

Primary checkout re-cloned into its canonical path (it was empty, so the clone
could destroy nothing), now on `main` at `5e91091d`, clean, dependencies
installed, remote access working.

### Recorded as LESSONS.md F12, and the investigation is open

This is a **new family**: one `.git` object store shared by a primary checkout
and every worktree, operated on concurrently by sessions that delete
directories. Count is **5 by mechanism** — the three partial tree corruptions of
2026-08-14 and the `node_modules` junction hazard were already in CLAUDE.md's
Shared-Checkout Rule but had never been gathered into a family, so the
three-strike threshold was passed without anyone counting. Steps 1 and 2 of the
root-cause workflow are done in this session as the rule requires; step 3 is
deliberately not attempted, because forming a hypothesis needs to know what ran.

The repair direction that does not depend on the answer: **the object store must
stop being a single point of failure.** A checkout whose history lives only
inside another checkout's `.git` is not a copy. Note the tension this creates
with the 08-31 F7 finding — the idea-lab janitor pushing every unbacked local
branch was correctly identified as undoing our deletions, and is also exactly
what would have made today a non-event. Both cannot be right for the same
branch; that is the design question F12 owes an answer to.

## Steps B2 / B2b / B3 — stale work

**0 open PRs** at start and at end. Deployed commit == main tip.

`session-close-check.ts --hygiene-only` was not run: the checkout it inspects was
destroyed mid-run and then replaced, so its findings would have described a
five-minute-old clone. The conditions it checks were established directly
instead — primary checkout **on `main`, 0 behind, clean tree, remote reachable**.
This also closes, by accident and permanently, the standing "checkout parked on
`remediation/wp9-artifacts`, N behind main" condition that has been carried with
an owner and deadline since 2026-08-25.

**B3 branch graveyard:** nothing to triage — the remote carries `main` plus the
28 rescue pins and nothing else. The pins are **not** a revived graveyard and
must not be swept as one.

*Owed, with owner and deadline:* triage the 28 pins from a checkout that can run
`git cherry` against them — merge what is real unfinished work, delete what is
substantively on `main` **by file comparison, never by commit count**.
`remediation/wp9-artifacts` is known to be in the first category.
*Owner:* next attended session. *Deadline:* 2026-09-09.
*Contingency if skipped:* the pins are durable refs on the remote and cost
nothing; the risk of delay is confusion, not loss.

## Step C — decision queue

Three `your_call` items open, all held per the charter's hard boundary. None
blocks any work stream, and each was checked for that rather than assumed.

- **DQ-28** (raised 02:30Z today, new overnight) — whether the row-level M2
  Decision register may be public. Its own text confirms nothing is blocked
  either way.
- **DQ-27** — two settled latency figures with no route to production. Today
  adds one relevant fact and it strengthens the entry rather than changing it:
  the whole local repository was destroyed and rebuilt by this session without
  any production write being possible at any point. The read-only boundary held
  through an incident, which is an argument for the operating model, not
  against it.
- **DQ-14** — four small founder items. Unchanged.

No `preauthorized_notice` items are open, so nothing matured for execution.

## Step D — the highest-leverage work

Recovery *was* it, and not as a consolation: the alternative to spending the
session on it was the permanent loss of every unmerged commit in the company's
engineering history, including 17 that had exactly one copy left. Nothing on the
milestone ladder outranks that on a day it is live.

The consequence for the ladder is that today buys no progress toward M1. The
ranked next action is unchanged and is stated in GOALS.md: the multi-entity
comparison, which is now the only instrument left for learning whether the card
customer returns, since DQ-21 closed the cheap one.

## Step E — authorities updated

- **LESSONS.md** — F12 added, with the population measured and the investigation
  opened in the same session.
- **GOALS.md** — not amended. The last completed week is unchanged and today
  produced no new business evidence; writing an entry to show the file was
  touched is exactly the drift it warns against.
- **DECISION-QUEUE.md** — not amended. Nothing today needs Petter: the
  destruction was local, the recovery is complete, and none of it is a
  founder-reserved act.

## For the next session

1. **Triage the 28 `rescue/2026-09-02/*` pins** (owner: next attended session;
   deadline 2026-09-09). File comparison, not commit counts.
2. **F12 steps 3–7 are owed.** Worth doing while the evidence is fresh; the
   design question is whether every local branch gets an unconditional remote
   copy, and how that coexists with B3's sweep.
3. **The old worktree directories are now orphans** — files with no history,
   `.git` pointers into a deleted admin directory. They are not broken *work*
   and nothing needs rescuing from them, but they will confuse the next session
   that runs `git worktree list`. Removing them is an attended operation.
4. **Sunday closes the 08-31 week** — the second honest week-over-week
   concentration comparison the company has been able to make, and the first
   chance to turn 96.4% to 76.0% from a point into a line.
