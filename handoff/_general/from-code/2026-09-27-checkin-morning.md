# 2026-09-27 — morning operating session

Intent: run the 2026-09-27 operating session under DAILY-RUN.md — measure the
business (last day of the week of 09-21), dispose of overnight health and
stale work, verify yesterday's block 0117 in production, take the last
standing platform alarm (Danish `lying_breaker`), and hand back the two
artifacts.

Proactivity level 5. Everything below is second-sourced or marked
`unverified:`. **Previous run: 2026-09-26** (gate passed 06:53:14Z), so every
health window starts at **2026-09-26T06:53Z** (~24 h). This run started
~06:05Z from batch worktree **`strale-wt-checkin-0927`** at `origin/main`
`21e1436e` (copied the trunk's two ignored `.env` files in; no tracked change).
The stale plain directory `C:\Users\pette\Projects\strale-wt-checkin`
(deregistered 09-25 worktree remnant, no `.git`, no junctions per the 09-26
record) is still there; not touched, same reasoning as 09-26 (F12). Owner:
next attended session or Petter.

---

## Headline

1. **The largest buyer has nearly stopped buying from us — and still has
   money.** Daily spend €2.95 (09-25), €0.44 (09-26), €0.02 (09-27 by 07:00Z);
   every product dropped together. Its wallet holds 123.96 USDC and paid $14
   to other suppliers in the last 24 h; $0.50 of that reached us. Our side is
   clean (settlements, refusals, 402 challenge, catalogue all normal).
   `unverified:` substitution vs a shrink in its own work.
2. **Block 0117 verified in production**; `compliance_profile_completeness`
   and `fixture_quality` stopped at 2026-09-26T05:14Z (last tick before the
   deploy).
3. **Block 0118 written** — clears the last month-old alarm (Danish
   `lying_breaker`) by nulling one provably false value. Yesterday's
   hypothesis ("the writer stopped updating the row") is **falsified**: only
   customer-path calls write the breaker, and there have been none since
   2026-08-16.
4. Overnight: `cz-unreliable-vat-payer` recovered by itself (37 of 39 runs
   pass since 09-26T06:07Z); three Dutch CBS capabilities had a ~10 h
   upstream outage (13:27–23:07Z) and recovered. Zero customer calls to any
   of them.

---

## A. Business measurement

`commercial-brief.ts` and `ceo-dashboard.ts`, production read-only.

```
2026-09-21     €31.62    474 calls  [in progress, day 7 of 7 — NOT comparable]
2026-09-14     €62.31   1038 calls
2026-09-07     €51.97   1082 calls
2026-08-31     €58.77   1168 calls
2026-08-24     €73.03   1295 calls
2026-08-17     €66.31   1000 calls
```

Last completed week unchanged (rising; 11 payers; largest 83.4%, €51.99 vs
€10.32; 2 bought on >1 day; 7 paying days; new/returning `unavailable`).
Week in progress: 8 payers, largest 70.6% (€22.32 vs €9.30). Dashboard:
revenue €34.74 rolling 7d, buyers 35, identity 100%, spend €1.64. Quiet list
**10** (was 9): new entry €5.07 at 7 d — wallet `x402:v1:42a6533c…`, last
bought 2026-09-20T04:38Z; largest still €6.64 at 20 d.

**Second source — `payerFacts`** (throwaway script, scratchpad, not
committed): week of 09-21 = 2232 + 897 + 20 + 5 + 2 + 2 + 2 + 2 = **3162 c
= €31.62**, equals the pack; largest 2232/3162 = **70.6%**, equals the pack;
€0 unattributed. Since 09-26T06:53Z: 3 payers, €0.93 — largest €0.46/9
calls, account buyer €0.45/2, one new wallet `x402:v1:59273355…` €0.02
(jwt-decode).

**The largest buyer (`x402:v1:e9e672ef…`)** — per UTC day 09-21..09-27:
974, 220, 284, 413, 295, **44, 2** c; calls (all statuses, its rows only)
97, 48, 75, 93, 21, 10, 1. Failures 1/5/12/8/0/2/0, none charged. Slug mix
09-14..09-24 → 09-25..09-27: image-to-text 171 → 0, phone-validate
101 → 1, email-validate 93 → 0, serp-analyze 75 → 0, base64 63 → 5,
email-deliverability 51 → 0, exchange-rate 51 → 5, adverse-media 42 → 0,
sanctions 16 → 0, German 16 → 0. **Buyer-wide, not product-specific.**

Our side, checked five ways:
- `x402_settlement_intents` per day: 59/96/43/63/88/21/8/2, every one
  `recorded`, no failure reason — tracks the calls, nothing stuck.
- `failed_requests` from its client UA `Deno/2.7.14`: 0–20/day, flat; no
  spike. `x402_not_on_rail` overall flat (~1,900–2,050/day since 09-20).
  Its off-rail asks are small and deliberate (keyword-suggest 50 in 30 d,
  product-search 8 — both deactivated, product-search under DEC-20260427-H-4).
- `POST /x402/serp-analyze`, `/image-to-text`, `/adverse-media-check`
  without payment → 402 with a full challenge (4.3 KB, 2.7 KB, 4.6 KB);
  `GET /x402/catalog` 200 listing all five of its top slugs;
  `/.well-known/x402.json` 200.
- Alarms fired as designed: `x402-settlement-volume-drop` 09-25T21:48Z
  (26 vs ~86/day) and 09-26T22:10Z (5 vs ~72); revenue-heartbeat for this
  payer 09-26T05:26Z and 20:41Z.
- Deployed commit `21e1436e43d2` = `origin/main` tip.

**On-chain second source** (public `mainnet.base.org`, read-only; scratchpad
`chain.mjs`, `outflows.mjs`; `eth_getLogs` is now capped at **2,000 blocks**
per request, not 10,000 as the 09-04 memory says). Latest settlement
`0xf406fa89…` resolves to payer **`0x9d3d9410…61d837`** (same wallet as 09-04).
USDC balance: 3.07 (144 h ago) → 273.55 (120 h) → 250.85 → 197.69 → 183.93
→ 170.38 → 137.96 (24 h) → 133.11 → 124.17 → **123.96 now**. Outgoing USDC
by recipient, per 24 h bucket (Strale payTo `0x66d7c2f9…`):

| window | total | Strale | kadec0 `0x4df6…` | Trends `0x9aac…` | blockrun `0xe903…` |
|---|---|---|---|---|---|
| 0–24 h | $14.00 / 190 | $0.50 / 9 | $3.34 / 76 | $3.40 / 68 | $6.70 / 30 |
| 24–48 h | $46.01 / 6,497 | $2.95 / 16 | $4.86 / 126 | $3.85 / 91 | $33.63 / 6,204 |
| 72–96 h | $253.16 / 895 | $2.79 / 51 | $3.19 / 95 | $2.63 / 65 | $244.42 / 671 |
| 96–120 h | $22.58 / 2,864 | $2.52 / 50 | $2.59 / 73 | $1.90 / 38 | $15.24 / 2,679 |

Recipients identified on x402scan (public): `0x4df6…` = `api.kadec0.xyz`
(40 search/scraper/utility resources, $0.01–0.15); `0x9aac…` =
`google-trends.use.x402atlas.com`; `0xe903…` = `blockrun.ai` (LLM routing,
chat completions). All three already in the 09-04 customer profile — no new
supplier appears. Our share of its non-LLM spend: ~35% → 32% → 24% → **7%**.
Reading: its on-demand work (LLM + us) shrank; its steady lookups (kadec0,
Trends) did not. `unverified:` substitution vs task-mix change. No outreach
(charter customer-data boundary). Strale's on-chain receipts reconcile with
our ledger (24–48 h $2.95 / 16 ≈ 09-25's €2.95 / 21).

**Account buyer (`user:v1:e3c68534…`)**: bought every day 09-21..09-27,
€8.97 week. `company-tech-stack` at 02:42Z on 09-25/26/27 (02:23Z 09-24) — a
daily job; the 09-25 ~90-min `stock-quote` cadence did not recur. No
outreach (DQ-21).

## B. Overnight health

**Vendor Control Tower** — ACTION NEEDED, no new substance: OpenRegister
**291/500** (unchanged since 09-24), resets 2026-10-07T00:05Z; Serper
47,079/50,000; Dilisense ok; Browserless self-hosted ok; same six standing
warnings (anthropic/cdp spend unread; esortcode; cobalt-intelligence,
einsearch, sec-api-io — DQ-30).

**`fixtures:drift`**: Nothing (326 suites, 350 manifests).
**`scheduled:outcomes`**: exit 1 — `weekly-drift.yml` 6 consecutive failed
scheduled runs, last green 2026-08-10, latest 35607072076 (09-21). **Today's
Sunday run is due ~13:40Z, after this session**; outcome for the next run to
record. DQ-34 unchanged.

**Alarms grouped, whole window, no row cap** (`health_monitor_events` since
09-26T06:53:14Z excluding probe/heartbeat/meta/assessment):

| slug | events | reading |
|---|---|---|
| platform | invariant_alert 24, alert_sent 6 | **halved from 48**: only `lying_breaker` ×12 and `fixture_input_drift` ×12 remain |
| `nl-housing-price-index`, `nl-housing-stats`, `nl-woz-value` | 10 classification + 8 invariant_violation + 2 upstream_escalation each | **new**, CBS outage — below |
| `uk-gazette-notice-search` | 24 / 12 / 1 | standing Gazette 500; not for sale |
| `cz-unreliable-vat-payer` | invariant_violation 6, classification 2 | recovered — below |
| `slovak-company-data` | invariant_alert 4 | standing (harness timeouts) |
| `page-speed-test` | invariant_alert 3, classification 1 | single cause, no customer |
| `company-news` | 2 / 2 | 3 "fetch failed" of 9 runs; 0 customer calls (2 d) |
| `academic-paper-search`, `ssl-check` | regression_detected 1 each | single events |
| `country-economic-indicators`, `tech-stack-detect`, `us-product-recall-search`, `danish-company-data` | 1–2 classification | single events |
| — | quality_floor 1, capability_promotion 1 | ticks, 0 decisions |

**Block 0117 verified (DEC-20260504-C post-deploy):** all six `cz-*`
capabilities `geography = 'eu'`; the three adverse-media known_answer inputs
are `{"name": "Wirecard AG"}` ×2 and `{"name": "Spotify Technology SA"}`,
`updated_at` 09-26T06:49:46Z; `startup_migration_ledger` has
`0117_clearStandingCatalogueAlerts` at 06:49:46Z, rows_affected **8**.
`compliance_profile_completeness` and `fixture_quality` last fired
09-26T05:14:31Z — none since, across 12 ticks.

**`fixture_input_drift`** went from 28 suites to 1 at 09-26T23:23Z. The 28
were `policy_refusal` (ALLOW_MATRIX context refusals on paid LLM
capabilities: translate, error-explain, sentiment-analyze, …); those
capabilities have not run a test since 09-21, so the drop is their failures
ageing out of the check's window, **not a fix**. The remaining one is
`german-company-data` `ambiguous_match`. Standing; no customer effect.

**Dutch CBS outage.** `nl-housing-stats`, `nl-woz-value`,
`nl-housing-price-index` failed "fetch failed" 09-26T13:27Z–23:07Z (10 each);
passing again since (last passes 05:19–05:55Z, 2.5–2.8 s real latency).
`who-called --days 2`: 0 account, 0 x402, 0 anonymous for all three. Other
`nl-*` (bag-address, energy-label, different upstream) passed throughout.
`unverified:` cause — `opendata.cbs.nl` times out from this machine (IPv4 and
IPv6, 20 s) while production reaches it, so a local probe cannot confirm
either way. Fetch-failed is not platform-wide: 33 of 12,076 test results on
09-26, five capabilities.

**`cz-unreliable-vat-payer`** — the 09-25 "every run failed" is over: since
09-26T06:07Z, 37 of 39 runs passed (two isolated fetch-failed at 18:34Z,
18:57Z), on the same deploy as the failures. Intermittent upstream, not our
code. The ministry endpoint answers 200 in 0.40 s from here. Zero customer
calls in 60 d (09-26 record). Closed as a watch; no delisting.

**Breakers:** `us-court-search` open since 2026-08-17 (DQ-14), unchanged.
**CI on main** green at `21e1436e` (CI, Coverage matrix, M3 digest shadow).
**Deployed = main tip.**

## B2. Stale work

- **PR #682** (M4 batch 7 → `m4/cutover`) — unchanged since 2026-09-13,
  `MERGEABLE`. Not touched (whole-PR M4 pass needed; follow-up lives in
  `rescue/wip-2026-09-17-b7-fix-work-171f7c3` and another session's worktree
  `.claude/worktrees/agent-aa0d77d823b642e00`). Owner: next M4 session.
- `session-close-check --hygiene-only` from the **primary checkout**: 0 red,
  2 yellow — today's handoff (this file, not yet committed then); **16**
  local branches 14+ days old (b3-fix2-local, b3-r10-work, b3-r7/r8/r9-work,
  b7-fix-work, local-b3-work, m4/b1c-entrypoint-check, m4/b1d-activate, …).
  All M4-programme batch branches (targets `m4/cutover`, not `main`);
  `b7-fix-work` is checked out in another session's worktree. None a month
  old. Deleting them is the M4 session's call. Owner: next M4 session.
- Stale `strale-wt-checkin` directory — see top.

## B3. Branch graveyard

Remote heads unchanged from 09-26 (`m4/*` ×7, `b3-fix2-local`,
`b3-r10-work`, `rescue/wip-2026-09-17-…`); oldest 2026-09-12. No deletions.

## C. Decision queue

No `preauthorized_notice` item exists. Open `your_call`: DQ-34 (weekly-drift
credential — carried in the brief), DQ-33, DQ-27, DQ-14 — unchanged, no
update lines added.

## D. The work — block 0118, the last month-old alarm

`lying_breaker` on `danish-company-data`, every invariant tick since
2026-08-25. Investigation, production read-only:

- **Writers.** `recordFailure`/`recordSuccess` are called only from
  `routes/do.ts` (lines 1681, 1773, 1875, 1955, 2271, 2305, 2765, 2868). The
  test runner calls only `recordTestEvidence` (`test-runner.ts:866`, gated
  by `shouldRecordTestEvidence`: passed AND known_answer AND no execution
  error), which is a no-op on a closed row; test failures deliberately never
  reach the breaker (comment above that call).
- **Traffic.** Danish transactions since 08-10: `test2@strale.io` 5 failed,
  last **2026-08-16T13:49:19.928Z**; `system@strale.internal` 165 failed,
  08-12T22:38:22.979Z → 09-27T00:08Z. Row: `last_failure_at` =
  `updated_at` = **2026-08-16T13:49:20.235Z**, total_failures 11,
  total_successes 0, state closed. The row is exactly as the last
  customer-path call left it. **Yesterday's "the writer stopped" is
  falsified** — nothing that writes it has been exercised since.
- **The false value.** `last_success_at` = 2026-08-12T22:38:22.974Z, 5 ms
  before the harness's first Danish transaction (status `failed`); zero
  passing test_results for the slug on 08-11/08-12. It is the pre-fix
  `recordTestEvidence` artefact the invariant was written to catch.

**Change** (branch `chore/checkin-2026-09-27`, commits `9fc9656a`,
`bac9cd51`):
- `startup-migrations.ts`: block **0118**
  `runMigration0118_clearDanishFalseBreakerSuccess` — `UPDATE
  capability_health SET last_success_at = NULL WHERE capability_slug =
  'danish-company-data' AND state = 'closed' AND total_successes = 0 AND
  last_success_at` in the one-second window around the false value; one
  `auto_fix` event; ledger-guarded. Does **not** use the alert's suggested
  remediation, which would add a failure that never happened.
- Ledger **M061**; added to the eight `health_monitor_events.*` /
  `startup_migration_ledger.*` known_overlaps entries with notes (append-only
  insert; own ledger key). No other block writes `capability_health`.
- Six tests in `startup-migrations.test.ts` (happy path; SET is exactly
  `last_success_at = NULL`, no failure fields; scope; nothing-matches;
  idempotent; no Date/Buffer bind); max-block 117 → 118.

**Verification:** predicate dry-read in production → exactly **1** row, and
it is the only lying-shape row (`lying_total` 1). `startup-migrations.test.ts`
171/171. Discrimination: new cases import a function absent on
`origin/main`; planted `SET … , total_failures = total_failures + 1` → the
"never invents a failure" case fails; planted `AND total_successes = 0` →
`AND true` → the scope case fails; both restored, 171/171.
`npm run migrations:check` ok (61 blocks); `migrations:test` 19/19. Root
`npm run typecheck` (incl. `typecheck:scripts`) exit 0 after building the MCP
and TS SDK packages in the fresh worktree.

**Review:** independent same-provider review in a separate context (fresh
read-only agent): **PASS**, all seven claims confirmed against production and
source (sole writers in `circuit-breaker.ts`; last `/v1/do` call 08-16; the
false timestamp 5 ms before a failed transaction, and *no* test_results rows
at all for the slug on 08-11..08-13; predicate matches 1 row; only
`digest-compiler.ts` reads the field and it is null-safe; tests discriminate).
One process note: the reviewer mutation-tested by editing the worktree file
despite a read-only brief; it restored it and the tree was verified clean
afterwards (`git status` empty before the next change). Future briefs should
say "mutation-test in a copy, never in the worktree". No Codex-register row
(DEC-20260910-A). CI's first run failed only on `handoff/README.md` index
staleness (a new handoff file); regenerated with `npm run archive:index`.

**Workload (DEC-20260504-B):** one row, once. **Deploy dependency
(DEC-20260504-C):** `runStartupMigrations()` from `index.ts`; 0118 is the
last entry in the exported block array. **Post-deploy check for the next
session:** `select last_success_at from capability_health where
capability_slug='danish-company-data'` → NULL; ledger has
`0118_clearDanishFalseBreakerSuccess` rows_affected 1; the next invariant tick
emits no `lying_breaker`.

## E. Authorities updated

- `docs/company/GOALS.md` — two entries: the largest buyer's near-stop with
  the on-chain evidence; the account buyer's daily 02:42Z job.
- DECISION-QUEUE.md, LESSONS.md unchanged (no family incident: the falsified
  hypothesis was caught before any write).

## Next session

1. **Verify block 0118** (queries above) and that `lying_breaker` stops.
2. **Close the week of 09-21** in the pack (Monday) — the first completed
   falling week under full identity coverage; record the decomposition
   (largest buyer vs others).
3. **Largest buyer:** is it back, and at what level? Re-run the on-chain
   outflow split (`outflows.mjs` shape: 2,000-block pages). If its steady
   spend with kadec0/Trends continues while ours stays near zero for a
   week, that is substitution evidence — compare what we sold it against
   kadec0's price list.
4. **Weekly-drift Sunday run** (DQ-34) — record today's ~13:40Z outcome.
5. Candidates: US private-company source research (IDEAS.md);
   adverse-media-check suites' `external_cost_cents = 0` on a paid
   capability; the invariant's remediation text still recommends inventing
   a failure — worth rewording to "null a provably false last_success_at";
   PR #682 / M4.
6. OpenRegister 291 — below ~110 before 10-07 re-opens the 08-27 trigger.
