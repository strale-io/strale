# 2026-08-30 — morning operating session

Intent: run the daily operating session under DEC-20260815-A / DEC-20260822-A —
measure the business, clear overnight health, dispose of stale work, and hand
back the two artifacts.

Proactivity level 5 throughout: everything below is solved-and-done or has a
stated contingency and a named next step.

## Headline

| | |
|---|---|
| Deployed commit at check | `c501f277` == `origin/main` tip |
| Rolling 7d revenue | €75.84 across 12 payers, 100% attributed |
| Last complete ISO week (08-17) | €66.31 / 1,000 calls — 3rd consecutive rise |
| Week in progress (08-24) | €68.95 / 1,199 calls, day 7 of 7, **not comparable** |
| Vendor tower | ACTION NEEDED — 4 CRITICAL, all OpenRegister, all known and by design |
| Open PRs | 0 at start → 1 opened, merged, 0 at end |
| Remote branches | **43 → 36** (7 deleted, each verified merged, then verified gone) |
| Shipped | PR #440, squash-merged as `9eda7694` |

## A first, because it nearly wasted the run: the checkout is on a stale branch

The primary checkout at `C:\Users\pette\Projects\strale` sits on
`remediation/wp9-artifacts`, **75 commits behind main**, and the daily-run
authorities do not exist in it — `docs/company/DAILY-RUN.md`, `LESSONS.md`,
`briefs/`, `scripts/commercial-brief.ts`, `scripts/check-ceo-brief.ts` and
`src/lib/metrics/commercial.ts` all post-date that branch.

Read them out of git (`git show main:<path>`) rather than switching branches,
and ran every script from the pre-existing `strale-wt-checkin` worktree after
fast-forwarding it to `origin/main`. **No branch switch happened in the primary
checkout**, per the Shared-Checkout Rule.

**This is why B2b insists the hygiene check runs from the primary checkout.** It
did, and it was right. But note the recursion: yesterday's fix — the banner that
announces "you are running an out-of-date copy of me" — lives in
`check-self-staleness.ts` on main, and the primary checkout is too far behind to
have it. **The staleness warning cannot reach the checkout that needs it.** Not
a defect in the fix; a limit of where the fix can be installed. Recorded rather
than patched.

## Step A — measure

`ceo-dashboard.ts` and `commercial-brief.ts`, production read-only, from the
worktree.

Discrete ISO weeks, canonical external population:

| week | revenue | calls | |
|---|---|---|---|
| 2026-08-24 | €68.95 | 1,199 | day 7 of 7 — in progress, **not comparable** |
| 2026-08-17 | €66.31 | 1,000 | |
| 2026-08-10 | €39.24 | 620 | |
| 2026-08-03 | €27.38 | 451 | |
| 2026-07-27 | €10.85 | 193 | |
| 2026-07-20 | €37.98 | 522 | |

**Second-sourced** through a different window and a different function, per the
second-source rule — `payingActors` / `payerFacts` over rolling windows:

| window | revenue | payers | top share | unattributed |
|---|---|---|---|---|
| 7d | €75.84 | 12 | 74.6% | €0.00 |
| 14d | €137.82 | 14 | 85.7% | €0.00 |
| 30d | €212.28 | 15 | 58.0% | €68.82 |

The discrete week says 12 payers / 74.9%; the rolling 7d says 12 / 74.6%. Two
populations, agreement within 0.3pp. The 30d figure is **not** a concentration
improvement — €68.82 of that window predates the identity instrument, so its 58%
is a share of what happened to be visible.

### The number that would have been wrong: `comparable = false`

`concentration()` returns an explicit `comparable` flag, and for this week it is
**false** (`partialWindow = true`). The obvious headline — *"concentration fell
from 96.4% to 74.9%"* — is exactly the comparison that flag exists to block, and
the module's own docstring records the first production run reading 99.3%
against a prior 19.0% where the prior figure was an artefact of coverage.

So the week-over-week concentration *movement* is asserted nowhere. What is
asserted is the within-week distribution, which needs no cross-window
comparison.

### Who actually paid — rolling 7d, 12 payers

