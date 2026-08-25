# Second operating run — 2026-08-25 (F1 step 4)

**Intent:** the scheduled morning task fired a second time today, ~65 minutes
after the first run merged its artifacts. Rather than re-run and overwrite a
correct brief, this run verified what the first one left open, then executed the
largest item on its own next-session list: LESSONS.md F1 step 4.

Proactivity level 5. Deployed and verified: `3909dc1`.

---

## Why this run exists, and what it deliberately did not do

The first run of the day completed at 08:27 CET (`0e66223`) and its two
artifacts are on `main`: `2026-08-25-checkin-morning.md` and
`docs/company/briefs/2026-08-25.md`. This task fired again at 09:30 CET.

**The brief was not regenerated.** DAILY-RUN.md names one brief per date, and the
existing one is accurate. Overwriting it with a near-identical document would
have destroyed a correct account of the morning's work to satisfy a file-naming
convention. It was **amended** instead — two sections changed, plus one factual
correction to a recommendation Petter is currently holding. Details below.

The measurement steps (A) were re-run anyway, because they are cheap and because
the single most important open question — whether the new card-paying customer
came back — is answered by them and by nothing else.

---

## A. Measurement — re-run, 90 minutes on

Both instruments through `lib/metrics`, read-only. No hand-rolled query produced
any figure here.

| | 08:15 run | 09:35 run |
|---|---|---|
| week of 08-24 (partial) | €15.41 / 202 calls | €15.54 / 205 calls |
| week of 08-17 (completed) | €66.31 / 1,000 | unchanged |
| growth verdict | rising | rising |
| top payer share (partial week) | 79.3% | 79.5% — **still `comparable: false`** |
| dashboard 7d revenue | €60.30 | €59.98 |
| estimated external spend | €2.46 | €2.43 |

Nothing moved. The partial-week concentration figure remains explicitly
not-a-comparison; the first honest week-on-week read is after Sunday closes.

### The new customer — no return, and the trigger is slower than the brief implied

This is the run's second finding and it changes a recommendation already in front
of Petter.

```
top_ups, all accounts, last 14 days:
  2026-08-24T23:58:39Z  provider@dlgt.io  EUR10.00  stripe=true
  (nothing else)
```

Still the only card top-up on the platform. Their activity, by hour, last three
days:

```
08-23 21:00Z   2 calls  competitor-compare        EUR2.00  (trial credit)
08-25 00:00Z   2 calls  competitor-compare        EUR2.00
08-25 02:00Z  12 calls  adverse-media-check, beneficial-ownership-lookup,
                        insolvency-check, lei-lookup, pep-check,
                        sanctions-check, stock-quote, uk-company-data,
                        uk-disqualified-director-check, us-company-data,
                        vat-validate                EUR1.09
balance: EUR6.91
```

Two things the morning run did not have:

1. **The compliance burst is broader than recorded.** The morning record listed
   eight capabilities; the hourly cut shows **eleven**, adding
   `adverse-media-check`, `beneficial-ownership-lookup` and `sanctions-check`.
   That is a fuller KYB screening chain, not a partial one — it strengthens the
   same conclusion rather than changing it.

2. **"Wait for a second payment" is a weeks-scale trigger, not a days-scale
   one.** They hold €6.91. The 02:00Z burst of twelve compliance calls cost
   €1.09, so roughly **€0.09 per call on their current mix** — about 75 more
   calls before the balance runs down. At their observed rate that is weeks, and
   only if they keep going. The brief's recommendation ("wait for a second
   payment, then send one short note") therefore defers the decision far longer
   than it reads as deferring it.

   Second-sourced, and the second source qualifies the first: the mix is bimodal
   — `competitor-compare` at €1.00 would exhaust the balance in six calls — so
   the estimate is a function of which behaviour continues. The honest statement
   is a range, not a date. Written into the brief as a correction to my own
   recommendation, **not** as a reopening of the decision, which stays Petter's
   (LESSONS F10).

**Customer-data boundary observed.** The identity was already in the morning
record; nothing new was collected, no outreach performed, no prospect list
touched, and the domain does not appear in the brief.

---

## B. Overnight health

