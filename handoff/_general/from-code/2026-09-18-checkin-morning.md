# 2026-09-18 — morning operating session

Intent: run the 2026-09-18 morning operating session under DAILY-RUN.md —
measure the business, dispose of overnight health and stale work, do the
highest-leverage work against GOALS.md, and hand back the two artifacts.

Proactivity level 5. Everything below is second-sourced or marked
`unverified:`. **Previous morning run: 2026-09-17** (its record's
measurements were taken around 19:30Z), so every health window below starts
at **2026-09-17T19:30Z** unless it says otherwise — about eleven hours, not a
day.

---

## Headline

1. **DQ-33's Spanish half is fixed by the deploy-time route, pending merge.**
   Startup-migration block 0116 rewrites the one production
   `spanish-company-data` `dependency_health` input from
   `{"company_name":"Telefonica"}` (correctly refused as an ambiguous name) to
   the manifest's `{"nif":"A20072302"}`. Verified live a second time this
   morning, one production row matches, five mutations all caught — receipt
   `archive/receipts/2026-09-18-test-run-block-0116-spanish-resync.json`.
   What remains of DQ-33 is German only.
2. **`fixtures:drift` told its reader the wrong remedy.** Its closing text
   said a fix needs "an authorised attended session (DQ-27)" and that
   `onboard.ts --backfill` will not do it. Both false by now: blocks
   0114–0116 are the in-authority route, and `onboard.ts --backfill
   --discover` *does* resync `dependency_health` since PR #677 (but only as a
   direct production write). A tool that points every morning reader at the
   founder for something that is ordinary engineering is how DQ-33 was raised
   in the first place. Corrected in the same PR.
3. **No commercial change worth a headline.** One day since the last run.
   The only buyer since then is the largest one (€2.65, 38 calls).
4. **Overnight: one new quarantine, and it is the world, not us.**
   `irish-company-data`'s `dependency_health` was escalated to
   `upstream_broken` at 00:07Z on 5 × `fetch failed`. The CRO open-data host
   does not answer from this machine either (three URLs, 20 s timeouts), so
   the outage is the registry's. `upstream-tracker.ts` releases it after two
   passes in 48 h. No customer called it in 14 days.

---

## A. Business measurement

`ceo-dashboard.ts` and `commercial-brief.ts`, production read-only, from the
batch worktree at `origin/main` tip `fc276108`.

```
2026-09-14     €39.31    657 calls  [in progress, day 5 of 7 — NOT comparable]
2026-09-07     €51.97   1082 calls
2026-08-31     €58.77   1168 calls
2026-08-24     €73.03   1295 calls
2026-08-17     €66.31   1000 calls
2026-08-10     €39.24    620 calls
```

**Pace, stated because the brief uses it.** The week in progress was €36.86
at yesterday's ~19:30Z reading (four days) and €39.31 this morning, roughly
€9/day; carried over the weekend that lands near or slightly above last
week's €51.97, which would end the two-week fall. Weekend days are not
measured separately here, so the brief says it is not calling it.

Completed weeks unchanged from yesterday (same numbers, so the instrument is
stable across runs): `growth()` **falling**, 14 payers, top share **93.5%**
(€48.57 vs €3.40), 4 bought on more than one day, new-vs-returning still
`unavailable`. Week in progress, day 5: 8 payers, largest share 87.7%
(€34.49 vs €4.82) — no conclusion drawn. Dashboard: revenue €52.31 rolling
7d, buyers 34 (lower bound), identity 100%, spend €2.12. Quiet list
unchanged: 6, largest €6.64 at 11 d.

**Second source — per payer through `payerFacts`** (module call, window
2026-09-17T19:30Z → now): exactly one payer, `x402:v1:e9e672ef…`, €2.65 over
38 calls, €0 unattributed. Over the last three days the same module shows
that wallet at €23.49 and six others at €0.02–€0.55 each. The account buyer
the last brief called an evaluation has not bought since 2026-09-16 (two
refused price-comparison calls); two days is inside their normal gap and is
not a finding.

**German demand, overnight.** `who-called --slug german-company-data --days
1`: 25 paid calls, 12 completed, 13 failed — against yesterday evening's 21 /
9 / 12, so **four calls since, three completed, one failed**. The failure is
new in kind: `No German company with HRB 28249 at "Amtsgericht Chemnitz"` — a
lookup **by register number**, at the same court town as the refused name
"EAAT GmbH Chemnitz". `unverified:` that the buyer went and found the register
number after our name refusal; the order of the calls is consistent with it
but I have one source for it and am not acting on it. If true, it is the
buyer doing the disambiguation we could have handed back — the product gap
GOALS.md recorded yesterday — and then hitting a coverage gap behind it.

## B. Overnight health