| payer | spend | calls | active days | entry capability |
|---|---|---|---|---|
| `x402:v1:e9e672ef71` | €56.55 | 1,112 | 8 | email-validate |
| `user:v1:e3c68534-4` | €11.09 | 22 | 4 | competitor-compare |
| `x402:v1:35f8dfc00f` | €5.44 | 55 | 2 | address-geocode |
| `x402:v1:6bfcaec686` | €2.05 | 41 | 3 | image-to-text |
| 8 further wallets | **€0.62 combined** | 18 | 1 each | mostly email-validate |

**"12 payers" is 4 payers and 8 trials.** The eight smallest spent 62 cents
between them, one day each, one or two calls each. Any read that treats 12 as a
customer count will over-conclude; the honest count of buyers who did anything
meaningful is **four**, up from one.

`repeatPayers = 4`, `repeatPayersExcludingTop = 3`, `activePayingDays = 8`.
`newPayers` / `returningPayers` are both `null` — the identity instrument
(2026-08-15) is younger than the 90-day lookback, so first-purchase versus
repeat is genuinely unanswerable and is reported `unavailable`, not guessed.

**Yesterday's priority 1 is answered.** The card customer
(`user:v1:e3c68534`) is at €11.09 across **4 buying days** in the window.
Yesterday asked whether their return would become a habit; four separate days is
a habit, not an episode. Their entry capability is `competitor-compare` — the
multi-entity comparison DQ-21 named as the thing to build for them.

**Yesterday's priority 3 is partly answered.** The two genuinely new non-trivial
wallets arrived via `address-geocode` (€5.44) and `image-to-text` (€2.05).
Neither is company-data or compliance. New paying demand is landing on
general-purpose utilities, not the KYB wedge — carried into GOALS.

## Step B — overnight health

`npm run vendor:status`, production read-only. **ACTION NEEDED, nothing new.**

Four CRITICAL, all OpenRegister: 0/500 credits, and `german-company-data` plus
`invoice-verify-de`, `kyb-complete-de`, `kyb-essentials-de` auto-suspended until
the **2026-09-06T23:40Z** free reset. Settled on 08-27 as not worth buying
(€1.80 of observed demand, all of it from the dominant wallet we already have,
against €59/month for OpenRegister Pro — break-even ~295 paid calls/month).
**Fourth consecutive morning with the identical finding.** Not a defect, not a
correct refusal — an instrument faithfully reporting a deliberate commercial
choice. It does not go to the brief, and re-diagnosing it each morning is the
waste this line exists to prevent.

Five WARNINGs, all pre-existing: `esortcode` finite credits with no balance
endpoint; `anthropic` and `cdp` declaring spend monitoring that has never
reported; `cobalt-intelligence`, `einsearch`, `sec-api-io` paid/finite with no
vendor account record.

Browserless 998/1000 (resets 09-25). Serper 47,436/50,000 — **20 queries
consumed since yesterday's 47,456**, consistent with light real traffic; expires
2026-11-08. Dilisense and Anthropic healthy.

**Deployed commit `c501f277` matched `origin/main` at check time.**

## Step B2 / B2b — stale work

Hygiene check run **from the primary checkout** (not the worktree): 0 red, 3
yellow. All three second-sourced, and two turned out softer than they read:

1. **"Branch has no upstream — local commits won't be pushed."** Second-sourced
   against the remote: local `remediation/wp9-artifacts` is `fda70aba`, and
   `origin/remediation/wp9-artifacts` is the **same sha**, 0 commits ahead.
   Nothing is unpushed. The warning is about tracking configuration, not data at
   risk.
2. **"9 handoff files never committed."** Enumerated each against `origin/main`:
   **4 were already on main**, 5 were genuinely at risk. The check compares
   against the local branch, which is 75 commits behind — the same mechanism as
   yesterday's false alarms.
3. **Checkout on a superseded branch.** Confirmed superseded by **file
   contents**, never commit counts: the working tree's uncommitted `alerting.ts`
   change is an *older, worse* draft of work already on main — main's version
   deliberately dropped the `NODE_ENV === "test"` clause because a production
   deploy with `NODE_ENV` mis-set would have suppressed every alert.
   `alerting.isolation.test.ts` is likewise already on main.

**Disposed:** the five genuinely-at-risk records were committed and merged (see
Step D). The superseded uncommitted draft was **left untouched** — it belongs to
another session's working state, carries nothing main lacks, and overwriting
another session's working tree is not this run's call.

