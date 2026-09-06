Intent: run the 2026-09-06 morning operating session under DAILY-RUN.md —
measure the business, dispose of overnight health and stale work, do the
highest-leverage work against GOALS.md, and hand back the two artifacts.

Proactivity level 5. Everything below is second-sourced or marked `unverified:`.

---

## Headline

Two findings, both corrections to what this repository currently believes, both
measured twice:

1. **The German workload our largest customer walked away from was not lost to
   refusals. 127 of the 159 failures were our data vendor answering "Payment
   Required" — the free allowance ran out inside their list.** The product
   change GOALS.md names as "the highest-value open product change we have"
   addresses 32 of those 159.
2. **Last week's fall in concentration has not repeated.** The three buyers who
   produced it paid €16.58 in the week of 08-24 and €0.47 in the week of 08-31.
   Top share is back to 98.6%.

Neither leads to a founder decision today, and one open item that reached
`main` this morning is already being repaired by the session that owns it.

---

## A. Business measurement

`ceo-dashboard.ts` and `commercial-brief.ts`, production read-only, both from
the primary checkout.

Discrete ISO weeks, canonical external population:

```
2026-08-31   €51.56  1077 calls   [in progress, day 7 of 7 — not comparable]
2026-08-24   €73.03  1295 calls
2026-08-17   €66.31  1000 calls
2026-08-10   €39.24   620 calls
2026-08-03   €27.38   451 calls
2026-07-27   €10.85   193 calls
```

`growth()` reads **rising**. Last completed week: 13 payers, top share 76.0%
(€55.49 vs €17.54), 100% of revenue attributable, 4 payers bought on more than
one day, someone paid on all 7 days. `newPayers` / `returningPayers` still
`unavailable` and must stay that way.

### The concentration finding, and how it was second-sourced

The commercial pack prints the in-progress week at **98.6% top share (€50.85 vs
€0.71 across 9 payers)** and correctly draws no verdict from a partial window.
The verdict is not the percentage; it is the carry-over, which I computed
separately through `payerFacts` over the two discrete weeks (scratchpad
`payer-series.mts`, not committed — it calls the module, never SQL):

| payer (truncated key) | week 08-24 | week 08-31 |
|---|---|---|
| `x402:v1:e9e672ef…` (largest) | €55.49 | €50.85 |
| `user:v1:e3c68534…` (the card account) | €9.09 | **absent** |
| `x402:v1:35f8dfc0…` | €5.44 | €0.47 |
| `x402:v1:6bfcaec6…` | €2.05 | **absent** |
| nine others | €1.01 | €0.24 |

Five wallets appear this week that were not there last week; every one bought
once, for €0.02–€0.05. So the 08-24 week's "13 payers" was one habitual buyer,
three short bursts and nine trials — and the bursts did not return. The two
computations (commercial pack; per-payer carry-over) agree on both weeks'
totals and shares.

`user:v1:e3c68534…` is the card customer. Last purchase **2026-08-28 19:16Z**,
so **nine days silent** as of this run.

### Instrument gap found, not fixed — the quiet list answers a stale question

`commercial-brief.ts` calls `quietPayers(lastFull)`, so "who has gone quiet" is
asked **as of the end of the last completed week** (2026-08-31T00:00Z). On that
date the card customer had bought three days earlier and is correctly not
quiet; today they are nine days silent, and the pack's quiet list still reports
one buyer at €0.30. The metric is not wrong on its own terms — the *question*
is up to seven days stale, and it is stale in the direction that hides the
single event this file has been watching for a week.

Not fixed today, deliberately: the honest fix is a second, trailing read whose
window starts `now − 7 days` (so `daysQuiet ≥ 7` by construction and a Monday
run cannot flag everyone at one day), and it wants a discriminating unit test on
the window construction rather than a quick edit to the script. **Next session:
this is a contained hour.** Proposed shape: export the trailing window from
`commercial.ts`, call `quietPayers` twice, print both under distinct labels.

## B. Overnight health

`npm run vendor:status` — status **ACTION NEEDED**, and every line already
known:

