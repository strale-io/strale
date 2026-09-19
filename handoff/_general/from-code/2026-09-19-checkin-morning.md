# 2026-09-19 — morning operating session

Intent: run the 2026-09-19 morning operating session under DAILY-RUN.md —
measure the business, dispose of overnight health and stale work, do the
highest-leverage work against GOALS.md, and hand back the two artifacts.

Proactivity level 5. Everything below is second-sourced or marked
`unverified:`. **Previous morning run: 2026-09-18** (its gate passed at
06:44Z), so every health window below starts at **2026-09-18T06:45Z**.

---

## Headline

1. **The week in progress has already passed last week, with a day to go.**
   €54.68 on day 6 against €51.97 for the whole of w/c 09-07, so the two-week
   fall ends unless something is refunded. Not called as growth until Monday's
   completed week; the instrument says "falling" because it only reads
   completed weeks, correctly.
2. **The account (card) buyer made their biggest visit yet** — 61 calls,
   €5.02, 48 distinct capabilities, all completed, evening of 09-18. Third
   breadth survey; still evaluation. This week they are €8.91 of the €9.84
   that everyone except the largest buyer spent.
3. **German runway.** The largest buyer is back on German (32 paid calls in
   two days, 15 answered). OpenRegister is at 328/500 credits; at 11 credits
   per answered lookup that is ~29 answers before the 2026-10-07 reset. The
   08-27 buy trigger has not fired. Watch daily.
4. **Overnight: nothing a customer saw.** Four suites quarantined
   (`slovak-company-data`, `us-product-recall-search`, `irish-company-data`
   `upstream_broken`; `page-speed-test` `env_dependent`) — every failure in
   the window was the harness.

---

## A. Business measurement