**Left open, deliberately, with a reason:** the primary checkout stays on
`remediation/wp9-artifacts`. Every unique artefact is now on main, so switching
is content-safe — but the Shared-Checkout Rule requires switching only when
nothing else is running, and this is an unattended 06:00 run with **23 live
worktrees**. Three tree corruptions have come from exactly this operation.
*Contingency:* next attended session switches it, verifying with
`node scripts/guard-tree-integrity.mjs`. *Owner:* next attended session.
*Deadline:* 2026-09-06.

## Step B3 — branch graveyard

Remote branches had grown **7 → 43** since the 08-23 sweep. Triaged the 10
oldest.

`files-differing` is worthless here: after a squash merge
`git diff main...branch` still shows every branch change, so a merged branch
looks permanently unique. Checked **content identity per file** instead, plus
merged-PR state, plus — after catching my own broken check — a **timezone-safe**
tip-versus-merge comparison. The first version compared a `+02:00` timestamp
against a `Z` one as strings and reported all seven as having post-merge
commits; in epoch seconds every tip predates its merge. A check that fails the
wrong way is the same family as a check that passes hollow.

Deleted (all: merged PR, zero files absent from main, tip predates merge). Ids
recorded so every deletion is restorable:

| branch | tip | PR |
|---|---|---|
| `wp9-landing` | `bb57b0de` | #366 |
| `remediation/wp10-job-coordinator` | `7dada5fc` | #376 |
| `remediation/wp10-observation` | `86f8ac09` | #377 |
| `feat/execution-receipt` | `b04dcea9` | #378 |
| `docs/receipt-phases-1-3-accepted` | `8be0a7ff` | #379 |
| `feat/receipt-phase4` | `b555f406` | #380 |
| `docs/receipt-phase4-reconciliation` | `8c47c1c1` | #381 |

Verified afterwards with `git ls-remote --heads origin` — **against the remote,
not the local ref cache** — all seven GONE, 43 → 36.

**Kept, with reasons:** `remediation/program` and `remediation/wp9-artifacts`
(no PR, active programme, `docs/remediation/PUBLIC-COPY-CORRECTION.md` recorded
as not yet on main); `feat/phase-7a-it-stakeholders` (PR #135 CLOSED not merged,
**4 files absent from main entirely** — unique rejected work, and at 16 days it
fails the >1-month test too).

## Step D — the work

### Five shipped-work records that existed only on disk

Issues #428, #432, #434, #436, #438 all shipped and deployed; their records were
untracked files in a checkout parked on a superseded branch. Committed
byte-identical.

Two matter beyond the archive:

- **#436** records that `page-speed-test`'s `avg_latency_ms` update was closed
  out **without ever being applied**.
- **#438** records two outstanding production writes needing a write grant no
  session holds.

### The guard that refused them, and why editing the prose was the wrong fix

CI went red on a **documentation-only** change:
`guard-production-write-access.mjs` greps `*.md` and keeps a per-file allowlist
of documents permitted to *name* `DATABASE_URL_WRITE`. Two of the five records
name it — both correctly, both describing the outstanding `--backfill` action.

The cheap fix — edit the sentences — is the one #436's own process notes warn
against: *"a check that forbids mentioning a removed mistake pressures the next
author to drop the explanation."* These are historical records; editing them to
appease a grep corrupts the record.

Made the guard precise instead. Added `isProseRecord(path)` — `handoff/**`
**and** `.md`. The protected property is untouched: no *code path* but the
authority module can obtain the credential, and the guard's own independent
re-derivation greps `*.ts` and `*.mjs` **only**, which is the honest statement
of its subject. A markdown file cannot read an environment variable. Scoped to
`.md` so a script dropped into `handoff/` is still an offender.

A directory rule rather than five allowlist entries because the allowlist's
purpose — making "it's just a doc" deliberate — holds for a handful of
long-lived policy documents and does not hold for an append-only journal with
one file per session.

**Tested against a throwaway git repository**, not by importing the guard, which
calls `exit(1)` at load time and would kill the worker the first time the real
tree had an offender. The fixture holds a handoff `.md` (must pass), a handoff
`.ts` (must fail), and a non-handoff `.md` (must fail).