- `CRITICAL openregister` — 0/500 credits, no overage, resets
  **2026-09-06T23:40:04Z** (tonight). `german-company-data` plus the three
  German bundles auto-suspended 2026-08-25 16:07Z. Self-restoring; nothing owed.
- `WARNING esortcode` — finite prepaid credits, no balance endpoint. Durable by
  design; do not probe it with paid traffic.
- `WARNING anthropic` / `cdp` — spend monitoring declared, no reading yet.
- `WARNING cobalt-intelligence` / `einsearch` / `sec-api-io` — no vendor account
  record. This is DQ-30 answered: keep the keys, buy nothing, cancel nothing.

Breakers, monitor events and rail state read directly (scratchpad
`health-sweep.mts`, read-only):

- **One breaker open**: `us-court-search`, `state=open` since 2026-08-17
  06:14:57Z, 1 consecutive failure. This is DQ-14 item 1 — the CourtListener
  key expired and replacing it is founder-only. Unchanged, not new.
- **One `regression_detected`, overnight, and it is an instrument fault.**
  `canadian-company-data` at 2026-09-06 05:46:06Z: "was passing (90% over 10
  runs), now failing", on the `dependency_health` suite, error `No Canadian
  federal corporation found for "2408951"`. Triaged before writing it down:
  - **Who it happened to.** `who-called.ts --slug canadian-company-data
    --days 30 --errors`: **2,207 of 2,209 calls are the harness.** Two real
    calls in thirty days — one completed, one failed on the caller's own
    invalid number (`1234567`). **No customer has seen this.**
  - **Whether the upstream is broken.** It is not. Probed directly, with a
    control: `GET https://ised-isde.canada.ca/cc/lgcy/api/corporations/2408951.json?lang=eng`
    returns **HTTP 200** and the body `["could not find corporation 2408951",
    "Corporation 2408951 est inconnu."]`; `1234567` returns the same shape. The
    endpoint is healthy and the registry says this corporation does not exist.
  - **Verdict: the health-check fixture points at a corporation number the
    registry does not have.** The executor's refusal is correct behaviour and
    the capability is fine.
  - **Not repaired, and the reason is structural.** Fixtures live in
    `test_suites` in production, and there is no write route: `DATABASE_URL_WRITE`
    is absent from both `.env` and `apps/api/.env` (grep count 0 in each,
    checked this morning), deliberately, since the 2026-08-22 credential
    clear-out. Fixture refresh sits in the platform-acts-alone column of
    DEC-20260812-A, so this is **authority held and execution unavailable** —
    the same wall as DQ-27, now with a second, independent example behind it.
- `invariant_alert` — "lying-breaker shape" on `danish-company-data`
  (`closed` + `last_success_at` set + `total_successes = 0`). Row last touched
  2026-08-16; pre-existing, not overnight.
- `sec-api-io` dependency probe reports `unhealthy — Unexpected HTTP 200`
  hourly. The probe is a zero-cost `skipAuth` probe that expects a 401; a 200
  means the upstream answers unauthenticated requests. There is no sec-api
  subscription (DQ-30), so this is probe noise against a dormant vendor, not an
  outage. Left alone; worth folding into the probe's expectations if anyone
  touches it.
- `meta_monitoring` reports 94 active capabilities stale beyond 4× their tier
  interval. Expected: paid capabilities are not proactively tested
  (DEC-20260503-B), and the scheduler's own heartbeat is healthy — 11 suites,
  0 failed, 92 paid suites correctly skipped.
- `uk-gazette-notice-search` still fails every call on the Gazette's own
  HTTP 500. DQ-14 item 2, founder-only (it needs reporting to the vendor).

CI green on `main`.

### The German failure census — the run's main finding

GOALS.md's 2026-09-05 entry reads "195 calls, 36 completed, **159 refused**",
concludes that the refusal *shape* is what lost the workload, and names fixing
it the highest-value product change open to us. The population is right. The
failures were never opened.