`ceo-dashboard.ts` and `commercial-brief.ts`, production read-only, from the
batch worktree at `origin/main` tip `8856a085`. (First attempt failed with
`DATABASE_URL environment variable is required`: a fresh worktree has no
`.env`. Copied the trunk's two ignored `.env` files in; no tracked change.)

```
2026-09-14     €54.68    878 calls  [in progress, day 6 of 7 — NOT comparable]
2026-09-07     €51.97   1082 calls
2026-08-31     €58.77   1168 calls
2026-08-24     €73.03   1295 calls
2026-08-17     €66.31   1000 calls
2026-08-10     €39.24    620 calls
```

Completed weeks identical to yesterday's run (instrument stable). `growth()`
falling; 14 payers; top share 93.5% (€48.57 vs €3.40); 4 bought on more than
one day; new-vs-returning `unavailable`. Week in progress, day 6: 8 payers,
largest 82.0% (€44.84 vs €9.84). Yesterday's day-5 reading: €39.31, largest
€34.49 vs €4.82 — so the last ~24 h added €10.35 from the largest and €5.02
from the rest. Dashboard: revenue €58.95 rolling 7d, buyers 34 (lower bound),
identity 100%, spend €2.11. Quiet list: 6, largest €6.64 at 12 d.

**Second source — `payerFacts`** (module call, window 2026-09-18T06:45Z → now):
two payers, €0 unattributed — `x402:v1:e9e672ef…` €10.01 / 149 calls (first
slug in window `german-company-data`) and `user:v1:e3c68534…` €5.02 / 61
calls. Sum €15.03 against the pack's +€15.37 day-over-day; the 34¢ gap is the
window edges (the pack's day-5 reading was taken before 06:45Z). Consistent.

**The account buyer, by week** (`payerFacts` per discrete week): €2.00 (08-17,
2 calls), €9.09 (08-24, 20 calls, 3 d), none (08-31), none (09-07), **€8.91
(09-14, 84 calls, 3 d, week open)**. Slug mix of the 09-18 visit, read-only
query on that one account's transactions (qualitative, not a population
number): 48 distinct slugs, all `completed`, 1–6 calls each, heavily
alphabetical-early (address-*, bank-bic-lookup, barcode-lookup, charity,
code-*, company-*, contract-extract, cookie-scan, cve-lookup ×6 …). A survey,
same shape as 08-25 and 09-15. GOALS.md updated, including a correction: the
09-17 entry said this account sits outside the payer measure; `payerFacts`
keys it `user:v1:…`, so it is inside.

## B. Overnight health

**Vendor Control Tower** — ACTION NEEDED, no new substance. OpenRegister
**328/500** (363 yesterday), resets 2026-10-07T00:05Z. Serper 47,123/50,000,
expires 2026-11-08. Dilisense authenticated call ok. Browserless self-hosted
render succeeded in 24 h. Same six standing warnings (anthropic/cdp spend with
no reading; esortcode no balance endpoint; cobalt-intelligence, einsearch,
sec-api-io without vendor records — DQ-30).

**German runway, second-sourced.** `who-called --slug german-company-data`
over 1/2/3/4/6/8/12 days: x402 7/32/32/32/33/33/34 calls; answered 3/15/15/…;
harness 0 in every window. Executor cost model (`german-company-data.ts`
header): 11 credits per answered name lookup, 10 per id lookup, refusals stop
at autocomplete (1). 15 × 11 + 19 × 1 = 184 ≈ 172 consumed since the reset.
328 remaining ≈ 29 answered lookups. 12-day average ~14/day → lasts past
10-07; a 08-24-sized list exhausts it at once. The tower's automatic
suspension handled exhaustion correctly last time.

**Quality floor** (`health_monitor_events`, event 2026-09-18T10:22Z):
`german-company-data` `flagged_only`, completion 25.65% on 191 eligible
calls/30d, `deactivate_proposal: true`, `requires_human: true`, **deferred**
because counted failures span one day (the 127 × HTTP 402 of 08-24; refusals
are not counted — the 30-day `who-called --errors` shows 127 × 402, ~50
refusals, 1 × 404). Those 402s leave the window on 2026-09-23. Capability
flags unchanged: `is_active`, `visible`, `x402_enabled` all true. Promotion
tick: `gas-price-check` held (known_answer 7/9). No action needed; recorded in
GOALS.md with the runway.

**`npm run fixtures:drift`**: **1** actionable (was 2) — `german-company-data`
only. Spanish dropped off. Production: the Spanish `dependency_health` suite
`f7f09533-…` holds `{"nif":"A20072302"}`, `normal`. **No run since the
06:38Z deploy** — last run 2026-09-18T04:49Z; tier C suites here run ~every
three days (5 runs in 14 d for each Spanish tier-C suite). So a passing run is
not yet observed; expected around 2026-09-21. Spanish dropped off the drift
list because its production input now equals the manifest, not because it
passed.

German `dependency_health` (`69a00c0a-…`, input `{"company_name":"Google"}`)
ran **once in 14 days** (2026-09-07T00:05Z, right after the allowance reset);
German's `known_answer` suites have **no** run in 14 d. `unverified:` that the
free-quota test budget is what suppresses them — consistent with the timing,
not traced in code today. DQ-33 updated: the German half deliberately waits
for the 10-07 reset, because a passing corrected check spends 11 credits a
run from the allowance the paying buyer depends on.

**`npm run scheduled:outcomes`**: exit 1, `weekly-drift.yml` five consecutive
failed scheduled runs, last green 2026-08-10. DQ-34, unchanged; next scheduled
run tomorrow (Sunday).

**Alarms grouped, whole window since 2026-09-18T06:45Z, no row cap**
(excluding the platform's routine `dependency_probe` 38,626,
`scheduler_heartbeat` 1,219, `meta_monitoring` 50, `situation_assessment` 46):

| slug | type | n |
|---|---|---|
| (platform) | invariant_alert | 48 |
| `uk-gazette-notice-search` | classification / invariant_alert / auto_remediation | 24 / 12 / 1 |
| `lithuanian-company-data` | classification / invariant_alert | 12 / 6 |
| `irish-company-data` | invariant_violation / classification | 6 / 1 |
| `company-news` | invariant_alert / classification | 6 / 2 |
| `exchange-rate` | classification | 2 |
| `vat-validate` | classification / regression_detected | 1 / 1 |
| single classifications | `charity-lookup-uk`, `cz-unreliable-vat-payer`, `danish-company-data`, `slovenian-company-data`, `tech-stack-detect`, `us-product-recall-search` | 1 each |
| (platform) | alert_sent | 1 — "28 dependency_health suite(s) drifted from their manifest fixture" |
| `german-company-data` / `gas-price-check` | quality_floor / capability_promotion | 1 / 1 (above) |

Dispositions (`who-called --days 7 --errors` for each):

- **`irish-company-data`** — re-escalated `upstream_broken` 2026-09-19T01:06Z;
  6 × `fetch failed` of 87 calls, **all harness**. Same CRO outage as
  yesterday; 99/105 passing over 3 days, so it is intermittent. Tracker
  releases after two passes in 48 h.
- **`slovak-company-data`** → `upstream_broken` 2026-09-18T11:39Z: 11 ×
  timeout, all harness (152/160 passing over 3 days). Nobody outside.
- **`us-product-recall-search`** → `upstream_broken` 14:08Z: 7 × timeout, all
  harness (143/146). Nobody outside.
- **`page-speed-test`** → `env_dependent` 15:22Z (Google PSI rate-limits
  shared IPs, the recorded reason). 12 paid calls in 7 d, **all completed**.
- **`vat-validate`** regression — one VIES "overloaded" plus one "authority
  unavailable"; 671 of 672 calls harness; the one account call completed.
- **`uk-gazette-notice-search`, `lithuanian-company-data`, `company-news`** —
  unchanged from yesterday's dispositions (vendor 500 / live-environment-only
  HTTP 500 / GDELT throttling with bare `fetch failed` deliberately
  unattributed). Recurring daily; all explained; none customer-facing.
