# 2026-08-29 — morning operating session

Intent: run the morning session under DAILY-RUN.md — measure the business,
clear overnight health, empty the PR and branch queues, and settle E4 before
its 2026-09-01 kill date rather than on it.

Proactivity level 5.

## Headline numbers

| | |
|---|---|
| Last completed ISO week (08-17) | €66.31 / 1,000 calls |
| Week in progress (08-24), day 6 of 7 | €60.91 / 1,032 calls — **not comparable** on totals |
| Growth | rising, third consecutive **completed** week |
| Revenue from all payers except the largest | **€17.10** (discrete, day 6) · **€19.16** (rolling 7d) — prev. best completed week €7.47 |
| Distinct payers | 10 (discrete week) · 11 (rolling 7d) · 13 (14d) |
| Largest payer share | 73.0% rolling 7d, `comparable=true` (€51.77 vs €19.16) |
| Repeat payers excluding the top | **3** |
| Identity coverage | 100% — €0.00 unattributed over 7d |
| **Card customer** | **RETURNED 2026-08-28T19:16Z** after the 08-26 silence |
| E4 | **settled: `cohort_failed`**, 3 days early |
| External spend, 7d | €5.25 of the €50 envelope |
| Deployed commit | `ce2d45ca` == `origin/main` at check; `d5e8e539` verified after merge |
| Open PRs | 1 at start → 0 at end (#409 closed, #429 opened + merged) |
| Remote branches | **42 → 11**, verified via `git ls-remote` |
| Vendor tower | ACTION NEEDED — 4 CRITICAL, 5 WARNING, all pre-existing |

## The commercial read

### The card customer came back on their own — and the timing matters

`user:v1:e3c68534-4`, our only card-paying customer. Yesterday's brief recorded
them as silent since **2026-08-26T19:02:51Z** with €3.91 unspent, and asked
Petter whether to write to them. He declined (DQ-21). **They bought again on
2026-08-28T19:16Z** — after the question was put and before it could have
mattered either way.

Second-sourced two ways: the 7d and 14d `payerFacts` windows return the identical
`lastSeen`, and their spend has moved from the **€8.09** yesterday's record
measured to **€11.09** now — roughly three more purchases. 22 calls across 4
active days; `firstSlugInWindow` is `competitor-compare`.

**What this settles.** DQ-21's recorded consequence was that "the only remaining
way to learn anything about this customer is their behaviour". Their behaviour
answered within 48 hours, and it answered the more useful question: a buyer who
stops with money in the wallet and then returns unprompted is **between
sessions**, not churned. The 08-28 framing ("why does someone stop while they
still have money to spend") was the wrong question — they had not stopped.

**What it does not settle.** One return is not a habit, and nothing here says
what they are building. The GOALS priority is unchanged and now better
supported: build the multi-entity comparison they are paying €1.00 a call to
assemble by hand.

### Concentration: the second-payer story held for a second week

Non-largest revenue, canonical external population via `lib/metrics`:

```
07-13  €0.00 (1 payer)    08-03  €0.73 (2)
07-20  €2.15 (3)          08-10  €7.47 (2)
07-27  €0.45 (2)          08-17  €2.40 (5)
                          08-24  €17.10 (9)  <- 6 of 7 days elapsed
```

€17.10 on day 6 against yesterday's €14.03 on day 5, and against a previous best
completed week of €7.47. The rolling 7d instrument independently gives €19.16
across 10 non-largest payers, `comparable=true`, `partialWindow=false`. Both
move in the safe direction on a partial week: an absolute euro count from
non-largest payers can only understate, and a payer count only accumulates.

**The top-share *percentage* is again deliberately not reported as a movement.**
The 7d rolling figure (73.0%) and the discrete-week figure (71.9%) are different
instruments from last week's 96.4% discrete-week reading, and mixing them is the
2026-08-22 F2 correction exactly. The euro count carries the same conclusion
without the artefact.

`repeatPayersExcludingTop = 3` — three buyers other than the largest returned on
a later day. That is the first repeat signal the instrument has ever produced,
and it is what M1's concentration bar actually needs.

## E4 — settled, `cohort_failed`, three days early

Yesterday's run could not evaluate E4 and recorded why: the cohort had sold
nothing, but so had the control in the latest week, and a cohort-only reading
cannot separate "these four are unwanted" from "no bundle sold this fortnight".

There was a second obstacle nobody had named: **no sanctioned way to count a
bundle sale existed.** Every revenue reading in `commercial.ts` joins
`capabilities`; bundle purchases carry `solution_slug` with a NULL
`capability_id`. DAILY-RUN forbids hand-rolled revenue queries, so the question
was unanswerable *inside the rules*, not merely unanswered.

Shipped `src/lib/metrics/bundles.ts` — `bundleSales`, `cohortVerdict`,
`activeBundleSlugs`. `CohortVerdict` carries **`confounded` as a first-class
arm**, because the run closing E4 is required to "say which, or record that they
could not tell".

### The bias I introduced and removed — worth 3.6×

The first draft bucketed by week and widened the trial start back to its Monday,
reasoning that extra days could only make a kill *harder*. That is half true and
the wrong half is the dangerous one: extra pre-trial days spare the cohort, but
they also credit the **control** with orders predating the trial, making a kill
*easier*. On the real data: **29 control orders week-bucketed vs 8 counted by
date**, because 21 of the control's 26 orders in the week of 08-17 landed on
Monday 08-17 — the day *before* the cohort became payable. `ordersSince` is now
a filtered aggregate in the same single pass; the week series is presentation
only. Pinned by a test that fails against the week-bucketed version.

### The result

Since 2026-08-18, counted by day, canonical external population:

| | orders |
|---|---|
| the four cohort bundles combined | **0** |
| `lead-email-verify` (control) | **8** |
| every other bundle | 0 |

Independently confirmed against `/x402/catalog` live: all five present and
payable in the `solutions` array, and `competitor-read` priced **identically**
to the control at $0.216. Not a listing artefact, not a price artefact.

**Second-sourced by yesterday's own record**, which had already written "8
orders / €1.60 since 08-18" and did not apply it. The confound was never real.

Two of the four cost more than the control ($0.324, $0.594) and that remains an
untested alternative explanation — recorded in GOALS.md as noted rather than
claimed.

**Recorded in GOALS.md:** stop building growth bundles of this kind. The four
are *not* delisted — they cost nothing to leave listed and a later sale is
information. Bundles as a form are not condemned: `lead-email-verify` still
sells weekly. The narrower lesson is that bundles sell when they package
something a buyer was already doing.

## Overnight health (step B)

Vendor tower **ACTION NEEDED**, nothing new since 08-28. Four CRITICAL, all
OpenRegister: credits exhausted, `german-company-data` plus the three German
bundles auto-suspended until the **2026-09-06T23:40Z** free reset. Settled 08-27
as not worth buying (€1.80 of demand against €59/month). Five WARNINGs — three
paid providers with no vendor account record (`cobalt-intelligence`,
`einsearch`, `sec-api-io`) and two declared-but-unreported spend monitors. All
pre-existing.

Browserless 998/1000, Serper 47,456/50,000 (expires 2026-11-08), Dilisense and
Anthropic healthy. Deployed commit matched `origin/main` at check time.

## The hygiene check has been running stale copies of itself — and the previous diagnosis was wrong

`session-close-check.ts --hygiene-only` reported 4 yellow, including **5 handoff
files "exist only on disk — losing this directory loses them"**.

**Three of the five were byte-identical to copies already on `origin/main`** and
were never at risk (`git hash-object` == `git rev-parse origin/main:<path>`, both
directions). A fourth, `2026-08-27-at-firmenbuch-migration.md`, is the
*pre-redaction* local copy of a file whose redacted version is on main — the
local one still names the write-credential variable in prose, which
`guard-production-write-access.mjs` refuses. Only two were genuinely unpreserved.

**And those two were not neglected either — a gate was holding them.** Committing
them failed CI on the same guard, for the same reason: both name
`DATABASE_URL_WRITE` in prose while describing a pending operator step. So the
warning "exist only on disk — losing this directory loses them" was, for every
one of the five files, describing something other than what was happening. Three
were stored, one was superseded, and two were blocked by a control working
exactly as designed. Resolved by applying the precedent the 2026-08-27 Austria
record set on 08-28 — the literal replaced by "the production write credential",
with a dated redaction note in each file saying why it could not be committed as
written.

**Worth a future session's attention:** the guard's allowlist is deliberately a
per-file decision, and this is now the third handoff to hit it. A record that
names a pending write step is a normal thing to want to write, and the current
route is "author it, fail CI, redact, retry". The check cannot distinguish
"nobody committed this" from "a gate refuses this", and reports the second as
the first. Not fixed today — it needs a decision about whether operator-step
prose gets a sanctioned phrasing rather than a per-file exemption, and that is
a design question, not a defect.

### The cause is not the check

The primary checkout sits on `remediation/wp9-artifacts`, **68 commits behind
main**. That branch predates `apps/api/src/lib/handoff-preservation.ts`
*entirely* — the file does not exist there and the checked-out script contains
no reference to `handoffIsAtRisk`. So the run executed the **pre-repair**
orphaned-handoff test. The repair for that exact false alarm has been on main
since PR #407 (2026-08-27).

DAILY-RUN.md requires running the check from the primary checkout because it
*reports on* whichever checkout it is installed in. Nobody had drawn the other
half: it is also *implemented by* that checkout. **A stale checkout makes the
staleness checker stale.**

**This corrects the 2026-08-28 brief**, which concluded the check "misdescribed
what it was looking at" for the third time in four days and should be "treated
as a pattern rather than repaired again". The check was correct on main on every
one of those mornings. Recorded as LESSONS.md **F7 incident 6**, with the
correction, because a ledger holding a diagnosis that re-measurement contradicts
is this family's own defining shape turned on its own record.

**Repair shipped:** `src/lib/check-self-staleness.ts`. Three arms, because both
obvious ones are traps — a failed comparison reports `unknown` rather than
silent agreement, and a difference with zero commits behind reports `diverged`
(local work) rather than `stale`. That second arm exists because the first
build of it told *me*, mid-edit, that my own new code was stale logic, and a
warning that misdescribes itself is how this family started. Compared on **file
content**, never commit distance — squash merges make distance meaningless.

Verified by feeding the predicate the real evidence from the stale checkout
(blobs `19dd1c08` vs `ae616b6c`, 68 behind): returns `stale`, naming the branch
and the distance. The primary checkout was not modified to do this.

**Not repaired: the underlying condition.** The primary checkout is still parked
on `remediation/wp9-artifacts` with another session's uncommitted work in it
(`alerting.ts`, `reconcile-stranded-executing.ts`, `test-env-setup.ts`, plus an
untracked `alerting.isolation.test.ts`). Moving it is the operation that
corrupted the tree three times, and doing it under a live session would be
worse than the drift. The guard makes the consequence visible; it does not
remove the cause. **Owner: whichever session finishes WP9. No deadline set — I
will not put a date on someone else's uncommitted work.**

## Shipped

| | what |
|---|---|
| **#429 merged** (`d5e8e539`) | bundle-sales instrument + E4 result; close-check self-staleness guard; GOALS.md and LESSONS.md updated |
| **#409 closed** | superseded by the merged #421; closed with the measurements and credit |

Deploy verified by effect: `GET /health` serves `d5e8e539`, and `/x402/catalog`
confirms #421's opt-in projection is live (default response carries no
`output_schema`; `?include=output_schema` carries it).

### #409 — disposing of the outside contributor's first PR

Yesterday's record says #409 was "disposed with owner + deadline". **Nothing had
been written on the PR itself** — zero comments, still open. That is the F7
shape again: a disposition recorded but not executed.

Closed today with the substance: what was kept (the projection), what changed
(opt-in), the measured cost that drove it (×4.50 gzipped on an unauthenticated
endpoint that discovery crawlers poll), and the note that the stated rationale
was already met by the 402 challenge's embedded `accepts[].outputSchema`. Both
behaviours verified live before writing. Judged mine rather than founder-gated:
CHARTER's one-way-public-acts list is publishing, directories and first
statements in new channels — this is our own repo, a channel we have already
used with this contributor, and closing a PR is reversible.

### CI caught a real defect in my own work

`guard-production-write-access.mjs` refused the first push: `e4-bundle-read.ts`
called `getDb()`, the application's **read-write** pool. An operator script
holding a writable handle with no Authority attached is the exact shape of the
2026-08-22 incident. Fixed by removing the handle rather than swapping it —
`activeBundleSlugs()` moved into `lib/metrics` beside the measurement it feeds,
so the script now connects to nothing, matching `ceo-dashboard.ts`.

## Branch graveyard (step B3)

**42 → 11.** Every branch with a MERGED PR deleted — 32 of them — each name and
SHA recorded first so all are restorable with
`git push origin <sha>:refs/heads/<branch>`. The list is in this session's
scratch and reproduced in full in the git history of the deletions.

**Verified against `git ls-remote`, not the local ref cache** — the F7 lesson
that "a deletion written down is not a deletion executed", which bit the
2026-08-23 sweep when six of seven recorded deletions were still on the remote.

The 11 that remain, and why:

| branch | disposition |
|---|---|
| `main` | — |
| `remediation/program` (08-21, 61 files) | live remediation programme, no PR. Owner: remediation programme. |
| `remediation/wp9-artifacts` (08-22, 22 files) | **real unmerged work**, 17 commits, no PR, and the branch the primary checkout is parked on. Contains `docs/remediation/PUBLIC-COPY-CORRECTION.md`, which DQ-18's correction names as the operative plan. Not mine to merge unreviewed — 3,123 lines touching `quality-floor`, `do.ts`, the x402 gateway and the schema. |
| `feat/phase-7a-it-stakeholders` (08-14) | PR #135 CLOSED, 7 files not on main. Oldest branch. Left this sweep: a closed PR is a decision someone made, and deleting the only copy of rejected work needs a reason beyond age. Deletable next sweep if nobody claims it. |
| 5 × `rescue/wip-*` | automatic rescue snapshots from the tree-corruption guard, 08-25 to 08-29. Left deliberately — they exist to survive exactly this kind of sweep. |
| `feat/bundle-sales-instrument` | deleted on merge |

## Decision queue (step C)

Nothing matured and nothing new is owed to Petter.

- **DQ-21** `answered` — settled by him 08-28; today's evidence (the customer
  returned unprompted) is recorded above and **does not reopen it**. No outreach
  happened, none is scheduled, and the return removes the argument for it rather
  than strengthening it.
