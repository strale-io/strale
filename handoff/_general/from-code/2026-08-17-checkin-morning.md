# Intent: morning check-in — read the business, sweep stale work, and fix whatever the evidence says is actually broken

Session 2026-08-17 morning, under the Operating Charter (DEC-20260815-A).

## Headline numbers

| | |
|---|---|
| Revenue (7d, canonical external filter) | **€36.64** — and this is a rise, not a fall (see below) |
| Distinct paying identities (28d) | **5**, correctly labelled *estimated / lower bound* |
| Open circuit breakers | **0** |
| Quality-floor ticks | `decisions: 0, quarantined: []` on every tick since 2026-08-15 |
| CI on main | green |
| Deployed SHA | matched main's tip at every check |
| External spend | ~€4.92 of the €50/wk envelope |

**Revenue is up, and the way we have been reading it is wrong.** The rolling 7d
figure fell from the €45.58 baseline to €36.64 and looks like a 20% drop. It
isn't. Discrete weeks: w-0 €36.64, w-1 €29.98, w-2 €10.85, w-3 €37.73. And the
per-week rate rises monotonically as the window shortens — 90d €19.67, 60d
€20.82, 30d €27.95, 14d €33.31, 7d €36.64. At this volume a rolling window is
dominated by which individual days fall in or out of it. GOALS.md now says to
read week-over-week and not to quote the rolling figure as a trend.

**No overnight incident.** I initially read nine capabilities as newly
quarantined; that was wrong and I caught it by checking a second way.
`capabilities.updated_at` moves whenever a test touches the row, not when
visibility changes. Seven of the nine are `validating`/`probation` dark
launches that were never promoted. Every floor tick in the last three days
records `decisions: 0`.

## The real finding: the harness fails in *both* directions

Yesterday's session found the harness scoring capabilities 100% while real
customers failed 39–59%. Today's is the mirror image, and it had been running
for over a day.

Ten capabilities were emitting **`ALGORITHMIC CORRECTNESS VIOLATION — correctness
0%`** every ~36 minutes — roughly **400 Tier-1 alerts a day**. I called all ten
directly against production. **Every one answered correctly.**

What the invariant was counting as "wrong answers":

| capability | actual failure reason | what it really is |
|---|---|---|
| `swedish-company-data` | *"exhausted its daily test budget… Customer traffic is unaffected"* | our own throttle, saying so in the message |
| `us-court-search` | `CourtListener rejected the token (HTTP 403)` | an expired credential |
| `uk-gazette-notice-search` | `The Gazette API returned HTTP 500` | upstream |
| `company-news` | `GDELT API returned HTTP 429` | upstream |
| `page-speed-test` | `PageSpeed Insights returned HTTP 500` | upstream |
| `redirect-trace` | `operation was aborted due to timeout` | a deadline |

The premise in the code was *"pure algorithmic capabilities have zero
environmental variability, so correctness below 85% is definitionally a code
defect."* That is false. `transparency_tag = 'algorithmic'` describes how an
answer is **derived** — deterministically rather than by an LLM. It says nothing
about whether the capability makes a network call. `swedish-company-data` is
algorithmic and calls a Swedish registry.

Nothing was broken, so nothing cost money today. The cost is that the next real
breakage arrives into an alert stream everyone has learned to ignore.

## Shipped, merged, deployed and verified by effect

**PR #305 — the correctness floor stops blaming capabilities for the world.**
Environmental failures (`upstream`, `config`, `timeout`) now leave the
denominator entirely and are reported at Tier 2 under their own heading, so the
signal moves rather than disappearing. They are deliberately *not* scored as
passes — that would flatter a capability genuinely broken while its upstream is
also flaky. `caller_input` and `tos_policy` stay attributable, because a
known-answer fixture is *our* input and a bad one is ours to fix. Classification
reuses `lib/transaction-failure-taxonomy.ts` rather than growing a third
parallel list of error strings.

**PR #305 also carries block 0089 — DQ-4 finally executing.** DQ-4 recorded on
2026-08-15 that `us-court-search` had been switched off. Only `x402_enabled` was
ever cleared. Verified on production this morning: still `is_active`, still
`visible`, still on the public `/v1/capabilities` catalogue at €0.15, and
returning HTTP 500 to **every** caller for two days. Shipped as a startup
migration rather than a hand-edit to prod, idempotent via `WHERE is_active =
true`.

**Post-deploy verification (DEC-20260504-C), by effect and not by log line:**
- Prod `/health` = `4eae0bd` = main's tip.
- `us-court-search` row: `is_active=false, visible=false, x402_enabled=false`,
  carrying the reason string that exists only in block 0089.
- Public `/v1/capabilities`: 292 entries, `us-court-search` **absent**.
- First invariant tick after deploy: `uk-gazette-notice-search` and
  `company-news` now emit *"all N known-answer failure(s) were environmental"*
  at Tier 2. `swedish-company-data`, `us-court-search` and `page-speed-test`
  are **gone from the violation list entirely**.

**Tests (DEC-20260504-A): 20 new, discrimination proven both ways.** Every
failure string is copied verbatim from production `test_results.failure_reason`.
Stubbing `isEnvironmentalFailure` to `false` (the pre-fix state) fails 9 of 16;
reducing block 0089's UPDATE to `x402_enabled` only (the *actual* pre-fix
production state) fails the "off every surface" test. Full suite 1833 passed.

