# 2026-09-24 — morning operating session

Intent: run the 2026-09-24 operating session under DAILY-RUN.md — measure the
business, dispose of overnight health and stale work, do the highest-leverage
work against GOALS.md, and hand back the two artifacts.

Proactivity level 5. Everything below is second-sourced or marked
`unverified:`. **Previous run: 2026-09-19** (gate passed 06:24:54Z). No run on
09-20 to 09-23, so every health window below starts at **2026-09-19T06:25Z**
(~5.5 days). This run started late in the day (~18:45Z).

---

## Headline

1. **Week of 09-14 closed at €62.31, up from €51.97.** Two-week fall over.
   Largest buyer 83.4% (93.5% the week before); €8.91 of the other €10.32 is
   the account buyer.
2. **The account (card) buyer came back four days running** (09-21 to 09-24)
   — first consecutive-day pattern. A fourth survey on 09-21 (81 capabilities),
   then 6, 4 and 3 small calls on different capabilities. Narrowing
   evaluation, not yet a habit.
3. **Fixed: `lithuanian-company-data`** — had not completed a single call
   since 2026-08-21 while listed and x402-enabled. The classifier read (label
   lookup only) now falls back to a bundled snapshot. PR below.
4. **Nothing a customer saw overnight.** Every alarmed capability's failures
   in the window were harness-only.

---

## A. Business measurement

`ceo-dashboard.ts` and `commercial-brief.ts`, production read-only, from the
batch worktree at `origin/main` tip `2a65ffd6` (copied the trunk's two ignored
`.env` files in; no tracked change).

```
2026-09-21     €24.98    367 calls  [in progress, day 4 of 7 — NOT comparable]
2026-09-14     €62.31   1038 calls
2026-09-07     €51.97   1082 calls
2026-08-31     €58.77   1168 calls
2026-08-24     €73.03   1295 calls
2026-08-17     €66.31   1000 calls
```

`growth()` rising; 11 payers; top share 83.4% (€51.99 vs €10.32); 2 bought on
>1 day; 7 paying days; new/returning `unavailable`. Week in progress: 6
payers, largest 71.8% (€17.94 vs €7.04). Dashboard: revenue €50.43 rolling 7d,
buyers 37 (lower bound), identity 100%, spend €1.84. Quiet list: 9 (was 6 on
09-19), largest €6.64 at 18 d.

**Second source — `payerFacts`**, window 2026-09-19T06:25Z → now: 9 payers,
€0 unattributed; largest `x402:v1:e9e672ef…` €24.67/367 calls/6 days; account
buyer `user:v1:e3c68534…` €6.75/87/4 days. Week-in-progress window (from
09-21): largest €17.94, account buyer €6.75 — match the pack's €17.94 and
€7.04 (€6.75 + €0.20 + 5 + 2 + 2 cents).

**The account buyer, by day** (read-only rows for that one account,
qualitative): 09-21 81 rows / 81 slugs / 79 completed; 09-22 6/5; 09-23 4/2
(`seo-audit`, `serp-analyze`, €0.75); 09-24 3/3 (`company-enrich`,
`company-tech-stack`, `fear-greed-index`). Reconciliation against
`payerFacts`: 87 completed paid rows = 675 cents exactly; +5 completed
free-tier rows (0 c) and 2 failed rows (22 c, not charged). The two failures:
`job-board-search` "United States (federal jobs) is not available yet" and
`work-permit-requirements` "'purpose' must be 'work', 'study', or 'visit'" —
both correct refusals.

**New account** `user:v1:6c8475b4…` registered 2026-09-24T09:47Z, 4 ×
`domain-reputation` (all completed, €0.20). Too early to read. No outreach
(CHARTER customer-data boundary).

## B. Overnight health

**Vendor Control Tower** — ACTION NEEDED, no new substance. OpenRegister
**291/500** (328 on 09-19), resets 2026-10-07T00:05Z. Serper 47,081/50,000.
Dilisense authenticated ok. Browserless self-hosted render ok. Same six
standing warnings (anthropic/cdp spend unread; esortcode no balance endpoint;
cobalt-intelligence, einsearch, sec-api-io with no vendor record — DQ-30).

**German.** `who-called --slug german-company-data --days 5 --errors`: 7
calls — 1 account (completed), 6 x402 (1 completed, 5 refused: 2 × no
confident match "Lima Distribution GmbH", 1 ambiguous "VOM FASS AG", 1 missing
input, 1 no match), harness 0. 37 credits consumed in five days; ~26 answered
lookups of runway. **Quality floor:** proposals for German on 09-21 and 09-22
(27% on 194 calls, deferred as a one-day burst); **none from 09-23** — the
127 × 402 of 08-24 left the 30-day window, as the 09-19 record predicted.
Second source: the tick summaries on 09-23 and 09-24 show `proposals: []`.