**3 mutations, 3 caught:**

| mutation | caught by |
|---|---|
| drop `isProseRecord` from the filter | prose test + real-repo tests (4 red) |
| widen to the whole `handoff/` directory | "still flags a script beside it" (2 red) |
| widen to all markdown anywhere | "still flags markdown outside handoff/" (2 red) |

10/10 pass restored; `tsc --noEmit` clean. Merged as `9eda7694` after both CI
checks went green; records verified present on `origin/main` afterwards.

## Step C — decision queue

- **DQ-14** (`your_call`, Petter, since 08-18) — four items, still open, none
  blocking. Routed around as before; nothing today depended on any of them. Not
  re-raised.
- **DQ-21, DQ-20, DQ-18** — `answered`. Untouched. Per DQ-19's own lesson, items
  leave Petter's column when *he* moves them.
- **New: DQ-27** — the two outstanding production writes, filed so they stop
  living only in a GitHub issue.

### DQ-27, and why it is a request for authority rather than a decision

Verified against production this morning, read-only, via
`audit-execution-routing.ts`:

| slug | avg_latency_ms | p50 | p95 | over the 15s wall |
|---|---|---|---|---|
| `company-news` | **null** | 15,359 | 29,405 | 36 of 69 (52.2%) |
| `page-speed-test` | **8000** | 7,952 | 19,029 | 54 of 436 (12.4%) |

`page-speed-test` still reading 8000 is the point: #436 recorded that update as
part of its closeout and **it never happened**. Second instance of *recorded
decision ≠ executed decision* (DQ-11 was "DQ-4 finally executed").

**Sized honestly before escalating.** External customer calls over 90 days:
`page-speed-test` **13 calls / €0.65**; `company-news` **zero**. The defect is
structural and provable and has cost essentially nothing — the harness calls
executors directly and never meets the sync wall, so only real callers are
exposed and there have been almost none. Stated plainly rather than dressed up.

**Why I cannot do it:** `.env` holds no `DATABASE_URL_WRITE`, and
`FOUNDER_GRANT_PUBLIC_KEY_PEM` is `""` — both verified absent, both deliberately
so per the 2026-08-22 runbook, which destroyed the `strale_rw` password and the
founder key after establishing that a session can read any file its own user
can. **Not a gap to engineer around, and I am not proposing to reopen it.**
Step 1 of that runbook (set the `strale_rw` password, keep it in a password
manager, paste per command) has never been done.

## Step E — authorities updated

- `DECISION-QUEUE.md` — DQ-27 added.
- `GOALS.md` — "what we currently know" refreshed with the four-real-payers
  reading and the utility-not-KYB entry-point finding.
- `LESSONS.md` — **not** amended. The guard-versus-prose collision is arguably a
  fourth instance of "a structural check tripped on explanatory prose" (#436's
  notes record three in one session), which would put it past the three-strike
  threshold. I did not open a root-cause investigation today because the three
  prior instances live inside a single session's notes rather than as a named
  family, and drawing a family is a deliberate act better done with the evidence
  in front of me than as a by-product of a morning run. *Next step:* the next
  full session decides whether "guards that cannot distinguish code from prose
  about code" is a family, and if so runs the seven-step workflow.

## What the next session should pick up

1. **Switch the primary checkout to main** (see B2b) — content-safe, needs an
   attended moment.
2. **Decide the prose-guard family question** (see Step E).
3. **Chase the utility-capability finding**: the two new non-trivial buyers
   arrived through `address-geocode` and `image-to-text`. If new demand keeps
   landing on general utilities rather than the compliance wedge, that ranks
   above further KYB build-out and GOALS should say so explicitly.
4. **Watch the card customer's 4-day habit** — a fifth and sixth buying day make
   `competitor-compare` the clearest build signal we have.

## Notes

- No production writes. Read-only `SELECT` throughout; the one script that
  reached for a write handle refused by construction.
- No `git stash` anywhere. No branch switch in the primary checkout.
- Every revenue and usage figure came from `apps/api/src/lib/metrics`
  (`metrics.ts`, `commercial.ts`). No hand-rolled population — one attempt was
  started and abandoned the moment it became clear it was exactly the
  hand-rolled query the non-negotiable forbids.