**Vendor Control Tower**: ACTION NEEDED, no new substance. OpenRegister
**363/500** (386 yesterday evening — the German calls above), resets
2026-10-07. Serper 47,125/50,000, expires 2026-11-08. Dilisense authenticated
call succeeded. Same six standing warnings as yesterday (`anthropic`/`cdp`
spend monitoring with no reading; `esortcode` no balance endpoint;
`cobalt-intelligence`, `einsearch`, `sec-api-io` without vendor records —
DQ-30: keep, buy nothing).

**`npm run scheduled:outcomes`**: exit 1, `weekly-drift.yml` five consecutive
failed scheduled runs, last green scheduled run 2026-08-10. Expected and
already DQ-34; this is the check working, not a new finding. Next scheduled
run is Sunday.

**`npm run fixtures:drift`**: 2 actionable, same two as yesterday —
`spanish-company-data` (fixed by D1) and `german-company-data` (unverifiable
from here).

**Alarms grouped, whole window since 2026-09-17T19:30Z, no row cap:**

| slug | type | n |
|---|---|---|
| (platform) | invariant_alert | 24 |
| `uk-gazette-notice-search` | classification / invariant_alert / auto_remediation | 11 / 6 / 1 |
| `company-news` | invariant_violation | 5 |
| `lithuanian-company-data` | classification / invariant_alert | 5 / 3 |
| `irish-company-data` | classification / upstream_escalation | 3 / 1 |
| `exchange-rate` | classification / regression_detected | 1 / 1 |
| `spanish-company-data` | classification / regression_detected | 1 / 1 |
| `vat-validate` | classification | 1 |

Dispositions:

- **`irish-company-data` → `upstream_broken`.** Headline 4. Second source:
  `who-called --days 14` shows 93 calls, all harness; its 5 × `fetch failed`
  match the classification events; and the CRO host times out from here.
- **`company-news` — a Tier-1 "correctness 0%" every two hours, explained.**
  It recurred on three days in yesterday's grouping with no disposition, so
  it is a finding until explained, and this is the explanation. The failing
  known-answer test reads `Execution error: fetch failed`. GDELT throttles:
  a single request from this machine this morning got **HTTP 429 after 12.5
  s**, and `who-called --days 14` shows 10 × `GDELT API returned HTTP 429`
  and 8 × `fetch failed` among 44 calls, **all harness, no customer**. The
  429s are already excused by the correctness check (`upstream`); the bare
  `fetch failed` is not, **deliberately** — `transaction-failure-taxonomy.ts`
  returns `unclassified` for it, and `invariant-checker.ts` keeps
  `unclassified` in the denominator, pinned by the test "treats a missing
  reason as attributable, not as a free pass". So this is the design
  refusing to excuse a failure it cannot attribute, on a capability whose
  upstream throttles us. Not changed: widening what counts as environmental
  is the exact move F1's investigation warns against, and doing it to quieten
  one capability's alarm is bending the substrate. What would be right is
  capturing the `cause` undici hides behind `fetch failed` so the string
  carries its own attribution; recorded as a candidate, not started.
- **`lithuanian-company-data`** — 15 of 15 overnight `dependency_health` runs
  failed on `Spinta classifier fetch HTTP 500`, same as yesterday's 62/62.
  Unchanged diagnosis: does not reproduce from here; needs the live
  environment.
- **`uk-gazette-notice-search`** — unchanged, vendor-side HTTP 500 (DQ-14 item
  2). The harness rolled its stale `date_from` forward once (`auto_remediation`
  02:56Z); that did not change the outcome, as expected for a vendor 500.
- **`exchange-rate`** — one `ECB API returned HTTP 500 for USD` broke a 10/10
  streak. `who-called --days 14`: 29 paid calls, 21 completed; the 8 failures
  are 6 × unsupported currency (AZN, XXX, ZZZ — correct 404 refusals) and 2 ×
  timeout. One vendor 500 is not a trend; watch only.
- **`spanish-company-data` regression** — the known Telefonica refusal. D1.
- **Platform invariant alerts (24)** — the same standing set as recent days:
  `adverse-media-check` fixtures, five `cz-*` null profile fields, the
  `danish-company-data` lying-breaker shape, and "29 dependency_health suites
  differ from their manifest and never pass in 30 days". The 29 is the wider
  population the `fixtures:drift` tool narrows to its 2 actionable by
  requiring a run in the window; not a new number.
- **Breakers:** one open, `us-court-search`, since 2026-08-17 (expired key,
  DQ-14 item 1, `is_active = false`). Unchanged.