Grouped by error string — twice, once through the sanctioned tool and once
through `populations.ts`'s own external filter (scratchpad `german-by-day.mts`):

```
cd apps/api && npx tsx scripts/who-called.ts --slug german-company-data --days 13 --errors
```

| outcome | calls | share |
|---|---|---|
| completed | 36 | 18% |
| **`OpenRegister returned HTTP 402: Payment Required`** | **127** | **65%** |
| `No confident German registry match for "…"` | 17 | 9% |
| `N distinct German entities match "…" equally well` | 15 | 8% |

Every one of the 195 falls on **2026-08-24** — identical output at `--days 13`
and `--days 45`, which is also what rules out any other day contributing.

Three consequences:

- The refusal-shape change addresses **32 of 159**. Worth doing, no longer the
  headline.
- The 2026-08-27 entry pricing OpenRegister Pro (€59/month) computed break-even
  against the **36 calls we answered** (€7.20) instead of the **195 the
  customer asked for** (€39.00 at list). Its verdict — not justified — may still
  hold on one unrepeated day, but its arithmetic was five-fold out. Both
  corrections are written into GOALS.md rather than left in this file.
- The trigger the 08-27 entry set, "re-open if the free reset is exhausted again
  immediately", is the right one and fires from tonight. **Tomorrow's run should
  check whether this wallet returns to German after 23:40Z.**

Logged as **LESSONS.md F2 incident 11** (count 10 → 11), with the arm named
explicitly: the earlier incidents counted the wrong rows; this one counted the
right rows and never asked what they were. DAILY-RUN.md step B now carries
"never read a raw failure count as one cause" beside the existing call-count
rule, so the rule lives where the run reads it.

## B2. Stale work

- **PR #590** (M2 closing review round 9) — checks green, `MERGEABLE`, an
  independent read-only review recorded per DEC-20260903-A. **Merged**
  (`2801a08f`). Remote branch deleted by the merge.
- **`GET /health` = `2801a08feb2e` = `origin/main` tip.** Deployed and current.
- **Five merged branches deleted, both halves, local ref first then remote**,
  each SHA recorded before deletion: `docs/m2-g2-batch-2-collisions`
  `93db9060`, `-3` `337d60ad`, `-4` `b5723882`, `-5` `e3415579`,
  `test/m2-register-fixtures-synthetic-collision` `3b90c735`. PRs #555, #560,
  #563, #569, #559 respectively, all merged 2026-09-05. Verified after with
  `git ls-remote --heads origin`: **`main` is the only remote branch**.
- **Both `knownWorktrees` baseline entries cleared** — `C:/tmp/strale-review-584`
  and `strale-wt-brand-consolidation` are gone from disk; their owners removed
  them, which is the condition each entry named for its own deletion.
- **Two local-only review branches kept and recorded** in
  `scripts/handoff/baseline.json` (`knownBranches`, previously empty):
  `pr-555-review` and `pr-563-check`. Reason in the file: `pr-563-check` carries
  `ef51de5e` "G2 batch 4 quote-fidelity review findings", and comparing its
  eleven edited records against `origin/main` file by file, **eight are
  identical and three are not** — `DEC-20260420-I`, `DEC-20260420-J`, and the
  `DEC-20260420-K` record ending `c0575c4`. Either those findings never merged
  or `main` changed them since; under the M2 convention that amended records
  keep their text, the first is likelier. Not resolved here — that is a G9
  question, not a hygiene one — and explicitly not deleted.

### The one thing that went wrong, and it was mine

**The PR #590 merge shipped a head that had already moved.** The branch owner
pushed `1fd08e94` at 08:09:36 (+02:00); I merged at 08:11:09; the squash carried
`ad1722bd`. `main` therefore has a `DEC-20260905-J` whose prose says "32
numbered items" against 31, and cites "items 26-28" as substantiations where 28
is a withdrawal — and the author's own fix for exactly that is not in it.