- **DQ-20**, **DQ-18**, **DQ-10**, **DQ-3** — answered or decided, no action.
- **DQ-14** — four founder-only items, all still open, all still blocking
  nothing. Item 3 (read-only GitHub token) remains routed around by hand.

## What the next session should pick up

1. **Watch whether the card customer's return becomes a pattern.** Two more
   purchase days makes them a habit rather than an episode; `payerFacts`
   `activeDays` is the field. If it holds, the multi-entity comparison moves
   from "probably worth building" to "build it now".
2. **E4 is closed — do not re-run it on 09-01.** GOALS.md carries the result and
   the reasoning. The instrument is `scripts/e4-bundle-read.ts` if it needs
   re-checking after more time.
3. **The primary checkout is still on a stale branch.** The close-check will now
   say so in its own first line. Whoever finishes WP9 should move it; nobody
   else should, while that session's uncommitted work is sitting in it.
4. `apps/api/*.mjs` and `apps/api/{conc,daily}.ts` in the `strale-wt-checkin`
   worktree are another session's untracked scratch. Left alone.

## Non-negotiables observed

Production reads were `SELECT` only; no write credential exists in this session
and none was sought. No branch was switched in the main checkout. No stash. The
E4 worktree was created with `git worktree add`, had `npm install` run inside it
rather than a junction, and was removed through `git worktree remove` — its
directory needed a separate delete afterwards (the known post-install hazard),
checked for a reparse point first and confirmed the primary checkout's
`node_modules` survived. Every revenue figure came through `lib/metrics`. Every
finding above was second-sourced before it reached either artifact.
