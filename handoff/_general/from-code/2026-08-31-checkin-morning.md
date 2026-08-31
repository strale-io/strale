# 2026-08-31 — morning operating session

Intent: run the daily operating session under DEC-20260815-A / DEC-20260822-A —
measure the business, clear overnight health, dispose of stale work, and hand
back the two artifacts.

Proactivity level 5 throughout: everything below is solved-and-done or carries a
stated contingency, a named owner and a next step.

## Headline

| | |
|---|---|
| Deployed commit at check | `3f562ca3` == `origin/main` tip |
| Last complete ISO week (08-24) | **€73.03 / 1,295 calls** — 4th consecutive rise |
| Concentration, 08-24 vs 08-17 | **76.0% ← 96.4%**, first ever comparable move |
| Non-top buyers who returned | **3**, up from 0 the week before |
| Week in progress (08-31) | €0.72 / 17 calls, day 1 of 7 — **no verdict drawn** |
| Vendor tower | ACTION NEEDED — 4 CRITICAL, all OpenRegister, all known and by design |
| Open PRs | 0 at start → 1 opened, merged, 0 at end |
| Remote branches | **45 → 40** (5 deleted in *both* halves, re-verified) |
| Shipped | PR #443, squash-merged as `d1e00703` |
| Defects found and repaired | 2 — one commercial instrument, one process |

## The finding that would otherwise have gone into the brief as fact

The commercial pack's headline conclusion this morning was:

> ★ Every euro we can trace came from a single buyer, so the business currently
> has one customer and one point of failure.

It also reported *"nobody bought on more than one day, so there is no evidence
yet of anyone building us into a routine"*.

Both are the **inverse** of the truth. The figures behind them were €0.72 across
17 calls — the first few hours of a fresh ISO week, because today is a Monday
and the pack answered every payer question on the week in progress.

This is the sentence DAILY-RUN.md Part 2 instructs the brief to carry. It was
caught because it contradicted yesterday's record loudly enough to be chased
rather than transcribed.

### Why the guard that exists did not fire

Nothing about this was unforeseen. `concentration()` has computed
`partialWindow` since it was written, and its own comment reads *"on a Monday it
reads as a jump to 100% concentration every single time"*. `comparable` folds
`!partialWindow` in correctly. A test named *"refuses to compare when the window
is a week still in progress"* passes. Today was the first Monday it ran.

Two independent failures:

1. **`interpret()` never read the field.** `comparable` had exactly one
   consumer, the prior-share gate, so a *movement* was correctly refused while
   the *level* — the half that shipped a false statement about the company — was
   asserted unconditionally.
2. **The caller never set it.** `commercial-brief.ts` called
   `concentration(thisWeek, facts, unattributed)` with no options, so
   `partialWindow` took its `false` default and `comparable` came back `true` on
   day 1 of 7. The printed line omitted its own "(window not comparable)"
   suffix, which is how the defect was confirmed rather than merely suspected.

**Generalisation, filed as LESSONS.md F2 incident 9:** *a guard a caller must opt
into is not a guard, it is a convention.* Both prior F2 repairs added a field
carrying a judgement alongside a value and assumed consumers would consult it;
here one consumer did and one did not, in the same file. Where the safe value is
the opposite of the default, the option should have been "declare this window
complete", not "declare it partial".

### The repair has two halves, and the second is the one that mattered

Refusing the verdict was the easy half: `interpret()` now returns after a plain
caveat when `partialWindow` is set, covering the **whole section** rather than
one sentence — dependency, acquisition and repeat all read the same corrupted
denominator, and "nobody bought on more than one day" is trivially true on a
Monday.