I attempted to land the fix on a branch off `origin/main` and **stopped when the
gates refused it**: `decision-records.test.mjs` and `check-project-context.test.mjs`
both fail `DECISION_ACTIVE_BODY_CHANGED` on `docs/decisions/records/DEC-20260905-J.md`,
which is the register working as designed — an active record's body is immutable
and corrections live in a new record. On the branch it was a new file and would
have merged clean; merging a stale head is what converted a routine follow-up
into something only a further erratum can address. Branch abandoned, worktree
returned to `chore/checkin-2026-09-06` clean.

**Already repaired by the session that owns it**, verified after the fact:
`origin/docs/dec-20260905-k-erratum` carries `23034d40` — "docs(m2):
DEC-20260905-K corrects the round-9 record's own item count (G9)". Round 10 is
running now from `2801a08f`. Nothing is owed from this run; the note stands so
the next session does not rediscover it.

Recorded as **LESSONS.md F7 incident 9** (count 8 → 9) with two rules, and
DAILY-RUN.md step B2 now carries the first: after merging, `git diff
<branch-tip> origin/main` must be empty — a green check and `MERGEABLE` are
computed on whatever head the API held when you read it.

**Near-miss, same cause, recorded honestly:** I removed the round-9 agent's
worktree (`.claude/worktrees/agent-a94d1af4ad89895d2`) after confirming it was
byte-clean including untracked files and content-identical to `origin/main`,
then found its branch tip had been pushed two minutes earlier. Nothing was lost
— everything was on the remote, and the removal went through `git worktree
remove`, which is why this is a near-miss and not an F12 incident — but the
repository's own baseline file says in as many words that a clean tree is not
proof a checkout is idle, and I reasoned exactly the way it forbids.

## B2b. Local hygiene

`npx tsx scripts/session-close-check.ts --hygiene-only`, run from the primary
checkout as the file requires: **all clear**. Trunk on `main`, clean, at the
tip.

## C. Decision queue

No `preauthorized_notice` window matured. Two `your_call` items unchanged and
untouched — **DQ-27** (two settled latency figures with no write route) and
**DQ-14** (four founder-only items). Both stay in Petter's column until he
moves them; both are carried into today's brief in the same shape as
yesterday's, which is the shape LESSONS.md F10 requires. DQ-30 is answered and
the vendor tower's three "no account record" warnings are its expected residue.

## D. The work