- **`alert_sent` "28 drifted"** — the same wider population the tool narrows
  to 1 actionable (29 yesterday; Spanish left).
- **Breakers:** one open, `us-court-search`, since 2026-08-17 (DQ-14 item 1).
- **Quarantined suites:** 38 non-`normal` rows — 9 `env_dependent` (2 caps),
  7 `infra_limited` (2), 22 `upstream_broken` (8). Same total as yesterday by
  the same query; 4 rows' `updated_at` falls in the window (listed above).

**Deployed commit `8856a0856653` equals `origin/main` tip `8856a085`.**

## B2. Stale work

- **PR #682** (M4 batch 7 → `m4/cutover`) — unchanged since 2026-09-13, CI
  green, `MERGEABLE`, still deliberately not merged: the author's improved
  follow-up is in `origin/rescue/wip-2026-09-17-b7-fix-work-171f7c3` and the
  agent worktree `.claude/worktrees/agent-aa0d77d823b642e00`. Owner: next M4
  session, before batch 8 — carried in T7's `next_action`.
- `session-close-check --hygiene-only` from the **primary checkout**: 0 red,
  1 yellow (today's handoff — this file — not yet written then).

## B3. Branch graveyard

Oldest non-`main` remote branch is 2026-09-12; nothing qualifies. Remote
branches unchanged from yesterday's list (`m4/*`, `b3-fix2-local`,
`b3-r10-work`, `rescue/wip-2026-09-17-…`). No deletions.

## C. Decision queue

- **DQ-33** — updated: Spanish correction live, first pass not yet observed;
  German deliberately deferred to after the 10-07 reset (credits). Stays open.
- **DQ-34** — unchanged; tomorrow's scheduled run will fail the same way.
- **DQ-27, DQ-14** — unchanged. No `preauthorized_notice` window matured.

## D. The work

Today's work was measurement: the two findings that matter (the account
buyer's third survey; German runway) are commercial and needed establishing,
not building. Written into GOALS.md "What we currently know" and DQ-33. No
code change. Considered and rejected:

- **German `dependency_health` block (DQ-33's last row)** — would spend 11
  scarce credits per passing run; defer to after 10-07, and verify `SAP SE`
  live then with a fresh allowance.
- **Returning German candidate matches as data** (GOALS 09-17 entry) — a
  capability output-contract change for the largest buyer; wants its own
  session under the onboarding protocol, not a morning run's tail.

## E. Authorities updated

- `docs/company/GOALS.md` — two entries (account buyer's third survey + a
  correction; German runway and the floor deferral).
- `docs/company/DECISION-QUEUE.md` — DQ-33 update.
- LESSONS.md not changed: no new incident. The "outside the payer measure"
  correction is a single stale sentence, not a recurrence.

## F. Review

Docs-only change (no code), which CLAUDE.md exempts from the `/go`
code-review gate. Every number in it is second-sourced above.

## Next session

1. **Confirm the Spanish `dependency_health` suite passes** — first run after
   2026-09-18T06:38Z, expected ~09-21.
2. **Read OpenRegister's balance first thing.** If it drops below ~110 (≈10
   answered lookups) before 10-07, the 08-27 trigger conversation re-opens
   with the corrected denominator (calls asked for, not answered).
3. **Land the rescued b7 work and merge PR #682** — unchanged.
4. `lithuanian-company-data`'s HTTP 500 from the live environment.
5. Candidate: carry undici's `cause` in bare `fetch failed` strings (measure
   first).