Silence alone would have traded a false accusation for a blindness on the single
most important commercial fact we produce, which is precisely the trap
LESSONS.md F1 step 4 names (*"when a fallback is removed, the question is not
'is the new default safer' but 'what did the old default carry that nothing else
now does'"*). So the payer questions now run on the **last completed week**,
exactly as `growth()` has always done for revenue, and the week in progress is
printed separately, plainly labelled, with nothing concluded from it.

### Before / after on identical production data

| | before | after |
|---|---|---|
| headline | one customer, one point of failure | largest buyer at 76.0% — €55.49 against €17.54 from everyone else |
| repeat | nobody bought on more than one day | 3 non-top buyers came back on a later day |

### Tests discriminate in both directions

Five new tests, mutation-verified against the un-repaired code:

| mutation | caught by |
|---|---|
| guard removed from `interpret()` | **4 fail**, including the exact sentence that shipped |
| guard made unconditional (`if (true)`) | **7 fail**, including *"still states the verdict when the window is complete"* |

The second mutation is deliberate: it pins that the repair does not buy silence
at the price of blindness. `tsc --noEmit` clean; 67/67 across `src/lib/metrics/`.

## Step A — measure

`ceo-dashboard.ts` and `commercial-brief.ts`, production read-only, from the
`strale-wt-checkin` worktree fast-forwarded to `origin/main`.

Discrete ISO weeks, canonical external population:

| week | revenue | calls | |
|---|---|---|---|
| 2026-08-31 | €0.72 | 17 | day 1 of 7 — **not comparable** |
| 2026-08-24 | €73.03 | 1,295 | last complete |
| 2026-08-17 | €66.31 | 1,000 | |
| 2026-08-10 | €39.24 | 620 | |
| 2026-08-03 | €27.38 | 451 | |
| 2026-07-27 | €10.85 | 193 | |

`growth()` reads **rising, 4 consecutive completed weeks**.

### The first week-over-week concentration comparison the instrument has ever sanctioned

GOALS.md has been waiting since 2026-08-22 for two *completed* weeks sitting
entirely after the payer-identity instrument switched on (2026-08-15). Both now
exist, both are 100% attributed, both return `comparable = true`:

| completed week | revenue | payers | top share | non-top repeat buyers |
|---|---|---|---|---|
| 2026-08-24 | €73.03 | 13 | **76.0%** (€55.49 vs €17.54) | **3** |
| 2026-08-17 | €66.31 | 5 | **96.4%** | 0 |
| 2026-08-10 | €39.24 | 1 | 19.0% | 0 — `comparable = false`, only 19.0% attributed |

**Second-sourced** independently through `payerFacts`/`concentration` over
discrete windows, driven from a throwaway script that imported the same metrics
module rather than re-deriving anything (deleted after use; no hand-rolled
population at any point). The 08-10 row is kept deliberately as the
counter-example: it is exactly the coverage artefact GOALS.md rejected twice
before, and the module still refuses it.

So 96.4% → 76.0% is a **real** movement, not a coverage artefact. The M1 bar (no
payer above 60%) is still not cleared.

### Who actually paid — last complete week, 13 payers

| payer | spend | calls | active days |
|---|---|---|---|
| `x402:e9e672ef71` | €55.49 | 1,142 | 7 |
| `user:e3c68534` (the card customer) | €9.09 | 20 | 3 |
| `x402:35f8dfc00f` | €5.44 | 55 | 2 |
| `x402:6bfcaec686` | €2.05 | 41 | 3 |
| 9 further wallets | **€0.96 combined** | 20 | 1 each |

**"13 payers" is 4 buyers and 9 trials** — €72.07 of the €73.03 sits in the top
four. Same shape as yesterday's caution about "12 payers", and it must survive
into any plan built on the number. `newPayers`/`returningPayers` remain `null`
and are reported `unavailable`, not guessed.

The dashboard's rolling-7d read (€70.47, 16 buyers, 100% identity) agrees on
direction and attribution from a different window.

## Step B — overnight health

`npm run vendor:status`, production read-only. **ACTION NEEDED, nothing new.**

Four CRITICAL, all OpenRegister: 0/500 credits, with `german-company-data` and
the three DE solutions auto-suspended until the **2026-09-06T23:40Z** free
reset. Settled on 08-27 as not worth buying (€1.80 observed demand against
€59/month; break-even ~295 paid calls/month). **Fifth consecutive morning with
the identical finding** — an instrument faithfully reporting a deliberate
commercial choice. It does not reach the brief, and re-diagnosing it each
morning is the waste that line exists to prevent.

Five WARNINGs, all pre-existing and unchanged: `esortcode` finite credits with
no balance endpoint; `anthropic` and `cdp` declaring spend monitoring that has
never reported; `cobalt-intelligence`, `einsearch`, `sec-api-io` paid/finite
with no vendor account record.

Browserless 998/1000 (resets 09-25). Serper **47,423**/50,000 — 13 queries since
yesterday's 47,436, consistent with light real traffic; expires 2026-11-08.
Dilisense and Anthropic healthy.

Deployed commit `3f562ca322fd` == `origin/main` tip `3f562ca3` at check time. No
open breakers or new quarantines surfaced; no failing CI on main.

## Step B2 / B2b — stale work

0 open PRs at start. Hygiene check run **from the primary checkout**: 0 red, 4
yellow.

1. **"Branch has no upstream."** Second-sourced: local `remediation/wp9-artifacts`
   `fda70aba` == `origin/remediation/wp9-artifacts`, 0 ahead. Nothing unpushed.
   Tracking configuration, not data at risk. Same as yesterday.
2. **"No handoff file for today."** Correct at the time of the check; this file
   is it.
3. **"Checkout not on main, 78 behind."** Standing condition — see below.
4. **"10 handoff files exist only on disk."** Enumerated each against
   `origin/main`: **all 10 are already on main.** Zero at risk. A false alarm
   produced by the check comparing against the local branch, which is 78 commits
   behind — the *third* consecutive morning for this specific false positive. It
   is the F7 incident-6 mechanism (an instrument that lives inside the state it
   measures) rather than a defect in the check, which is correct on main.

**The primary checkout stays on `remediation/wp9-artifacts`**, deliberately and
for the same reason as yesterday: every unique artefact is on main so switching
is content-safe, but the Shared-Checkout Rule requires switching only when
nothing else is running, and this is an unattended 06:00 run with 23 live
worktrees. Three tree corruptions have come from exactly this operation.
*Contingency:* next attended session switches it and verifies with
`node scripts/guard-tree-integrity.mjs`. *Owner:* next attended session.
*Deadline:* 2026-09-06 (unchanged).

## Step B3 — branch graveyard, and the root cause of a three-morning recurrence

**Yesterday's record states that seven branches were deleted and "verified
afterwards with `git ls-remote` — against the remote, not the local ref cache —
all seven GONE, 43 → 36". All seven were present again this morning at
byte-identical SHAs.**

This is the third morning in a row (08-22→08-23, 08-29→08-30, 08-30→08-31), and
every prior diagnosis in F7 assumed one of two causes: the deletion never
executed, or it was verified against the local ref cache. **Both are wrong.** The
08-30 deletions were real and the verification was correct.

### What actually happens

A separate scheduled job — the idea-lab studio's git janitor — carries this
repository in its own multi-repo manifest with `push_policy: "always"`, runs at
about 04:03Z daily, and pushes **every local branch that has no matching remote
branch** back to the remote. Strale's B3 sweep deletes at about 06:12Z. The two
have been undoing each other for at least nine days.

Confirmed four independent ways rather than inferred from one:

| evidence | what it shows |
|---|---|
| recreated remote SHAs == surviving **local** SHAs, exactly | the restore's source is our own local refs |
| GitHub `CreateEvent`s at 04:02–04:05Z on 08-29, 08-30 and 08-31 | a daily automated cadence, not a human |
| the janitor's manifest entry for this repo, in its own words | "the janitor backs branches up (push + rescue snapshots)" |
| `tools/git-janitor.mjs`, the `git push origin refs/heads/<br>:refs/heads/<br>` call | the mechanism in source |

Nine `rescue/wip-*` branches on our remote are the same job's other output, one
created at 04:03:38Z today.

### Neither system is malfunctioning

The janitor's doctrine — committed work that exists locally belongs on the
remote as backup — is correct, and a local branch with no remote counterpart is
exactly what it is built to rescue. **Our operation was the incomplete one.**
Deleting the remote ref while the local ref survives does not delete a branch;
it manufactures the precise condition a backup job exists to reverse. No
cross-repo negotiation is needed and none was attempted: the fix is entirely on
our side, and I did not touch another programme's canon.

### Repaired, as an invariant rather than a case

DAILY-RUN.md B3 now requires **both halves, local first** — deleting the remote
first leaves a window in which any backup pass restores it.

Executed this morning for the five branches not held by a worktree. Each
re-verified before deletion (merged PR, every changed file present on
`origin/main`), SHAs recorded so all five are restorable:

| branch | SHA | PR |
|---|---|---|
| `wp9-landing` | `bb57b0de` | #366 |
| `remediation/wp10-job-coordinator` | `7dada5fc` | #376 |
| `remediation/wp10-observation` | `86f8ac09` | #377 |
| `feat/execution-receipt` | `b04dcea9` | #378 |
| `feat/receipt-phase4` | `b555f406` | #380 |

Verified after: `remote=0 local=absent` for all five, checked against
`git ls-remote`, not the ref cache.

**Left open with owner and deadline:** `docs/receipt-phases-1-3-accepted` and
`docs/receipt-phase4-reconciliation` are checked out in `strale-wt-wp10` and
`strale-wt-receipt`. Git will not delete a branch a worktree holds, and removing
another session's worktree is not an unattended-run operation. *Owner:* next
attended session. *Deadline:* 2026-09-06. *Contingency if skipped:* they
reappear nightly and cost nothing but noise.

### The transferable part, and why the previous repair could not have caught it

"Verify against the system, in the same breath as the claim" is still right and
it was followed. It is **not sufficient**, because it establishes the claim's
truth at an instant and says nothing about its lifetime. Where an external actor
can reverse the state, the verification is only as durable as the interval
before that actor next runs — here about 22 hours, comfortably shorter than the
gap between daily runs.

General form: **when a verified state is reversible by something other than us,
the check is not "is it true now" but "what would have to happen for this to
stop being true, and does that thing run".** The same question is owed anywhere
the daily run records a durable outcome — deleted branches, deactivated
capabilities, revoked credentials. Filed as LESSONS.md F7 incident 7; the
branch-deletion arm of that family now has a root cause.

## Step C — decision queue

- **DQ-27** (`your_call`, Petter, raised 08-30) — the two routing-latency
  corrections. **Unchanged and untouched.** Re-verified only that nothing today
  depended on it. The work stream around it *did* advance without him:
  `scripts/reconcile-438-routing-latency.ts` landed on main yesterday evening as
  PR #442, so the moment a route to production exists the change is one command,
  not a fresh investigation. It stays in his column; per F10, only he moves it.
- **DQ-14** (`your_call`, Petter, since 08-18) — four small items, none
  blocking. Routed around as before. Not re-argued.
- **DQ-21, DQ-20, DQ-18** — `answered`. Untouched.
- **Nothing new filed.** The janitor conflict resolved entirely inside my own
  authority and is not a founder decision; filing it would have been noise.

## Step D — the work

PR **#443**, `fix/commercial-partial-week-verdict`. Two commits:

- `2627ef8e` — the commercial instrument repair plus five discriminating tests.
- `04368bc1` — LESSONS.md F7 incident 7 and F2 incident 9, DAILY-RUN.md B3, and
  GOALS.md's "what we currently know".

Both CI checks green (`check` 2m05s, `integration-db` 2m10s). Squash-merged as
**`d1e00703`**. Its own branch was then verified gone in *both* halves
(`remote=0 local=absent`) — the invariant written this morning applied to the
morning's own work. Remote branch count 45 → 40.

## Step E — authorities updated

- **LESSONS.md** — F7 count 6 → 7, with the branch-deletion root cause; F2 count
  8 → 9, with the opt-in-guard generalisation.
- **DAILY-RUN.md** — B3 gains the both-halves-local-first invariant.
- **GOALS.md** — the first sanctioned week-over-week concentration comparison,
  the four-buyers-not-thirteen caution, and the instrument defect that reported
  its inverse.
- **DECISION-QUEUE.md** — deliberately unchanged.

## What the next session should pick up

1. **Switch the primary checkout to main**, and **remove the two stale worktrees**
   holding `docs/receipt-phases-1-3-accepted` and
   `docs/receipt-phase4-reconciliation` — both need an attended moment, both are
   content-safe, deadline 2026-09-06.
2. **Watch whether 76.0% holds.** One comparable movement is not a trend. The
   week closing 2026-09-07 gives the second point, and it is the first time
   concentration can be read as a series rather than a level.
3. **The three returning non-top buyers are the most valuable thing on the
   record.** Two arrived through general utilities (`address-geocode`,
   `image-to-text`) rather than the compliance wedge, and the card customer
   through `competitor-compare`. If that holds a second week it outranks further
   KYB build-out, and GOALS should say so as a ranking rather than an
   observation.
4. **Sweep for other opt-in guards.** F2 incident 9's generalisation is not local
   to `concentration()` — anywhere `lib/metrics` returns a judgement alongside a
   value, check whether every consumer reads it and whether the default points
   the safe way.

## Notes

- **No production writes.** Read-only `SELECT` throughout.
- **No `git stash`** anywhere. **No branch switch in the primary checkout.**
- Every revenue and usage figure came from `apps/api/src/lib/metrics`. The two
  throwaway scripts written for second-sourcing imported that module rather than
  querying directly, and were deleted after use.
- Both repairs were verified failing against the un-fixed state before being
  believed — the commercial one by two mutations in opposite directions, the
  branch one by observing the same reversal on three separate mornings.
