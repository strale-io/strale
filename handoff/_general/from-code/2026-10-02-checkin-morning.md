# 2026-10-02 — morning operating session

Intent: run the 2026-10-02 operating session under DAILY-RUN.md — the first
since 2026-09-27 — measure the business across the gap, verify block 0118 in
production, sweep health over the whole five-day window, fix the
`lying_breaker` remediation advice, and hand back the two artifacts.

Proactivity level 5. Everything below is second-sourced or marked
`unverified:`. **Previous run: 2026-09-27** (merged 06:44Z), so every health
window starts at **2026-09-27T06:44Z** (~5 days). This run started ~06:07Z
from batch worktree **`strale-wt-checkin-1002`** at `origin/main` `edf4006b`
(the stale plain directory `strale-wt-checkin` — deregistered 09-25 remnant,
no `.git` — is still there and blocked the usual path; not touched, F12;
owner: next attended session or Petter). Copied the trunk's two ignored
`.env` files in. Read-only scripts were run from the trunk (same commit).

---

## Headline

1. **The run gap was the plan's weekly usage limit.** The scheduler shows
   09-29 (twice), 09-30 and 10-01 failing within seconds with "You've hit
   your weekly limit"; no 09-28 run at all. Four mornings without a health
   sweep. Nothing broke in the gap (below) — but the operation's own
   continuity now depends on usage headroom. Kept this run lean on purpose.
2. **The largest buyer came back, bigger.** €2.46 → €3.32 → €4.11 → €11.02 →
   **€16.28** (10-01, 483 calls). The 09-27 "substitution vs less work"
   question resolves toward less work then different work.
3. **Week of 09-21 closed €36.13** (falling from €62.31; 68.5% one buyer).
   Week of 09-28 is €42.87 by day 5, 94.2% one buyer.
4. **Block 0118 verified in production.** `lying_breaker` has not fired since.
5. **Fixed:** the `lying_breaker` alert advised recording a fake failure to
   repair a fake success. Now advises nulling only the false value.

---

## A. Business measurement

`commercial-brief.ts`, `ceo-dashboard.ts` — production read-only.

```
2026-09-28     €42.87    957 calls  [in progress, day 5 of 7 — NOT comparable]
2026-09-21     €36.13    535 calls
2026-09-14     €62.31   1038 calls
2026-09-07     €51.97   1082 calls
2026-08-31     €58.77   1168 calls
2026-08-24     €73.03   1295 calls
```

Last completed week (09-21): falling; 8 payers; largest 68.5% (€24.76 vs
€11.37); 3 bought on >1 day (2 excluding the largest); 7 paying days;
new/returning `unavailable`. Quiet list 10 (largest €5.07 at 12 d). Dashboard:
revenue €51.68 rolling 7d, buyers 33, identity 100%, spend €2.24.

**Second source — `payerFacts`** (scratchpad `payers.mts`, not committed):
week of 09-21 = 2476 + 1102 + 20 + 5 + 4 + 2 + 2 + 2 = **3613 c**, equals
the pack; largest 2476/3613 = 68.5%, equals; €0 unattributed. Week of 09-28
= 4287 c, largest 4037 c = 94.2%, equals. (The 09-27 record's €31.62 was
day 7 at 07:00Z; Sunday added €4.51, of which the largest buyer €2.44.)

**Largest buyer (`x402:v1:e9e672ef…`)** per UTC day 09-27..10-02: 246, 332,
411, 1102, **1628**, 564 (by 06:21Z) c; calls 43, 77, 98, 177, 483, 75.
Slug mix (all statuses, its rows), 09-14..09-24 → 09-25..09-27 → since
09-28: email-validate 93 → 0 → **405** (€12.15); google-search 35 → 1 →
**101** (€10.10); base64-encode-url 70 → 10 → 155; image-to-text 191 → 0 →
58; tech-stack-detect 12 → 1 → 45; page-speed-test 31 → 10 → 43;
us-company-data 119 → 0 → 1; phone-validate 101 → 2 → 11; serp-analyze
75 → 0 → 4. Reading: its work resumed with a different mix (bulk email
validation + search). A supplier swap does not reverse in two days, so the
09-27 `unverified:` substitution reading is now unlikely; on-chain outflow
split not re-run this morning (usage budget) — `unverified:` whether our
share of its utility spend recovered to the ~⅓ seen before 09-24.

**Others this week:** account buyer `user:v1:e3c68534…` €2.05 on 3 days (was
€11.02 last week — its daily 02:42Z `company-tech-stack` job did not run
09-28..10-02; `unverified:` why; no outreach, DQ-21). Wallet
`x402:v1:59273355…` 2 c jwt-decode **every day 09-27..10-02** at
01:00–04:30Z — a scheduled job. Wallet `x402:v1:2e55b616…` 25 c over 2 days
(nginx-config-generate, adverse-media-check). Three one-call wallets.

**Customer-visible failures since 09-28** (`who-called --days 5 --errors`):
- base64-encode-url: x402 160 calls / 24 failed — target-site 403/404/400,
  timeouts fetching the caller's URL, 5 oversize-file refusals. Correct.
