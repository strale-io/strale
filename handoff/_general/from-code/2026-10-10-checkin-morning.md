# 2026-10-10 — morning operating session

Intent: run the 2026-10-10 operating session under DAILY-RUN.md — the first
since 2026-10-02 — measure the business across the eight-day gap, sweep
health over the whole window, land the German `dependency_health` fixture
correction DQ-33 deferred until the OpenRegister reset, and hand back the two
artifacts.

Proactivity level 5. Everything below is second-sourced or marked
`unverified:`. **Previous completed run: 2026-10-02** (last activity 09:18Z),
so every health window starts at **2026-10-02T09:18Z** (~8 days). This run
started 06:06Z. Batch worktree `strale-wt-checkin` (left by the 10-09 run on
branch `chore/checkin-2026-10-09` at `origin/main` `326a2154`, zero commits,
clean, `node_modules` incomplete) was reused: branch renamed to
`chore/checkin-2026-10-10`, `npm ci` rerun, trunk's two ignored `.env` files
copied in, `mcp-server` and `sdk-typescript` built for the root typecheck.

---

## Headline

1. **Run gap.** `list_task_runs`: no runs at all 10-03..10-08; a 10-09
   12:02Z run "succeeded" in ~70 s having created only the worktree (no
   commit, no artifacts). `unverified:` why the scheduler did not fire
   10-03..10-08 (no failed entries, unlike the 09-29..10-01 weekly-limit
   failures — machine off/asleep is the likely reading). Eight mornings
   without a sweep; nothing customer-facing broke in the gap (below).
2. **Week of 09-28 closed €53.35**, rising from €36.13, **94.0% one buyer**
   (€50.13 vs €3.22). Week of 10-05 is €31.34 at day 6 (85.9% one buyer) —
   the 10-01 surge did not hold.
3. **German `dependency_health` fixture corrected** (block 0119) — the last of
   DQ-33's six. Removes the day's dominant platform alarm (94
   `fixture_input_drift` in the window).
4. **x402 rail has no transient retry; `/v1/do` does.** Cost 8 French sales
   to HTTP 429 on 10-05. Spun off as a separate task (not landed here).
5. **weekly-drift is no longer blind.** Its 10-05 failure is real findings,
   not the credential (0 password errors); `scheduled:outcomes` still calls it
   "blind" — the instrument over-states.

---

## A. Business measurement

`commercial-brief.ts`, `ceo-dashboard.ts` — production read-only.

```
2026-10-05     €31.34    818 calls  [in progress, day 6 of 7 — NOT comparable]
2026-09-28     €53.35   1079 calls
2026-09-21     €36.13    535 calls
2026-09-14     €62.31   1038 calls
2026-09-07     €51.97   1082 calls
2026-08-31     €58.77   1168 calls
```

Last completed week (09-28): rising; 8 payers; largest 94.0% (€50.13 vs
€3.22; prior week 68.5%); 4 bought on >1 day; 7 paying days; new/returning
`unavailable` (identity instrument too young). Quiet list 11 (largest €6.66
at 9 d). Dashboard: revenue €37.45 rolling 7d, buyers 29, identity 100%,
spend €2.01 (estimated).

**Second source — `payerFacts`** (scratchpad `payers.mts`, not committed):
week 09-28 = **5335 c**, largest `x402:v1:e9e672ef…` 5013 c = 94.0% — equals
the pack. Week 10-05 so far 3134 c, largest 2691 c = 85.9% — equals. €0
unattributed in every window.

**Largest buyer per UTC day** (c / calls): 10-02 948/142, 10-03 73/18,
10-04 519/22, 10-05 292/49, 10-06 486/124, 10-07 969/308, 10-08 602/167,
10-09 305/45, 10-10 37/7 (by ~07:00Z). 10-01 was 1628/483. So the surge was a
spike; the level since is ~€5/day.

**Others:** account buyer `user:v1:e3c68534…` 262 c last week, **305 c
on 5 of 6 days** this week (daily again; DQ-21, no outreach). Wallet
`x402:v1:2e55b616…` 75 c on 4 days. Wallet `x402:v1:7e104b54…` 50 c (22
calls, 2 days). The daily jwt-decode wallet `x402:v1:59273355…` last bought
10-02. Revenue-heartbeat "a paying customer has gone quiet" alerts fired 16×
in the window, the hours climbing 6.3 h → 193.6 h — `unverified:` which
payer each tracks (alert keys not decoded this run).