- **Quarantined suites:** 38 non-`normal` rows across 12 capabilities — 9
  `env_dependent`, 7 `infra_limited`, 22 `upstream_broken`. Yesterday's record
  said "22 across 8 … 6 `upstream_broken`"; the difference is **not**
  overnight change — 15 of today's 22 `upstream_broken` rows belong to
  `amazon-price`, `hong-kong-company-data` and `indian-company-data` (5
  each), deactivated in March with reason "no viable free data source". The
  other 7 are yesterday's 6 plus Irish, which reconciles exactly;
  `unverified:` that yesterday's query excluded the deactivated three rather
  than something else that happens to give the same number. The only row
  whose `updated_at` falls in this window is Irish. Stating the population so
  tomorrow's count is comparable.

**Deployed commit `fc2761080654` equals `origin/main` tip `fc276108`**
(`GET /health` against `git log origin/main -1`).

## B2. Stale work

- **PR #682 (M4 batch 7 → `m4/cutover`)** — unchanged since 2026-09-13, CI
  green, `MERGEABLE`, **still deliberately not merged**, for yesterday's
  reason: its author's improved follow-up exists only in
  `origin/rescue/wip-2026-09-17-b7-fix-work-171f7c3` and the agent worktree
  `.claude/worktrees/agent-aa0d77d823b642e00`. Owner the next M4 session,
  deadline before batch 8 — carried in T7's `next_action`, not changed today.
- **This session's PR** — see D1 and F.
- No uncommitted paths in the trunk. `session-close-check --hygiene-only`
  from the **primary checkout**: 0 red, 1 yellow (today's handoff, this file,
  not yet written at the time).

## B3. Branch graveyard

No graveyard — the oldest non-`main` remote branch is 2026-09-12. One branch
deleted, local ref first, then remote, both re-verified at zero
(`git branch --list`, `git ls-remote --heads`):

| branch | commit | evidence it was on main |
|---|---|---|
| `review-pr678` | `c3309acd4b50` | PR #678's pre-squash head (#678 `MERGED` 2026-09-12T23:54Z); every line it holds that `main` lacks is an *older* version of text `main` has since extended (ledger notes without M056/M057, LESSONS F7 at count 11, a superseded T7 `next_action`) |