**`npm run fixtures:drift`**: "Nothing". Caveat recorded (DQ-33 update):
German dropped off because its `dependency_health` suite has **no run in the
14-day window**, which the tool excludes by design — not because it is fixed.
Spanish `dependency_health`: passed 2026-09-21T05:48Z and 2026-09-24T06:48Z
(failed 09-18T04:49Z, pre-correction). **DQ-33's Spanish half verified.**

**`npm run scheduled:outcomes`**: exit 1 — `weekly-drift.yml` **6**
consecutive failed scheduled runs, last green 2026-08-10. Latest run
35607072076 (09-21T13:40Z) log: `password authentication failed for user
"postgres"` — same cause. DQ-34 updated.

**Alarms grouped, whole window, no row cap** (excluding routine
`dependency_probe` 213,187, `scheduler_heartbeat` 6,700, `meta_monitoring`
281, `situation_assessment` 281; platform `invariant_alert` 260, `alert_sent`
27):

| slug | events (type n, days) | `who-called --days 6 --errors` |
|---|---|---|
| `uk-gazette-notice-search` | classification 132/6d, invariant_alert 65/6d, auto_remediation 5 | 288 harness, 0 completed: 144 missing-input negatives, 138 × Gazette HTTP 500, 6 timeout. Not visible, not x402 (`validating`). |
| `lithuanian-company-data` | classification 72/6d, invariant_alert 30/6d | 95 harness, 0 completed: 83 × classifier HTTP 500, 12 negatives. **Fixed today (D).** |
| `company-news` | invariant_alert 18/4d, classification 8/5d | 17 harness: 7 negatives, 5 bare `fetch failed`, 3 GDELT 429 |
| `slovak-company-data` | classification 9/2d, upstream_escalation 1 | 266 harness: 144 negatives, 9 timeouts |
| `austrian-company-data` | classification 9, invariant_violation 7/2d (09-20/21) | 428 harness: 214 negatives, 6 × Firmenbuch 404, 1 × 503, 2 timeouts |
| `nl-housing-price-index` | invariant_violation 7, classification 5, regression 3 (09-21/22) | 288 harness, 11 × CBS HTTP 403 |
| `arxiv-search` | invariant_alert 6 (09-20), classification 2 | 20 harness: 8 negatives, 1 × 429, 1 timeout |
| `cve-lookup` | regression 1, classification 1 (09-22) | 358 harness (1 × OSV HTTP 501); **7 account calls, all completed** |
| singles | `tech-stack-detect` 5, `country-economic-indicators` 4, `us-product-recall-search` 3, `page-speed-test` 3+1, `vat-validate` 2+2, `redirect-trace` 2, `danish-company-data` 2, `charity-lookup-uk` 2, `irish-company-data` 1+1, `academic-paper-search` 1+1, `image-resize` 1 | not individually traced; all ≤5 events, none in a paying account's failure list |

Every failure in every traced capability was the harness; the only non-harness
calls on any of them (7 × `cve-lookup`, account buyer) completed.
`uk-gazette-notice-search` is a standing vendor 500 on a capability that is
not for sale.

**Breakers:** one open, `us-court-search`, since 2026-08-17 (DQ-14).
**Quarantined suites:** 37 non-`normal` rows (was 38) — 9 `env_dependent`
(2 caps), 7 `infra_limited` (2), 21 `upstream_broken` (7). `irish-company-data`
is no longer in the list (released).

**Deployed commit `2a65ffd66d5a` equals `origin/main` tip `2a65ffd6`.**

## B2. Stale work

- **PR #682** (M4 batch 7 → `m4/cutover`) — unchanged since 2026-09-13,
  `MERGEABLE`, deliberately not merged (improved follow-up in
  `rescue/wip-2026-09-17-b7-fix-work-171f7c3` and the agent worktree
  `.claude/worktrees/agent-aa0d77d823b642e00`). Owner: next M4 session, before
  batch 8 — carried in T7's `next_action`. Eleven days old; flagged in "Next
  session".