**Customer-visible failures — `french-company-data`** (`who-called --days 30
--errors`, then per-transaction rows): 30 calls, 29 x402, 15 failed. On
**2026-10-05 15:55–15:58Z** one burst: **8 × "French API returned HTTP 429"**
(recherche-entreprises.api.gouv.fr rate limit), 3 ambiguous-name refusals,
2 no-identifiable-name refusals, 2 no-confident-match refusals. The
refusals are correct. The 429s are ours to fix: `routes/do.ts`
`executeWithRetry` (~l.487) wraps non-deterministic executors in
`withRetry` (1 retry, 1 s, retries 429/502/503/504); `routes/x402-gateway-v2.ts`
(~l.1687) calls `await executor(inputs)` with no retry. Unbilled (price 5 c
→ ~€0.40 lost). The quality floor sees it: french-company-data **65% on 23
eligible calls/30d**, flagged-only and deferred because failures span one
day. Spun off as task `task_f23d8194` (parity retry, settlement-order test
anchor, authorization-window check) — not landed here: it touches the paid
rail's settlement order and wants its own reviewed change.

## B. Overnight health (window 10-02T09:18Z → 10-10T~07:00Z)

**Vendor Control Tower** — ACTION NEEDED, no new substance: OpenRegister
**474/500** (reset 2026-10-07 happened; resets 2026-11-06); Serper
46,951/50,000, **prepaid allowance expires 2026-11-08 (29 days)** — new
warning crossing its threshold; ~47k queries will lapse unused at current
pace (sunk; buying more is founder-gated, nothing to ask now). Dilisense ok;
self-hosted Browserless ok. Standing warnings: anthropic/cdp spend unreported,
eSortcode no balance endpoint, cobalt-intelligence / einsearch / sec-api-io
without vendor-account records.

**`fixtures:drift`:** 1 actionable — `german-company-data` suite
`69a00c0a-…` production `{"company_name":"Google"}` vs manifest
`{"company_name":"SAP SE"}`, 1 run 0 passed. Fixed in D.

**`scheduled:outcomes`:** exit 1 — `weekly-drift.yml` 8 consecutive failed
scheduled runs; latest 37334038106 (2026-10-05T15:35Z). **Cause changed:**
`--log` shows **0** "password authentication" lines; the red is real
findings — `fear-greed-index` `output_field_reliability` manifest↔DB drift
and the vendor-roster reconciliation (`ROSTER_VENDOR_UNREGISTERED` 90 and
`REGISTER_VENDOR_NOT_ON_ROSTER` 77 distinct lines, each printed twice).
Second source: the 10-02 manual run 36986562098 has the **identical** counts
(180/154 raw), so nothing new — and the 10-02 record's "six" roster names
was a sample, not the count. The checker's "register mechanisms blind
meanwhile" line is therefore wrong since 10-02: the database checks ran.
Instrument over-statement (F4 shape); owner: next session — teach
`check-scheduled-outcomes.mjs` to distinguish a run that failed on findings
from one that could not see, or clear the findings so the workflow goes green.
Other scheduled workflows green (M3 digest shadow daily 10-05..10-09, Stale
branches 10-05). CI on main green at `326a2154`.

**Alarms grouped, whole window, no row cap** (excluding `dependency_probe`,
`scheduler_heartbeat`, `situation_assessment`, `meta_monitoring`):

| slug | events | reading |
|---|---|---|
| platform | invariant_alert 94 (9 d), alert_sent 52 | all 94 `fixture_input_drift` = the German suite → fixed today. alert_sent: 16 revenue-heartbeat quiet-customer, 8 fixture-drift digests, test-budget notices |
| `uk-gazette-notice-search` | classification 95, invariant_violation 94 | standing Gazette 500; not for sale |
| `company-news` | invariant_alert 28 (5 d), classification 8 | `algorithmic_correctness_environmental_only` — GDELT 429, standing |
| `spanish-company-data` | invariant_alert 15, regression 3, classification 4 (2–3 d) | environmental-only; tail ended 10-08 |
| `vat-validate` | classification 15, regression 12, violation 10 (2–3 d) | VIES overloaded, standing upstream |
| `arxiv-search`, `eori-validate`, `us-product-recall-search`, `exchange-rate`, `currency-convert`, `slovak-company-data`, `forex-history`, `nl-energy-label`, `charity-lookup-uk`, `tech-stack-detect` | 3–13, environmental/upstream | single-cause upstream blips; none on a paying path this week |
| `us-company-data`, `french-company-data` | quality_floor flagged_only | both "burst, not a trend; deferred" — us: EDGAR 5xx (10-02 record); fr: the 10-05 429 burst above |
| — | quality_floor 8 ticks, capability_promotion 8 ticks | 0 quarantines, 0 promotions |

**Breakers:** only `us-court-search` open (since 2026-08-17, DQ-14).
**Deployed:** `GET /health` → `326a2154745b` = `origin/main` tip.

## B2. Stale work