- tech-stack-detect: x402 47 / 8 — target 403/406, 3 "External service
  temporarily unavailable", 1 invalid URL. Correct/upstream.
- uk-company-data: x402 15 / 4 — 3 ambiguous-name refusals, 1 no confident
  match. Correct.
- canadian-company-data: x402 3 / 3 — "could not identify a specific
  Canadian company name". Correct refusal.
- weather-lookup: x402 5 / 5 — the buyer sent **empty input** (input-keys
  query, scratchpad `inkeys.mts`: failed rows have no keys; its earlier
  completed calls used `city` or `latitude,longitude`). Correct refusal.
- github-repo-analyze: x402 2 / 2 — private repo, invalid URL. Correct.

## B. Overnight health (window 09-27T06:44Z → 10-02T~07:00Z)

**Run continuity.** `list_task_runs strale-checkin-morning`: 09-27
succeeded; 09-29 05:16Z and 06:07Z failed; 09-30 and 10-01 failed — all
"You've hit your weekly limit"; no 09-28 entry. Not a code fault. Recorded
for Petter in the brief as a fact (section 2), not as a decision: the plan
and its cost are his, but nothing is being asked.

**Vendor Control Tower** — ACTION NEEDED, no new substance: OpenRegister
**291/500** (unchanged since 09-24; resets 2026-10-07T00:05Z); Serper
46,976/50,000 (−103 since 09-27, matching the buyer's 101 google-search
calls); Dilisense ok; Browserless self-hosted ok; same six standing warnings.

**`fixtures:drift`**: Nothing (326 suites, 350 manifests).
**`scheduled:outcomes`**: exit 1 — `weekly-drift.yml` **7** consecutive
failed scheduled runs; latest 36440132897 (2026-09-28T14:59Z), same cause
(`password authentication failed for user "postgres"`, read from
`--log-failed`). DQ-34 unchanged. `m3-digest-shadow.yml` reported
RUN_HISTORY_UNREADABLE — a transient `gh` TLS timeout; re-read directly: six
successful scheduled runs 09-26..10-01. CI on main green at `edf4006b`.

**Block 0118 verified (DEC-20260504-C post-deploy):**
`capability_health` danish-company-data: `last_success_at` **NULL**,
`last_failure_at` 2026-08-16T13:49:20.235Z, total_failures 11,
total_successes 0, state closed. Ledger `0118_clearDanishFalseBreakerSuccess`
applied 2026-09-27T06:45:57Z, rows_affected **1**. The only
`health_monitor_events` row mentioning `lying_breaker` since is the block's
own `auto_fix` event at 06:45:57Z — **no `lying_breaker` alert in five days**.

**Alarms grouped, whole window, no row cap** (excluding
`dependency_probe` 184,233 / `scheduler_heartbeat` / `situation_assessment` /
`meta_monitoring`):

| slug | events | reading |
|---|---|---|
| platform | invariant_alert 60, alert_sent 26 | `fixture_input_drift` ×60 (12/day — the standing German `ambiguous_match` suite); alert_sent = 10 quiet-customer alerts (the largest buyer, 09-27..10-01) + budget-threshold notices + 5 fixture-drift digests. **No other platform invariant.** |
| `uk-gazette-notice-search` | classification 76, invariant_violation 47, invariant_alert 13, auto_remediation 2 | standing Gazette 500; not for sale |
| `academic-paper-search` | invariant_alert 18, classification 4, regression 2 | OpenAlex rate-limiting the known-answer test 09-27..09-30; passing 10-01 (3/3), 10-02 (4/4). Upstream. |
| `slovak-company-data` | classification 10, alert 2, escalation 2 | standing (harness timeouts) |
| `us-product-recall-search`, `country-economic-indicators`, `slovenian-company-data`, `tech-stack-detect`, `company-news` | 4–9 classification | single-cause upstream (company-news: GDELT 429) |
| `fda-safety-search` | alert 6 (one day) | openFDA HTTP 500 on 09-28 |
| `vat-validate` | regression 2 | VIES "overloaded" 09-27 20:32Z, 10-02 02:32Z |
| `nl-*` (3), `page-speed-test`, `cz-unreliable-vat-payer` | 2–6 on 1–2 days | tail of the 09-26 CBS outage; single-day blips |
| `us-company-data` | quality_floor flagged_only 1 | below |
| — | quality_floor 5 ticks, capability_promotion 5 ticks | 0 quarantines, 0 promotions |