- `session-close-check --hygiene-only` from the **primary checkout**: 0 red,
  1 yellow (today's handoff not yet written then).

## B3. Branch graveyard

Oldest non-`main` remote branch is from 2026-09-12; nothing is a month old.
Remote list unchanged from 09-19 (`m4/*` ×7, `b3-fix2-local`, `b3-r10-work`,
`rescue/wip-2026-09-17-…`). No deletions.

## C. Decision queue

- **DQ-33** — update: Spanish verified passing (2/2); German waits for 10-07
  and is invisible to the drift tool for lack of runs; Lithuanian's separate
  error fixed today. Stays open (Petter closes it).
- **DQ-34** — update: sixth failure, same cause.
- **DQ-27, DQ-14** — unchanged. No `preauthorized_notice` window matured.

## D. The work — `lithuanian-company-data`

**Finding.** Listed (`is_active`, `visible`, `x402_enabled` all true) with no
completed call since 2026-08-21T02:55Z. Every production run fails in
`ensureClassifiers()` with `Spinta classifier fetch HTTP 500`. The 09-17
record falsified three hypotheses (poisoned inflight promise, registry down,
our client/UA); from this machine today both classifier models (Forma 168
records over two pages, Statusas 31) and the register query all return 200.
The difference is where the request comes from.

**Fix.** The classifiers only map `forma._id`/`statusas._id` to labels
(`legal_form`, `status` — both `guaranteed` in the manifest). New
`apps/api/src/capabilities/lib/lithuanian-classifiers.ts`: a generated
snapshot of both models (fetched 2026-09-24, CC-BY 4.0). On a failed live
read the executor loads the snapshot, logs `lithuanian-classifier-fallback`
via `logWarn`, retries the live read after an hour, and says in
`provenance.source_note` that labels came from the copy and its date. A
register failure still fails the call. The classifier error now carries the
page number, so the log discriminates page 1 from a later page.

**Tests** (`lithuanian-company-data.test.ts`, 4): snapshot answers on a
classifier 500; no retry on every call; live labels preferred; register
failure still fails. **4/4 pass on the fix; 3/4 fail against the
`origin/main` executor** (the fourth — "live labels preferred" — passes on
both, as it should). Live run of the fixed executor against the real API:
full output, live labels, normal `source_note`. Root `npm run typecheck`
clean (after building `mcp-server` and `sdk-typescript` in the worktree);
`lint:no-bare-catch`, `lint:no-unguarded-user-fetch`, `check-ssrf-inventory`,
`lint:no-new-console` (first failed on a `console.warn`, replaced with
`logWarn`), `check-fetch-timeout-coverage --strict`,
`check-manifest-guaranteed-consistency --strict`, `check-pii --strict`,
`check-no-committed-secrets`, `check-mjs-syntax` all pass.

**Onboarding protocol:** executor-only change, no manifest or schema change.
`validate-capability --slug lithuanian-company-data`: all gates pass except
**Gate 5 — `company_name` entry point has no fixture coverage**, which is
pre-existing and unrelated to this change; recorded, not fixed here.

**What the deploy will tell us.** `dependency_health` runs ~15×/day. If the
register read works from production, the check starts passing within hours
and output carries the snapshot note. If it then fails with "Lithuanian Open
Data Portal returned HTTP 500", the whole host is refused from production and
this becomes a hosting-location question. Next session reads which.

**Deploy-mechanism note (DEC-20260504-C):** no deploy-pipeline dependency —
the executor is auto-imported by `auto-register.ts`; the snapshot is a plain
TS import on the same graph. Post-deploy verification = next session reading
the suite's results, above.

## E. Authorities updated

- `docs/company/GOALS.md` — four entries (week closed; account buyer's four
  days; German proposal fell away as predicted; Lithuanian).
- `docs/company/DECISION-QUEUE.md` — DQ-33 and DQ-34 updates.
- LESSONS.md not changed. The Lithuanian case is the F1 shape (a signal
  judging a capability that could never pass) but was already recorded on
  09-17 as D3; today is its repair, not a new incident.

## F. Review

Independent same-provider review in a separate context (a fresh read-only
agent that did not author the change) of commit `26820582` — verdict recorded
in the PR body. No new Codex-register row (DEC-20260910-A).

## Next session

1. **Read Lithuanian's `dependency_health` results after the deploy.** Passing
   → done, note whether `source_note` shows the snapshot (i.e. whether the
   classifier 500 persists). Failing on the register query → the host refuses
   production entirely; take it off sale through the `DEACTIVATED` map in
   `auto-register.ts` (a DB flag alone is not enough) — the brief committed
   to that — then investigate hosting location.
2. **OpenRegister balance first thing** (291 today). Below ~110 before 10-07
   re-opens the 08-27 trigger with calls asked-for as the denominator.
3. **Land the rescued b7 work and merge PR #682** — now 11 days idle.
4. Gate 5 on Lithuanian: add a `company_name` fixture (small; own change).
5. Candidate, unchanged: carry undici's `cause` in bare `fetch failed`
   strings (`company-news`).