- **PR #682** (M4 batch 7 → `m4/cutover`) — unchanged since 2026-09-13,
  MERGEABLE. Not touched (M4 whole-PR pass; delegated merge rule). Owner:
  next M4 session.
- Worktree `.claude/worktrees/agent-aa0d77d823b642e00` (`b7-fix-work`,
  another session's) — not touched (F12; never remove another session's
  worktree). Owner: next M4 session.
- `session-close-check --hygiene-only` from the primary checkout: see the
  end of this file.

## B3. Branch graveyard

No deletions. The `m4/*` heads cross one month ~10-12; all belong to the M4
programme. Owner: next M4 session.

## C. Decision queue

No `preauthorized_notice` item. DQ-33 updated (German correction written;
all six corrected; stays open for Petter). DQ-34 answered 10-02 — its sweep
now reads the database (above). DQ-27, DQ-14 unchanged.

## D. The work — block 0119

`apps/api/src/lib/startup-migrations.ts`
`runMigration0119_resyncGermanCompanyDataDependencyHealth`, registered after
0118: ledger-guarded; `UPDATE test_suites SET input = '{"company_name":"SAP
SE"}', baseline_output/_captured_at = NULL, test_mode = 'live'` where
`test_type = 'dependency_health' AND capability_slug = 'german-company-data'
AND input = '{"company_name":"Google"}'`; one `auto_fix` event per row. Exact
copy of the 0116 pattern.

**Verification of the value (DQ-33 said it could not be checked from
here):** production read-only — the capability's **live** `schema_check`
suite `6714cbe5-…` holds exactly `{"company_name":"SAP SE"}` and **passed at
2026-10-07T00:18Z**, twelve minutes after `69a00c0a-…` failed on "Google".
Exactly one row holds the Google literal. Cost: a passing run spends one
OpenRegister credit (474/500 left).

**Ledger:** `M062`, added by `check-migration-ledger.mjs --update`;
`known_overlaps` extended for all 13 columns M059 shares (notes state
disjointness; M040 only INSERTs German `known_answer` fixtures).
`npm run migrations:check` ok (62 blocks); `npm run migrations:test` ok.

**Tests:** `startup-migrations.test.ts` +5 cases (SET value + event, WHERE
scope, no-op, idempotent, bind-encoder shape) + block list + max block
number 118→119. 176/176. Discrimination: the five cases call a function that
does not exist pre-fix, and the max-number assertion failed (expected 119,
received 118) before the block registered — observed. Root `npm run
typecheck` exit 0.

**Deploy dependency (DEC-20260504-C):** `runStartupMigrations()` from
`index.ts` boot, as for 0114–0118. **Post-deploy check (next session):**
`startup_migration_ledger` row `0119_resyncGermanCompanyDataDependencyHealth`
rows_affected 1; suite `69a00c0a-…` input `{"company_name":"SAP SE"}`; its
next run passes; `fixture_input_drift` stops.

**Review:** independent same-provider review in a separate context (fresh
read-only agent, sonnet): **PASS** on all five — faithful 0116 copy; only
the array entry + new function changed; predicate matches no other German
suite; M040 note verified (`l.3828-3870` INSERT-only; its one UPDATE is
screenshot-url/html-to-pdf); `self-heal.ts` / `test-input-drift.ts` patch
from the manifest (SAP SE), so nothing at runtime writes Google back. No
Codex-register row (DEC-20260910-A).

## E. Authorities updated

- `docs/company/GOALS.md` — one entry: week of 09-28 close, the surge did
  not hold, second-tier habits.
- `docs/company/DECISION-QUEUE.md` — DQ-33 update 2026-10-10.
- LESSONS.md unchanged: the weekly-drift "blind" over-statement is recorded
  here with an owner; not yet a material wrong conclusion.

## Next session

1. **Verify block 0119 in production** (above) — ledger row, input, next
   pass, `fixture_input_drift` gone.
2. **Close the week of 10-05** (Monday): expect ~€35–40, ~85% one buyer.
3. **weekly-drift**: fix the "blind" over-statement in
   `check-scheduled-outcomes.mjs` or clear `fear-greed-index` drift + the
   roster reconciliation so the Sunday 10-11 run can go green.
4. x402 retry parity — `task_f23d8194` if not taken.
5. Decode revenue-heartbeat alert keys: which payer has been quiet 8 days.
6. M4 branches cross one month ~10-12 — M4 session's call.

## B2b result (hygiene, primary checkout)

`session-close-check --hygiene-only` from the trunk: **0 red, 2 yellow** —
today's handoff (this file, not yet on main when it ran); the same 16 M4-batch
local branches as 10-02 (oldest 28 d). Deleting them is the M4 session's
call. Owner: next M4 session.