**`us-company-data` near the floor.** 10-01 tick: "completion 69% on 16
eligible calls/30d, but counted failures span only 1 day — burst, not a
trend; deferred". `who-called --days 30 --errors`: 125 calls, all x402 (the
largest buyer), 11 completed; failures are ~100 correct refusals of private
US companies (the known gap, IDEAS.md 2026-09-26) plus **5 × "SEC EDGAR
search returned HTTP 500"**. Upstream 5xx counting against the capability
is deliberate (`quality-floor.test.ts` "target-site and upstream 5xx COUNT
… review H-2"), so the floor is behaving as designed; the two-day burst
guard is what kept it listed. If EDGAR 500s land on a second day inside 30
days it will be quarantined — correctly, by the policy. Watch, no action.
Buyer has nearly stopped calling it anyway (1 call since 09-28).

**Breakers:** `us-court-search` open since 2026-08-17 (DQ-14), unchanged.
**Deployed:** `GET /health` → `edf4006b50da` = `origin/main` tip.

**Paid compliance suites (09-27 candidate, closed).** `adverse-media-check`,
`pep-check`, `sanctions-check`: every suite `scheduled_testing_eligible =
false`, **0 runs in 7 days**. The zero-cost rows are not being scheduled, so
there is no Dilisense spend leak. Nothing to do.

## B2. Stale work

- **PR #682** (M4 batch 7 → `m4/cutover`) — unchanged since 2026-09-13,
  MERGEABLE. Not touched (whole-PR M4 pass; follow-up in
  `rescue/wip-2026-09-17-b7-fix-work-171f7c3` and another session's worktree
  `.claude/worktrees/agent-aa0d77d823b642e00`, which carries 6 uncommitted
  paths per the 10-01 gate). Owner: next M4 session.
- `session-close-check --hygiene-only` from the primary checkout (slow,
  ~25 min under load): **0 red, 2 yellow** — today's handoff (this file, not
  yet on main then); the same 16 M4-batch local branches as 09-27 (oldest
  20 d). Deleting them is the M4 session's call. Owner: next M4 session.

## B3. Branch graveyard

Remote heads unchanged from 09-27 (`m4/*` ×7, `b3-fix2-local`,
`b3-r10-work`, `rescue/wip-2026-09-17-…`). The oldest are 2026-09-12 — they
cross the one-month line around 10-12; all belong to the M4 programme.
No deletions.

## C. Decision queue

No `preauthorized_notice` item. Open `your_call`: DQ-34 (weekly-drift
credential — 7th failure, carried in the brief), DQ-33, DQ-27, DQ-14 —
unchanged.

## D. The work — `lying_breaker` remediation advice

The alert's `remediation` text told an operator to
`SET … last_failure_at=NOW(), total_failures = total_failures + 1 …` —
inventing a failure to erase a false success. 0118 (09-27) showed the right
repair nulls only `last_success_at`. Flagged in the 09-27 record's next-step
list.

**Change** (branch `chore/checkin-2026-10-02`):
- `apps/api/src/jobs/invariant-checker.ts`: the text moves to an exported
  `LYING_BREAKER_REMEDIATION` constant; it now says null only the false
  value, through a ledgered startup block, scoped to `state = 'closed' AND
  total_successes = 0` and `last_success_at` within one second of the false
  timestamp (reviewer nit: exact equality can miss on ms precision), leave failure
  fields alone, confirm no customer-path success first, see block 0118.
- `invariant-checker.test.ts`: two cases — advice contains
  `last_success_at = NULL` and none of `total_failures =`,
  `last_failure_at =`, `consecutive_failures =`; advice is scoped to the
  lying shape.

**Verification:** 7/7 pass. Discrimination: planted the old
`last_failure_at=NOW(), total_failures = total_failures + 1` into the
constant → "never invents a failure" fails (1 failed / 6 passed); restored
from a copy, 7/7. Behaviour unchanged otherwise (same check, same detection
predicate). No deploy-pipeline dependency beyond the normal build; no DB
write. Root typecheck left to CI (fresh worktree; change is one string
constant + export).

**Review:** independent same-provider review in a separate context (fresh
read-only agent, sonnet): **PASS** on all four — detection unchanged; advice
matches block 0118 and `circuit-breaker.ts` reads `last_success_at`
null-safely; no code consumer reads `details.remediation`; tests discriminate;
no typecheck risk. One nit (exact timestamp equality vs ms precision) applied;
7/7 after. No Codex-register row (DEC-20260910-A).

## E. Authorities updated

- `docs/company/GOALS.md` — one entry: the largest buyer's return and mix
  change; week of 09-21 close; the daily jwt-decode wallet.
- DECISION-QUEUE.md, LESSONS.md unchanged. The usage-limit gap is not a
  failure-family incident (no wrong conclusion, no breach); recorded here.

## Next session

1. **Close the week of 09-28** (Monday). Expect a rise on the same single
   buyer — say so; concentration is the read, not the rise.
2. **Usage budget:** if runs fail again on the weekly limit, record the dates;
   the brief carries it as a fact.
4. Optional, if budget allows: on-chain outflow split for the largest buyer
   (2,000-block `eth_getLogs` pages) to see whether our share recovered.
5. Account buyer: does the 02:42Z job resume? (No outreach, DQ-21.)
6. OpenRegister 291 until 10-07 reset; DQ-34 weekly run Sunday/Monday.
7. M4 branches cross one month ~10-12 — M4 session's call.