**`german-company-data`'s ambiguity refusal is now recognisable as a refusal.**
It was the last registry name path in the codebase carrying a full local
`pickByName` rather than a wrapper around the shared one — the 2026-08-14
consolidation (PR #236) passed it by because its listing carries register type
and number, which the shared function's `name (id)` listing cannot express. Two
things went with it: the typed throw, and a message the consumers recognise.
The wording opened with the candidate **count** — `2 distinct German entities
match "…" equally well` — and `isRefusalMessage` anchors its fragments at the
start, so nothing matched.

Measured, not inferred: all 15 of these that real customers met on 2026-08-24
classify `unclassified`, not `caller_input`. That bucket is `UNATTRIBUTED`, so
nothing was delisted and no capability was harmed — but it is excused as
*unattributed*, not as a refusal, so a correct refusal was invisible to the
breaker, the floor and the trust surfaces alike, and invisible as the demand
signal refusals are supposed to be.

Changed (`apps/api/src/capabilities/german-company-data.ts`):

- both refusal branches now throw `CapabilityRefusalError` rather than `Error`;
- the ambiguity message opens `Ambiguous German company name "…": N distinct
  German entities match equally well: …`, preserving every fact including the
  register listing and the disambiguation hint.

Guarded (`apps/api/src/lib/capability-refusal.test.ts`): German joins
`consolidatedRegistryRefusals()` — 4 → 5 — using a production-shaped pair
(`Beckmann Versicherungsmakler GmbH` / `… AG`, which normalise identically once
the legal form is stripped). Both existing assertions now cover it: the typed
error, and recognition by all three consumers (breaker, floor, quality signal).

**Fail-before verified, both directions.** With the fixed test and the
un-fixed executor restored from `origin/main`, `capability-refusal.test.ts`
fails 2 of 18 with `german pickByName: breaker: expected false to be true`.
With the fix applied: `capability-refusal.test.ts` + `german-company-data.test.ts`,
**33 passed**. `german-company-data.test.ts` needed no change — its existing
`/2 distinct German entities match/` assertion still matches the new wording.
Swept for other consumers of the old string: three files, all three expected.

Deliberately **not** done, with reasons:

- **Structured candidates in the error payload.** GOALS.md called this the
  highest-value open product change; the census above resizes it to 32 of 159
  failures. Still worth doing — an agent buyer cannot act on an English
  sentence, and `pickByName` already holds the candidate objects. It touches
  `CapabilityRefusalError`, both `pickByName`s, the `/v1/do` sync path and the
  x402 gateway's executor-failure catch, and the async path cannot carry it
  (only the message survives). That is a session, not a corner of one.
- **Anything that buys OpenRegister capacity.** Founder-gated (a subscription
  binds the company), and the escalation test says measurement can still
  resolve it: the allowance resets tonight and whether the customer returns is
  answerable within a day.

## E. Authorities updated

- `docs/company/GOALS.md` — the German causal correction at the head of "what we
  currently know"; the 08-27 OpenRegister break-even denominator corrected in
  place with its verdict left standing; a new entry for the concentration
  reversal with its partial-window limit stated.
- `docs/company/LESSONS.md` — F2 → 11 (incident 11, the failure-cause arm);
  F7 → 9 (incident 9, the stale merge head).
- `docs/company/DAILY-RUN.md` — step B gains the failure-cause rule; step B2
  gains the post-merge diff rule.
- `scripts/handoff/baseline.json` — worktree entries cleared, two review
  branches recorded.

## Independent review

A fresh read-only Claude agent that did not author the batch (DEC-20260903-A),
given a bounded adversarial scope over commit `fdcd71bd`. **Verdict PASS**, no
blockers, two nits. It traced all three health consumers to their predicates
rather than their comments (`circuit-breaker.ts:223`,
`transaction-failure-taxonomy.ts:379`, `quality-capture.ts:136`), confirmed the
taxonomy's earlier `INTERNAL_RE`/`TIMEOUT_RE`/`UPSTREAM_RE` passes do not claim
either new message first, swept the repository for consumers of the old wording,
traced `CapabilityRefusalError` to `outcomeFromError` on both the `/v1/do` and
x402 paths, and re-derived the F2 and F7 counters by counting the incident
entries. It independently reproduced the `baseline.json` claim — exactly 3 of
the 11 records `ef51de5e` edits differ from `main` — and correctly stated that
it could not verify the production figures itself.

- **Nit taken.** `german-company-data.test.ts:98`'s `/2 distinct German entities
  match/` was **unanchored**, so it matched the old wording too and could not
  have caught the defect it appears to guard — a small F5 shape. Now anchored on
  `/^Ambiguous German company name "Muster": 2 distinct .../`; 15 tests pass.
- **Nit acknowledged, not acted on.** The F7 incident-9 report rides in a commit
  whose title advertises the German fix. True. It is the same session's own
  finding about its own merge and splitting it would separate the incident from
  the run that caused it; the PR body leads with both.

The reviewer also observed that `origin/main` had advanced to `0fd6364f`,
"DEC-20260905-K corrects the round-9 record's own item count", merged 09:12:58Z
— independent confirmation that the stale-merge defect is repaired by its owner
and that nothing is owed from here.

## Next action

1. **Tonight/tomorrow: does the largest customer return to German after the
   23:40Z reset?** That single observation decides whether OpenRegister capacity
   becomes a founder decision or the 08-27 verdict stands. Nothing else about
   this is worth writing until it is known.
2. **The quiet-payer trailing read** (section A). Contained, discriminating test
   available, and it is the instrument that currently hides our second-largest
   customer's nine-day silence.
3. **Structured refusal candidates** for the registry name paths, correctly
   sized this time.
4. **G9, not this run's:** `pr-563-check`'s three unmerged record edits
   (`scripts/handoff/baseline.json`).
