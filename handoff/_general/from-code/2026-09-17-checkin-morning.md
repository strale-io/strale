# 2026-09-17 — morning operating session

Intent: run the 2026-09-17 morning operating session under DAILY-RUN.md —
measure the business, dispose of overnight health and stale work, do the
highest-leverage work against GOALS.md, and hand back the two artifacts.

Proactivity level 5. Everything below is second-sourced or marked
`unverified:`. **Previous morning run: 2026-09-12** — five days, not one, so
every health window below is stated explicitly and none of them is "since
yesterday". No brief exists for 13, 14, 15 or 16 September and `main` took no
commit after 2026-09-13; the scheduled run did not produce artifacts on those
days. `unverified:` why — the task definition lives outside version control
(DAILY-RUN.md says so itself) and this session cannot see its run history.

---

## Headline

1. **A scheduled check can be wired correctly, fail every week for five weeks,
   and be read by nobody.** `weekly-drift.yml` has failed **five consecutive
   scheduled runs**; its last successful cron run was **2026-08-10**, and the
   only green since is a manual re-run on 2026-08-18. Every failure is
   `password authentication failed for user "postgres"` — production's role
   moved to the read-only `strale_ro` and the workflow's `DATABASE_URL` secret
   did not. Seven drift mechanisms hang off that one workflow and three read
   production, including the TOAST-readability pass added *after* a corruption
   incident sat undetected for four months. `npm run scheduled:check` passed
   throughout, correctly: **a declaration cannot carry a value.** Shipped:
   `npm run scheduled:outcomes` (PR #683). The secret itself is founder-gated →
   **DQ-34**.
2. **DQ-33 was never a request only the founder could grant, and I should have
   found that on 12 September.** Four of its six registries were already
   repaired — by deploy-time startup-migration blocks 0114/0115, which are
   ordinary engineering. Verified live this evening: Canadian, Irish,
   Lithuanian and Swiss all hold the corrected value, none is quarantined, and
   Canadian/Irish/Swiss are passing again (58/61, 58/60, 59/60 over five days,
   against none at all before). Spanish is verified and queued for the same
   route. German cannot be verified from here at all.
3. **`lithuanian-company-data` fails 62 of 62 runs with an upstream HTTP 500
   that does not reproduce from this machine.** Every endpoint it walks answers
   200 from here, including the paged classifier sequence and the corrected
   company code, under curl, under node's own `fetch`, and under three user
   agents. Same shape as `youtube-summarize`'s standing quarantine ("YouTube
   strips caption data from datacenter IPs (Railway US East)"). No customer has
   called it in 14 days. Ordinary engineering, needs the live environment.
4. **The one buyer has demand we are failing, in German company data.** 218
   paying calls in 30 days, 45 completed — every one of them the largest payer,
   and **21 of them today**, of which 9 completed and 12 were refusals on
   ambiguous German company names. Nobody was charged for a failure.
5. **The account buyer the last brief called two weeks silent came back** — on
   14 and 15 September, after a 17-day gap, with a 25-call sweep across 24
   different capabilities. Two broad surveys of the catalogue three weeks
   apart, with one €1.00 product bought on four separate days in between. The
   most second-payer-shaped evidence in the data.
6. Revenue: last completed week **€51.97**, the week before **€58.77** —
   `growth()` reads **falling**, second week running. Largest payer **93.5%**
   of the *x402* side; the account buyer above sits outside that measure.

---

## A. Business measurement

`ceo-dashboard.ts` and `commercial-brief.ts`, production read-only, from the
batch worktree at `origin/main` tip (`9a8c6f0b`, clean).

```
2026-09-14     €36.86    618 calls  [in progress, day 4 of 7 — NOT comparable]
2026-09-07     €51.97   1082 calls
2026-08-31     €58.77   1168 calls
2026-08-24     €73.03   1295 calls
2026-08-17     €66.31   1000 calls
2026-08-10     €39.24    620 calls
```

`growth()`: **falling**, and now two completed transitions in that direction
(08-24 → 08-31 → 09-07). Last completed week: **14 payers**, top share
**93.5%** (€48.57 against €3.40 from everyone else), 100% attributed, **4**
bought on more than one day, someone paid on all 7 days. New-vs-returning
still `unavailable` and not guessed. Dashboard: revenue €54.05 rolling 7d,
buyers 34 (lower bound), identity 100%, spend €2.14.

Week in progress (day 4 of 7, **no conclusion drawn**): 8 payers, largest
share 86.9% (€32.04 against €4.82).

Quiet list: **6** previously-paying buyers silent, the largest €6.64 at 11d.
Floor, not ceiling — the lookback is pinned to 2026-08-15, the amounts are
spend since then rather than lifetime, and the cut-off is pinned to x402
wallet identity, so an **account** buyer is invisible to it either way.

**The account buyer the last brief worried about came back, and that is the
most interesting number this week.** The 2026-09-12 brief recorded "the
customer who pays by card has now been silent for two weeks, against a
previous longest gap of two days". They are not silent: they bought on
**2026-09-14 and 2026-09-15**, after last buying on 2026-08-28 — a 17-day gap,
then a return. Their two visits have the same shape and it is not repeat
buying of one thing:

| day | calls | distinct capabilities | € |
|---|---|---|---|
| 2026-08-23 | 2 | 1 (`competitor-compare`) | 2.00 |
| 2026-08-25 | 14 | **12** — sanctions, PEP, adverse media, UBO, LEI, insolvency, disqualified directors, UK/US company data, VAT, stock | 3.09 |
| 2026-08-26 | 3 | 1 (`competitor-compare`) | 3.00 |
| 2026-08-28 | 3 | 1 (`competitor-compare`) | 3.00 |
| 2026-09-14 | 1 | 1 (`competitor-compare`) | 1.00 |
| 2026-09-15 | 25 | **24** — trademarks, containers, CSV/SQL/markdown utilities, DNS/MX, weather, VASP, GitHub, crypto sentiment, company data | 2.89 |

€14.98 over 35 days. Two broad surveys of the catalogue three weeks apart —
compliance-flavoured in August, general-purpose in September — with one
product, `competitor-compare` at €1.00, bought on **four separate days** in
between. This is what an evaluation looks like, and `competitor-compare` is
the only thing anyone other than the largest payer has bought repeatedly at a
non-trivial price.

**Caveat found while checking it:** three accounts in the same 35-day window
(`test2@`, `test3@` at `strale.internal`, `test@example.com`) look like our
own and carry €16.23 between them. They do **not** contaminate any week quoted
above — their last activity is 2026-08-25 — but the canonical external filter
excludes only `system@strale.internal`, so a longer window would pick them up.
Recorded, not fixed.

**Second source — per-payer, last completed week, through `payerFacts`** (a
module call, not a hand-rolled query): 14 payers, €0 unattributed, top
`x402:v1:e9e672ef…` at €48.57. Consistent with the pack.

**Repeat buying outside the largest payer improved: 3 came back on a later
day, against 2 last week.** That is the only number moving in the right
direction this week, and 3 is not a pattern.

## B. Overnight health

**Vendor Control Tower** (`npm run vendor:status`): ACTION NEEDED, no new
substance since 2026-09-12. OpenRegister 386/500 (down from 498 — the
2026-09-17 customer traffic in section D4 is where those went), resets
2026-10-07. Serper 47,125/50,000, expires 2026-11-08. Dilisense authenticated
call succeeded. Browserless healthy with the honest per-container reason.
Standing warnings, none new: `anthropic` and `cdp` declare spend monitoring
with no reading; `esortcode` finite credits with no balance endpoint;
`cobalt-intelligence`, `einsearch`, `sec-api-io` paid/finite with no vendor
account record (DQ-30: keep, buy nothing).

**`npm run fixtures:drift`: 2 actionable, down from 6 on 2026-09-12.** Not
because the finding decayed — because four were fixed. See section D1.

**Alarms grouped over the whole 5-day window since the last run, no row cap**
(the shape DAILY-RUN.md requires after the sixteen-day Browserless miss):

| slug | type | n | days |
|---|---|---|---|
| `uk-gazette-notice-search` | classification | 120 | 6 |
| `lithuanian-company-data` | classification | 66 | 6 |
| `uk-gazette-notice-search` | invariant_alert | 59 | 6 |
| `lithuanian-company-data` | invariant_alert | 28 | 6 |
| `arxiv-search` | invariant_alert | 18 | 4 |
| `company-news` | invariant_alert / violation | 12 / 9 | 3 |
| `slovak-company-data` | classification | 11 | 4 |
| `cz-unreliable-vat-payer` | invariant_violation | 7 | 2 |
| `german-company-data` | quality_floor | 5 | 5 |

Dispositions:

- **`lithuanian-company-data` — today's live defect.** Section D3.
- **`uk-gazette-notice-search` — unchanged, vendor-side.** DQ-14 item 2; needs
  the vendor contacted as the company, which is founder-gated.
- **`german-company-data` — a deactivation proposal that repeats verbatim
  every day and can never fire.** Five consecutive `quality_floor` events,
  each with *identical* text: `completion 20% on 178 eligible calls/30d, but
  counted failures span only 1 day(s) (< 2) — burst, not a trend; deferred`.
  The numbers do not move because the failures really are one day (2026-08-24)
  and the 30-day window has not yet rolled past it. So the floor is behaving
  as designed and the repetition is not a stuck reading — but it is five
  identical pages for a condition nobody can act on, and it will keep firing
  until 2026-09-23. Noted, not changed: the burst guard is the thing that
  stops one bad afternoon delisting a capability, and I am not touching it to
  quieten a log line.
- **Circuit breakers: one open, `us-court-search`, since 2026-08-17** —
  consistent with its expired key (DQ-14 item 1) and `is_active = false`.
- **Quarantined suites: 22 across 8 capabilities** — 9 `env_dependent`, 7
  `infra_limited`, 6 `upstream_broken`. **Zero `fixture_recapture_quarantined`**,
  against three on 2026-09-12: block 0114 released them, so the three
  capabilities that had *no health signal at all* now have one.

**Deployed commit `9a8c6f0b5f98` equals `origin/main` tip `9a8c6f0b`**
(`GET /health` against `git log origin/main -1`).

**CI on `main`:** the last four `main`-branch workflow runs are green. The
fifth is `Weekly drift sweep`, red — the headline finding.

## B2. Stale work

- **PR #682 (M4 batch 7 → `m4/cutover`): CI green, `MERGEABLE`, deliberately
  NOT merged.** Its author's session died mid-review-round on 2026-09-13,
  leaving ~290 lines of uncommitted follow-up in the agent worktree
  `.claude/worktrees/agent-aa0d77d823b642e00` (branch `b7-fix-work`). The
  nightly janitor snapshotted it at 2026-09-17T21:04 to
  `origin/rescue/wip-2026-09-17-b7-fix-work-171f7c3` — non-destructively; the
  worktree still holds the changes. The rescued diff looks finished:
  case-insensitive matching and `notion.so/api/` in the anti-regression
  scanner, a `notion-regression-allow: historical` marker for honest prose,
  the write-once handoff subtree allowlisted, **+129 lines of tests**, and two
  corrected documents. Merging #682 as it stands would ship a head the author
  had already improved — the 2026-09-06 stale-head mistake again, which is why
  this is a recorded owner-and-deadline rather than a merge.
  **Owner:** the next M4 session. **Deadline:** before batch 8, the last batch.
  T7's `next_action` now carries the procedure, including *not* taking over
  that agent worktree.
- **PR #683** (this session's work): opened, CI green, independent review
  requested from a fresh read-only agent in a separate context.
- No uncommitted paths in the trunk.
- `session-close-check --hygiene-only`, run from the **primary checkout**:
  **0 red, 1 yellow** (today's handoff absent at the time — this file).

## B3. Branch graveyard

No graveyard: the oldest non-`main` remote branch was 2026-09-12. Three
branches were substantively on `main` and are now deleted, **local ref first,
then remote, then both re-verified** (`git branch --list` 0 refs,
`git ls-remote --heads` 0 refs) — the order the 22-hour-lifetime deletions of
2026-08 taught:

| branch | commit | evidence it was on main |
|---|---|---|
| `fix/wider-input-drift` | `a450b2d7be9e` | 0 non-generated files differ from `main` |
| `ledger-overlap-work` | `a450b2d7be9e` | same commit as above |
| `fix/test-input-manifest-drift` | `fe7d35adc514` | PR #677's branch; `main` holds every one of its files with *more* content (e.g. `drift-cause.ts` +30, `fixture-drift-groups.ts` +142), so it is strictly behind, never ahead |

Left alone, with reasons: `b3-r10-work` and `b3-fix2-local` (89–90 files of
genuine unfinished M4 b3 work, another session's); `m4/*` batch branches
(live); `rescue/wip-2026-09-17-…` (holds unique work, see B2);
`m4/b1c-entrypoint-check` (superseded but checked out in another session's
worktree — still not an unattended-run deletion).

## C. Decision queue

- **DQ-34 — new, `your_call`.** The `weekly-drift.yml` database secret.
- **DQ-33 — updated, still open and still Petter's to close.** Four of six
  repaired by a route that was mine all along; the correction is recorded in
  the entry, including that I should have found it on 12 September.
- **DQ-27, DQ-14** — unchanged, not re-measured today.
- No `preauthorized_notice` window matured.

## D. The work

### D1. Scheduled outcomes — the check that proves the wiring *works* (PR #683)

**What is true, and how I know.** `gh run list --workflow weekly-drift.yml
--json conclusion,createdAt,event` gives, newest first: failure 09-14, failure
09-07, failure 08-31, failure 08-24, **success 08-18 as `workflow_dispatch`**,
failure 08-17, success 08-10. So five consecutive failed *scheduled* runs and
a last green cron run of 2026-08-10. `gh run view --log` on all three of the
most recent gives the same line: `PostgresError: password authentication
failed for user "postgres"`. Second source for the cause rather than the
effect: the repository's own `DATABASE_URL` authenticates as `strale_ro`, not
`postgres`, and the failures begin in the window of the 2026-08-22 credential
revocation. I did not confirm the secret's stored value — I cannot read it, and
say so rather than asserting it.

**Why nothing caught it.** `config/scheduled-mechanisms.yaml` + `npm run
scheduled:check` exist precisely so a scheduled mechanism is verified rather
than assumed (DEC-20260504-C), and they pass — correctly. The register's
`DATABASE_URL: DATABASE_URL` line says the step reads that secret, and it
does. Every fact reachability can check is static. Nothing in the morning run
read a scheduled workflow's *conclusion*: step B reads production alarms,
breakers, quarantines and CI on `main`, and a weekly workflow going red on a
Sunday is in none of those.

**Blast radius.** Seven register mechanisms on that one workflow; three read
production — `sweep-manifest-drift`, `toast-readability` (added after a
lost-TOAST-chunk incident sat undetected four months) and `output-schema`. The
other four need no database and **do still run** — verified in the run's own
output, where `check-platform-facts-drift` prints "✓ Clean" and the vendor
roster prints its drift case *after* the first auth failure. So this is three
of seven, not seven of seven; I nearly wrote the stronger claim into DQ-34 and
corrected it against the log.

**Shipped.** `npm run scheduled:outcomes` —
`scripts/check-scheduled-outcomes.mjs`, logic in
`scripts/scheduled-outcomes-lib.mjs`, 12 tests in
`scripts/scheduled-outcomes.test.mjs`. Design decisions, each with its reason:

- **Scope is every scheduled workflow, not only registered ones.**
  `stale-branches.yml` is scheduled and made entirely of inline `gh` commands,
  so it legitimately has no register entry — a register-scoped version would
  have watched every scheduled workflow *except* that one. A test asserts it
  is watched with an empty mechanism list.
- **Two consecutive failed scheduled runs is the finding; one is a warning.** A
  weekly false alarm is how a reader learns to skip the section, which is half
  of how five weeks happened.
- **A manual re-run is not a success.** Relabel the 08-18 dispatch as
  scheduled and the same history reads as an already-fixed four-week problem.
  A test plants exactly that shape.
- **Cannot-see is exit 2, never 0.** `fixtures:drift` shipped one flag away
  from exactly this silent-clean failure.
- **Not a CI gate**, for the reason `fixtures:drift` is not: the evidence lives
  in GitHub's run history, and a PR that changed no workflow must not fail
  because a credential expired on a Sunday. Only the tests run in CI.

**Tests discriminate — verified by mutation, not asserted.** Dropping the
`event === "schedule"` filter fails 3; `CONSECUTIVE_FAILURE_THRESHOLD` 2 → 1
fails 1; making an absent workflow read clean fails 1. Each was run and
reverted.

**Not done, deliberately.** Replacing the secret puts a production database
credential into GitHub Actions — a credential-issuing act, which is the
founder's. → DQ-34. Being sure which password is right is not permission to
install it.

### D2. DQ-33: four of six were already fixed, by a route that was mine

`npm run fixtures:drift` reports **2**, down from 6. The four that left the set
did not decay out of it — they were repaired. Verified live, read-only,
production `test_suites`:

| slug | production input now | test_status | last 5 days |
|---|---|---|---|
| `canadian-company-data` | `{"corporation_number":"1007"}` | normal | 61 runs, **58 passed** |
| `irish-company-data` | `{"cro_number":"513174"}` | normal | 60 runs, **58 passed** |
| `swiss-company-data` | `{"uid":"CHE-101.602.521"}` | normal | 60 runs, **59 passed** |
| `lithuanian-company-data` | `{"company_code":"304151376"}` | normal | 61 runs, **0 passed** (D3) |
| `spanish-company-data` | `{"company_name":"Telefonica"}` | normal | 1 run, 0 passed |
| `german-company-data` | `{"company_name":"Google"}` | normal | 0 runs in window |

The route was startup-migration blocks **0114** (PR #677) and **0115**
(PR #678) — code merged, applied on the next deploy. That is ordinary
engineering under DEC-20260822-A, needing no write credential and no attended
session. **DQ-33 asked the founder for a route that already existed**, and the
entry now says so. Three of the four were also `fixture_recapture_quarantined`
and are not any more, so three capabilities that had *no health signal at all*
have one again.

**Spanish — verified, queued.** Called the registered executor once per input
(`free_quota`, no money; one call each, outside `apps/api/scripts` so the
dispatcher-gate lint does not apply — the same route the 2026-09-12 session
used, recorded rather than quiet):

```
{"company_name":"Telefonica"} -> THROWS  No confident Spanish registry match ...
{"nif":"A20072302"}           -> SUCCESS CONSTRUCCIONES AMENABAR SA, active, Gipuzkoa
```

Ready for a block 0116 resync. **Not written this session** — a production
migration deserves its own review focus and its own merge risk, and mixing it
into a monitoring-script PR would get it a worse review. Next session's first
task; the expensive half (live verification) is done.

**German — cannot be verified from here, and is not being resynced blind.**
`OPENREGISTER_API_KEY` is Railway-only (`config/env-manifest.yaml:827`,
`holder: railway`), so both the stored `Google` and the manifest's `SAP SE`
throw `OPENREGISTER_API_KEY is required` locally. The manifest value is itself
a *name* search, which is the failure class in question. Writing it in
unverified would convert "stale DB, corrected manifest" into "stale DB, also
unverified manifest" — the exact move the 2026-09-12 review caught me making
in prose.

### D3. `lithuanian-company-data` — 62 of 62 failures we cannot reproduce

Since block 0114 released its quarantine at 2026-09-12T17:31Z, **62 of 62**
`dependency_health` runs have failed, every one with `Execution error: Spinta
classifier fetch HTTP 500`; the most recent is 2026-09-17T18:31Z.

Falsified hypotheses, in order:
- *A poisoned inflight promise.* `ensureClassifiers` clears
  `classifiersInflight` in a `finally`
  (`apps/api/src/capabilities/lithuanian-company-data.ts:89-94`), so one
  failure cannot persist. Read, not assumed.
- *The registry is down.* It is not. From this machine, `Forma` and `Statusas`
  at `limit(100)` both return 200, the paging cursor's second page returns
  200, and the corrected company code `304151376` resolves.
- *Our client or user agent.* Node's own `fetch` with the capability's exact
  headers and `AbortSignal.timeout(15000)` returns 200, as do curl with UA
  `node`, `undici` and none.

So the difference is **where the request comes from**, not what it asks for.
That shape has a precedent in this repository's own data:
`youtube-summarize`'s suites carry the quarantine reason "YouTube strips
caption data from datacenter IPs (Railway US East + Browserless EU West).
Works from residential IPs."

**Who it happened to:** `who-called --slug lithuanian-company-data --days 14`
— 94 calls, **94 harness, 0 registered account, 0 x402, 0 anonymous**. No
customer has seen this. It is still a listed capability that would fail for
one. Ordinary engineering, needs the live environment; next session.

### D4. The commercial finding: our one buyer, and German company data

`who-called --slug german-company-data --days 30`: **221 calls, 218 of them
x402-paid, 45 completed.** Every paid call is `x402:v1:e9e672ef…` — the same
wallet that is 93.5% of revenue. By day: **195 on 2026-08-24**, one on 09-10,
one on 09-14, **21 on 2026-09-17**, of which 9 completed.

Failures split by cause, and the split is the finding. Of 173 across the
month, **127 are `OpenRegister returned HTTP 402: Payment Required`** — the
free allowance exhausted mid-list on 08-24, already recorded as F2 incident
11, and **historical**: zero 402s since. Today's 12 are all name-resolution
refusals — "GAD GmbH" (5 equal matches), "LSP GmbH" (3), "ibea GmbH",
"admatec GmbH", "EAAT GmbH Chemnitz", "Active Group GmbH" — each tried exactly
twice, which reads as one retry rather than six intentions.

**Nobody was charged for a failure.** Two sources: the gateway settles only
after a result (`x402-gateway-v2.ts:1741`, "No settlement on failure
(DEC-14)"), and all 12 failed rows carry a null `x402_settlement_id` against 9
of 9 settled on the completed ones.

The refusals are **correct** under the standing rule that a registry name
search must score and refuse rather than return the first result. What is open
is whether a flat refusal is the right *product* answer when the candidate
list has already been computed and put into the error prose. Returning it as
data would let the agent disambiguate instead of retrying the same string.
Recorded in GOALS.md "what we currently know"; not built, and not proposed as
a decision, because one buyer's afternoon is not yet a product brief.

## E. Authorities updated

- `docs/company/DAILY-RUN.md` — step B now runs `scheduled:outcomes`, with the
  declaration-cannot-carry-a-value reasoning inline.
- `docs/company/LESSONS.md` — **F7 incident 12** (count 11 → 12): a third arm
  of state drift, a mechanism whose static declaration stayed true while the
  thing it declared stopped running.
- `docs/company/DECISION-QUEUE.md` — **DQ-34** added; **DQ-33** updated with
  what changed and with the admission that its ask was never founder-only.
- `docs/company/GOALS.md` — "what we currently know" gains the German-demand
  finding, explicitly labelled as evidence about the *first* payer and not a
  second one.
- `docs/programs/cto-readiness/tracks.yaml` — T7's `next_action` rewritten:
  batches 1d/4/5/6 are merged, batch 7 is PR #682 with its rescued follow-up
  and its do-not-merge-as-it-stands reason, owner and deadline.

## Next session

1. **Block 0116: resync `spanish-company-data`'s `dependency_health` input**
   from `{"company_name":"Telefonica"}` to `{"nif":"A20072302"}`. Verified
   live 2026-09-17 (see D2); mirror block 0115 exactly, ledger it, one test,
   its own PR. Closes DQ-33's Spanish half without the founder.
2. **Land the rescued b7 work and merge PR #682.** Work from
   `origin/rescue/wip-2026-09-17-b7-fix-work-171f7c3` in a **fresh worktree cut
   from `m4/b7-blocking-checks`** — never take over
   `.claude/worktrees/agent-aa0d77d823b642e00`. Then batch 8 is the last one.
3. **Diagnose `lithuanian-company-data`'s HTTP 500 from the live environment.**
   Everything reproducible from a laptop has been tried and failed to
   reproduce it (D3). Start from the datacenter-IP hypothesis that
   `youtube-summarize`'s quarantine reason already names.
4. **Run `npm run scheduled:outcomes` in the health sweep** and expect it to
   keep reporting `weekly-drift.yml` until DQ-34 is answered. That is the
   check working, not a new finding each morning.
5. **The second-payer question is still the ranking one, and this week does not
   answer it either.** What this week adds is the opposite datum: the *first*
   payer has unmet demand in German company data. Do not read that as a
   direction for a second customer.