Left alone, same reasons as yesterday: `b3-r10-work`, `b3-fix2-local`, the
`m4/*` batch branches, `rescue/wip-2026-09-17-…`, and
`m4/b1c-entrypoint-check` (checked out in another session's worktree).

## C. Decision queue

- **DQ-33** — updated: Spanish fixed by block 0116 pending deploy; German
  unchanged; the Irish overnight quarantine explained so it is not read as
  the old value returning. Stays open for Petter to close.
- **DQ-34, DQ-27, DQ-14** — unchanged.
- No `preauthorized_notice` window matured.

## D. The work

### D1. Block 0116 — resync `spanish-company-data`'s `dependency_health` input

**What is true, and how I know.** Registered executor, one call per input,
`free_quota` (200 vendor requests/day, 10% for tests), 2026-09-18:

```
{"company_name":"Telefonica"} -> THROWS  No confident Spanish registry match ...
{"nif":"A20072302"}           -> SUCCESS CONSTRUCCIONES AMENABAR SA, active, openmercantil.es
```

Identical to 2026-09-17's result, so two days, two runs. Production,
read-only: exactly **one** `test_suites` row in the whole table holds
`{"company_name":"Telefonica"}` — `f7f09533-…`, `dependency_health`,
`normal`, `live`, not quarantined. The other Spanish suites already hold the
NIF (`known_answer`, `schema_check`) or a deliberate bad input.

**What shipped.** `runMigration0116_resyncSpanishCompanyDataDependencyHealth`,
a line-for-line mirror of block 0115: ledger guard, exact-stale-literal
predicate (self-limiting on a second boot), baseline cleared so the next run
captures fresh, one `auto_fix` event per affected row. Ledger row **M059**,
and M059 added to the 13 `known_overlaps` entries 0115 is already in, each
with its disjointness argument (M040 cannot reach it: Spanish calls
openmercantil.es, which has no vendor-tower account; M054 needs
`test_mode='fixture'`; M050/M051/M056/M057/M058 are disjoint by test type or
slug). `npm run migrations:check` passes.

**Deploy-mechanism dependency (DEC-20260504-C).** The block runs only if it is
in the `BLOCKS` array that `runStartupMigrations()` iterates on boot — it is,
and the registration-order test fails if it is removed (mutation M5). Post-deploy
verification is a production read: the suite's `input` equals the NIF and a
`startup_migration_ledger` row `0116_…` exists with `rows_affected = 1`.
**That read is the next session's first check** unless this session sees the
deploy land (see F).

**Bulk-operation protocol (DEC-20260504-B).** One suite, already on its
schedule, starts passing. It does not change run frequency, so it spends no
more of the vendor allowance than it does now. Not a resumption event.

**Tests discriminate.** Five mutations, all caught — receipt
`archive/receipts/2026-09-18-test-run-block-0116-spanish-resync.json`. One
honest note in it: my first attempt at the ledger-guard mutation edited a
*different* block (the string index matched the registration list first), so
it "survived" for the wrong reason; redone against `const BLOCK = "0116_"`,
caught.

### D2. `fixtures:drift` — the remedy text now names the route that works

`apps/api/scripts/fixture-drift.ts`. Old text: needs "an authorised attended
session (see DECISION-QUEUE.md DQ-27)"; "`onboard.ts --backfill` will NOT do
it". New text: verify the manifest value live, then a ledgered startup
migration block (0114–0116 are the pattern), which applies on deploy through
the normal PR gates; `onboard.ts --backfill --discover` also resyncs the row
but only as a direct production write, so do not reach for it. Why it
matters: the tool is read every morning, and it was the thing that routed
DQ-33 to the founder on 2026-09-12.

## E. Authorities updated

- `docs/company/DECISION-QUEUE.md` — DQ-33 update (above).
- GOALS.md not changed: the HRB datum is one source and `unverified:`.
- LESSONS.md not changed: nothing this run is a new incident. The
  `company-news` alarm is designed behaviour, explained; the
  `fixtures:drift` text is the tail of DQ-33's already-logged F7 incident 11
  and yesterday's correction of it.

## F. Independent review

A fresh read-only agent in a separate context (the 2026-09-07 policy
route; same provider), in its own worktree with its own `npm ci`. Verdict
**PASS**, no must-fix, no should-fix. It independently:

- compared 0116 with 0115 line by line;
- confirmed the manifest value (`manifests/spanish-company-data.yaml:157`) and
  that the quoted refusal is a live error path in the executor;
- confirmed the jsonb equality has no key-order trap (single-key object);
- ran `check-migration-ledger.mjs` on the branch (59 blocks, passes) and
  checked every disjointness claim against source — notably M040 maps
  `openregister` only to `german-company-data`, and Spanish's vendor id is
  `openmercantil`;
- confirmed the new `fixtures:drift` text is true (`hasKnownAnswerUpdate =
  flags.discover || flags.fix` gates the resync) and that nothing depends on
  the old wording;
- ran the tests, reproduced the receipt's `test_mode` mutation, and tried two
  of its own — `event_type` `auto_fix` → `manual_fix`, and the predicate's
  `test_type` → `known_answer` — **both caught**.

Two notes, both about what it could not reach, not defects: it had no
database credential, so "exactly one production row" rests on my read-only
query alone; and it made no live registry call, so the Telefonica/NIF results
rest on my two days of calls. Both are recorded as single-source here for that
reason.

## G. Shipped and verified in production

PR #684 merged as `bbc3a3cc` after CI passed (`check`, `integration-db`,
`classify`); `git diff` of the branch tip `c63ec29c` against `origin/main`
after the merge is empty, so the merge carried the head that was reviewed.
`GET /health` served `bbc3a3ccfda4`. Production, read-only, after deploy:

- `startup_migration_ledger`: `0116_resyncSpanishCompanyDataDependencyHealth`,
  applied 2026-09-18T06:38:24Z, `rows_affected = 1`;
- the suite `f7f09533-…` now holds `{"nif": "A20072302"}`, `test_mode =
  live`, baseline cleared, `updated_at` the same instant;
- one `auto_fix` / `resynced_stale_dependency_health_input` event.

The deploy mechanism did what the PR said it would (DEC-20260504-C). What is
not yet observed is a *passing* run: the suite is schedule tier C.

## Next session

1. **Confirm the Spanish `dependency_health` suite now passes** — its first
   runs after 2026-09-18T06:38Z. If it does not, the corrected value is
   wrong in production conditions, which two days of laptop calls would not
   have shown.
2. **Land the rescued b7 work and merge PR #682** — unchanged from yesterday:
   fresh worktree from `m4/b7-blocking-checks`, work from
   `origin/rescue/wip-2026-09-17-b7-fix-work-171f7c3`, never take over the
   agent worktree. Then batch 8.
3. **`lithuanian-company-data`'s HTTP 500** from the live environment,
   starting from the datacenter-IP hypothesis.
4. **Candidate, not started:** make a bare `fetch failed` carry its undici
   `cause` (ECONNRESET / ETIMEDOUT / ENOTFOUND) in the error string at the
   shared fetch layer, so the taxonomy can attribute it on evidence instead of
   leaving it `unclassified`. That would retire `company-news`'s two-hourly
   false Tier-1 without widening the environmental set. Measure first how many
   capabilities' failures are bare `fetch failed` today.
5. The second-payer question is still the ranking one; nothing today moves it.