## What is still flagged, and is genuine

Seven capabilities still violate the floor, correctly:
`iso-country-lookup`, `skill-extract`, `company-id-detect`, `incoterms-explain`,
`dangerous-goods-classify`, `beneficial-ownership-lookup`, `name-parse` — all on
`guaranteed_field_missing` or `high_null_ratio`.

**These are fixture-contract bugs, not broken capabilities.** All seven return
correct, fully-populated answers in production. `iso-country-lookup` is the
worked example: the harness reports *"100% of declared fields returned null
(6/6): name, region, alpha_2, alpha_3, schengen, eu_member"*, and all six exist
and are populated — nested under `match`. The fixtures assert a flattened shape
against a nested response. **This is the next fixture-hygiene batch** and it is
the top item for the next session.

Two new names surfaced once the noise dropped: `barcode-lookup` 83% and
`vat-validate` 83%. Worth a look — they were previously invisible under the din.

## Stale-work sweep

- **Open PRs: 0.** #305 (the fix) and #306 (a rescued research note) both opened,
  CI-verified, merged and deploy-verified inside this session.
- **Branch graveyard: 120 → 110.**

**Correction to yesterday's handoff:** the nine branches DQ-8 reported as
deleted were never deleted on the remote. Confirmed two independent ways —
`git for-each-ref` after `--prune`, and `gh api repos/…/branches/<name>`
returning each one. I deleted them today and re-verified with the same two
instruments; all now 404. The graveyard had also *grown* to 120 because a
`rescue/stale-*` process preserves abandoned local work as remote branches (9 of
those exist).

`investigation/dk-phase-2-understand` held the one research note not already on
main — landed as #306, then the branch retired. `test/openapi-com-sandbox-2026-05-06`
kept: real vendor client code, blocked on the Openapi addendum.

## A structural problem worth fixing, and I did not fix it

**The shared checkout at `C:/Users/pette/Projects/strale` is parked on
`ops/company-scaffold`, which is far behind main** — 88 files, ~10,800 lines
adrift, including the metrics module the dashboard depends on and every
governance doc.

This session read CHARTER/GOALS/DECISION-QUEUE from that stale tree before
noticing. Main's GOALS.md had 60 more lines, including the entire "all revenue
is one cluster" finding and Petter's DQ-9 answer; main's DECISION-QUEUE had
DQ-9 and DQ-10, which the stale copy does not contain. **Any check-in that reads
the working tree gets stale governance and runs a stale dashboard.** I re-read
everything from `origin/main` via `git show` and ran the dashboard from a
worktree pinned to main.

I did not move the shared checkout: the hard rule against `git checkout <branch>`
there exists because it has corrupted the tree three times. The durable fix is
either a staleness guard in `ceo-dashboard.ts` that refuses to run when
`HEAD ≠ origin/main`, or pointing the check-in at a dedicated main-pinned
worktree. **I lean to the guard** — it makes the failure loud instead of silent.
Next session should ship it; it is a small change and it protects every future
check-in.

Worktree `C:/Users/pette/Projects/strale-wt-checkin` is left in place (beside the
project, not in `C:/tmp`, per yesterday's warning) with deps installed. Remove
with `git worktree remove`, never `rm -rf`.

## Queued for Petter

Nothing new. Standing, unchanged:
- **Openapi.com resale addendum, case 151296** — unsigned since May, holding ten
  European country lookups off the shelf. Largest blocked chunk of catalogue we
  have, already built.
- **Browserless $25/mo upgrade** — recommended yesterday; the free plan's
  2-concurrent ceiling caused the real scraper-side 429s.
- **DQ-3** (Mexico/INEGI) — parked on the evidence, nothing depends on it.
- **wow-core repo** — keep as archive or delete.

Recorded as `decided` (reversible, listed so he can reverse rather than approve):
**DQ-11** the us-court-search switch-off, **DQ-12** the alerting fix.

Nothing in the queue matured for auto-execution today.

## Next session, in order

1. **The fixture-shape batch** — seven capabilities whose fixtures assert a
   flattened shape against a nested response. `iso-country-lookup` first: it is
   the clearest case and will establish the pattern for the rest.
2. **Ship the staleness guard** so no future check-in silently reads a stale
   working tree.
3. **Look at `barcode-lookup` and `vat-validate`** (both 83%), newly visible.
4. **Continue the graveyard** — next ten oldest, 110 remaining.
5. **Watch `brazilian-company-data`** — auto-promoted yesterday; its quarantine
   driver was customer-side ReceitaWS 429s the harness does not reproduce.

## Process note

The second-source rule earned its place three times today: the "nine
capabilities quarantined overnight" was an `updated_at` artifact, the "revenue
fell 20%" was a rolling-window artifact, and the "nine branches deleted" in
yesterday's handoff was not true. Each one was a correctly-executed query
answering a subtly wrong question, and in each case what caught it was
re-measuring a different way — never care.

One I am recording as a rule rather than an anecdote: **a decision written down
is not a decision executed.** DQ-4 said the capability was off; I had checked
the queue entry, not the world. Anything in the decision queue that claims a
state change now gets verified against production before it is written as done.