| finding | verdict |
|---|---|
| Open PRs at start | 1 (#392), opened 06:58Z by a concurrent session |
| CI on `main` | green through `0e66223` at start; green through `3909dc1` at end |
| Deployed commit vs `main` | equal at start (`0e66223`) and at end (`3909dc1`), verified by `GET /health`, not by log line |
| Remote branches | 18 → 21 during the run — concurrent sessions, not drift |
| Oldest unmerged branch | `feat/phase-7a-it-stakeholders`, 11 days. See B3. |

## B2 — stale work. **Open PRs at start: 1. At end: 0.**

- **#392** (`sharp` 0.35.3, libvips 8.17.3 → 8.18.3) — merged as `3909dc1`.
  Inherited libvips memory-safety CVEs reachable from `image-resize`, which is
  `x402_enabled`: no signup, no API key, so a crafted image reaches native
  decoder code for €0.03. Both gates green; the branch was `BEHIND` after my own
  merge, so `update-branch` first, checks re-run green, then merged. It arrived
  with the capability's first behavioural test, which is the right shape for a
  native-artifact bump.
- **#393** (this run's work) — opened, both gates green including
  `integration-db`, merged as `2e6ee06`.

**Merge discipline, after this morning's error.** The morning addendum records
batching `gh pr merge` with the cleanup that assumed its success, which closed a
PR when the merge had actually failed. Both merges here were issued alone and the
result read back from `gh pr view --json state,mergeCommit` before anything else
ran. #392's `mergeable` was `UNKNOWN` when first queried and `BEHIND` when
re-queried — exactly the state that produced the morning failure.

## B2b — local repo hygiene, run from the primary checkout

```
0 red · 4 yellow
  - checkout on 'remediation/wp9-artifacts', 33 commits behind main
  - that branch has no upstream
  - no 2026-08-25-*.md handoff in the primary checkout
  - 2 handoff files exist only on disk
```

**The two "uncommitted" incident records are not at risk.** Byte-compared against
`origin/main`: both are **identical** to the committed copies the morning run
landed. They are stale local duplicates, not unsaved work.

**The three modified tracked files are superseded, not unfinished.** They are a
pre-merge copy of the alert-isolation fix — the `sendAlert` test-runner gate and
the `test-env-setup` credential scrub — which landed on `main` in **PR #361**
(`340f580`) in a *better* form: `VITEST`-only detection with an injectable env
parameter, rather than the `NODE_ENV`-inclusive version sitting here. I began
porting it before checking `main`, and stopped when the second-source check found
it already there. Nothing is at risk; nothing needs committing.

**A structural finding: this condition is undisposable by the session that
detects it.** The scheduled task's hard rules forbid `git checkout <branch>` in
the primary checkout outright. DAILY-RUN.md B2b permits the switch under
conditions; the task file overrides it, and the task file wins. So the check
correctly reports a stale checkout every morning and no session is permitted to
fix it. This is the second consecutive morning it has been reported. It needs
either a human at the keyboard running one command, or an amendment allowing a
session to switch once it has verified the branch content is on `main` — which
this run has now verified, by file contents rather than by commit count:

```
apps/api/src/lib/alerting.ts                     superseded by 340f580 (better version on main)
apps/api/src/test-env-setup.ts                   superseded by 340f580
apps/api/scripts/reconcile-stranded-executing.ts absent from main; incident-specific
                                                 one-shot from the 2026-08-22
                                                 process violation
```

Not raised to Petter: it is an operating-rule question, not a founder decision.

## B3 — branch graveyard

No remote branch is older than 11 days; nothing meets the >1-month deletion bar.
Nothing deleted this run.

**`feat/phase-7a-it-stakeholders` — a correction to how it has been triaged.**
Three consecutive mornings have listed it as "delete or revive". Inspected
properly this run, it is **589 lines of substantially complete capability work**:
an executor, a full manifest, an OpenAPI resolver extension, a coverage-matrix
entry, and a mapper smoke script for Italian company stakeholders.

```
sha 8774fff02db86cd2322fc86f5a6fdf4723712458
```

Deleting that to satisfy a hygiene rule would be wrong, and "revive it into a PR"
is not a five-minute action either: a new capability owes the Capability
Onboarding Protocol (DEC-20260320-B) — structural validation, readiness check,
smoke test — and it calls a paid vendor. **The real problem is that it has never
been scheduled, and B3's binary framing has been converting that into a deletion
question every morning.** Recorded as the named first task for the next run, with
the SHA above, rather than disposed of by deletion.

## C. Decision queue

- **DQ-14** (`your_call`, owner Petter) — unchanged, no deadline, not blocking.
- **DQ-18** — settled; not re-presented.
- The outreach decision from this morning's brief **stays in Petter's column**.
  This run corrected a factual premise of my own recommendation inside it and
  moved nothing (LESSONS F10).
- Added **DQ-26** (F1 step 4 executed).

---

## D. The work — LESSONS.md F1 step 4

**Shipped as `2e6ee06`.** The family has misattributed capability defects seven
times since 2026-08-12 and has been open since 2026-08-22. Its own diagnosis is
that six prior repairs each widened *coverage* while the *default direction*
stayed "ours", so every newly observed error string starts misclassified.

**The measurement, taken before touching anything** (`f1-failure-attribution.ts`,
read-only, 90 days): 541 distinct strings over 280,945 calls; **47,582 land in
`internal`**, the only class the floor counts against a capability; rules that
claim a string only on positive evidence it is *not* about our code account for
**82.0% of that bucket — a lower bound, not an estimate**.

**The change.** `internal` is reachable only by positive match. The fallback is a
new `unclassified` class that leaves the denominator exactly as the
caller-attributable classes do, but is deliberately a *different* class: "not the
capability's fault" and "nothing says whose fault this was" are opposite operator
situations. `foldTrafficRows` counts the shortfall separately, and
`evaluateFloor` carries it on every decision and in its reason string.

**Deliberately not done:** a large shortfall does **not** defer the floor's
action. That is F1 step 6's replay to answer, and arming a suppression rule on an
unmeasured threshold is how this family started.

### The failure it nearly introduced — the transferable part

`INTERNAL_RE` was four parse-failure phrasings. With the fallback removed, every
runtime crash — a `TypeError`, a null dereference — would have become
`unclassified`, and the floor would have **stopped seeing genuine defects**. That
is the same family pointed the other way: a false accusation traded for a
blindness. It was caught by an *existing* test asserting a `TypeError` is
`internal`, not by design.

`INTERNAL_RE` therefore gained V8 error names and message text plus the house
`failed to extract` signature, each pinned by a test that the widening steals
nothing from `timeout`, `upstream`, `config` or `caller_input`.

**Generalisation, written into LESSONS.md:** when a fallback is removed, the
question is not "is the new default safer" but **"what did the old default carry
that nothing else now does"**.

### One existing test regressed silently, and was repaired rather than relaxed

`invocation-facts` pinned that a refusal whose wording the taxonomy does not
recognise is saved by the **structural** branch, not by the string — its own
comment says an earlier version of that assertion "passed even with the branch
deleted, so it proved nothing". Once the fallback became `unclassified`,
`counts_against_capability` was false either way and the assertion decayed into
exactly that again. Moved to `failure_class`, which only the structural branch
can set to `capability_refused`.

### Two findings surfaced by the change, recorded rather than papered over

1. `translate` throws **"Translation failed."** — two words naming no cause, no
   actor, quoting nothing. It *is* our defect and the taxonomy cannot tell, so it
   now reads `unclassified`. **Not** repaired by adding the string to
   `INTERNAL_RE`: that is the per-capability patch this whole change exists to
   stop. The repair belongs in the message. Expect more of these as step 6
   replays the census — that is the mechanism working, not a new problem.
2. A taxonomy-`internal` failure still maps to `provider_rejected` /
   `fault: "provider"` in `execution-outcome.ts` — the wrong actor for our own
   crash. `counts_against_capability` is unaffected, so it mislabels a report
   rather than a decision. Untouched on purpose.

The cost-control allow-matrix refusal was pinned as `internal` with a comment
saying the bucket was wrong and merely inert. Inverting the default fixed it as a
side effect.

### Evidence

**Moves no money.** Both the old destination (`provider_rejected`) and the new
one set `billable: false` — F1 step 3's economic falsification, now pinned by a
test rather than by an argument.

**Fail-before through `scripts/mutation-test.mjs`**, not by hand — LESSONS F11 is
at six incidents, four of which destroyed uncommitted work with
`git checkout --`, and its finding is that the guard already existed and nobody
reached for it. Three mutations, each green → red → green on a clean tree:

```
apps/api/src/lib/transaction-failure-taxonomy.ts  fallback -> "internal"     MUTATION CAUGHT
apps/api/src/jobs/quality-floor.ts                shortfall branch disabled  MUTATION CAUGHT
apps/api/src/lib/execution-outcome.ts             unclassified branch off    MUTATION CAUGHT
```

`tsc --noEmit` clean. Suite: **2,946 passing**. Six route/integration files fail
locally on 10s timeouts with no server running; **verified failing identically on
`main`** (18 failures there against 6 here in the same subset), so baseline, not
this change. CI's `integration-db` — which does have a database — passed on both
PRs.

---

## E. Authorities updated

- **LESSONS.md** — F1 step 4 marked done, with the near-miss, the
  generalisation, the two follow-ups, and step 6's replay named as the next
  measurement.
- **DECISION-QUEUE.md** — DQ-26.
- **docs/company/briefs/2026-08-25.md** — amended, not rewritten.

---

## For the next session

1. **`feat/phase-7a-it-stakeholders` is scheduled work, not a deletion
   question.** 589 lines, `8774fff`. Own it through DEC-20260320-B, or say
   plainly that Italian stakeholders are not wanted and close it with that
   reason. Three mornings of "delete or revive" have decided nothing.
2. **F1 step 6's replay is now cheap and is the measurement that matters.**
   Re-run `f1-failure-attribution.ts` against the repaired taxonomy and read the
   `unclassified` bucket back. Every recurring shape in it that is genuinely ours
   earns a rule in `INTERNAL_RE` with its observed call count attached. The
   bucket's size over time is the honest measure of whether the taxonomy is
   catching up — and it also answers whether a large shortfall should suppress
   the floor's action, which this run deliberately left alone.
3. **Read concentration properly once this week closes.** First honest
   week-on-week figure the platform has ever had; both weeks sit entirely after
   the identity instrument started on 2026-08-15.
4. **The new customer's balance, not their next payment, is the signal to
   watch.** €6.91 at roughly €0.09 a call on their current mix. A second top-up
   is weeks away at best, so treating it as the trigger defers the outreach
   decision much longer than the brief's wording suggests.
5. **The primary checkout cannot be un-parked by any session under the current
   rules.** Reported two mornings running, undisposable by design. Either a human
   runs one command, or the rule gets an exception for the content-verified case.
   Contents verified superseded this run; the SHAs are in B2b above.
