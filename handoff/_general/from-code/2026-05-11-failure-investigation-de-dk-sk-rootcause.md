Intent: Diagnose three production failure modes surfaced by the 2026-05-11 identity-leg output map — DE OpenRegister quota burn (highest priority, with Petter's explicit null hypothesis that *internal research* did not consume the 50/mo budget), DK cvrapi.dk quota state, and SK api.statistics.sk 15 s timeouts. Read-only investigation; fixes deferred.

# What shipped

Three root causes documented. Zero code changes to platform code. One diagnostic script left in the repo (mirrors the `dk-cvr-retry-2026-05-06.ts` precedent for one-off investigation tooling).

## DE — root cause: scheduler-driven internal traffic, not external customers

**Null hypothesis confirmed: Petter's manual research did not burn the quota.** But the broader hypothesis ("something other than internal usage is consuming OpenRegister calls") is **false**. 100 % of the burn comes from Strale's own scheduled-test infrastructure writing transactions as `system@strale.internal`.

- 508 of 533 (95 %) of 60-day `german-company-data` transactions are from the internal system user.
- Mechanism: [`apps/api/src/lib/test-runner.ts:1208-1222`](apps/api/src/lib/test-runner.ts#L1208-L1222) writes a `transactions` row for each scheduled test execution. The scheduler in [`apps/api/src/jobs/test-scheduler.ts`](apps/api/src/jobs/test-scheduler.ts) dispatches free-cost (`external_cost_cents=0`) tests every hour with slug-hash stagger.
- The bug: `external_cost_cents=0` cannot distinguish "no per-call charge" from "free tier with hard monthly quota cap." OpenRegister is the second; the scheduler treated it as the first.
- Burn arithmetic: 5 test fixtures × ~3 OR API calls per burst × ~12 bursts/day = 36–60 calls/day. May's 50-call budget exhausted on/around 2026-05-07 16:29 UTC.
- Negative findings: no CI burn, no health-probe burn (OpenRegister not in dependency-manifest), no env-key sharing burn, no scraper/bot traffic, no piggyback monitor traffic. One real external customer made one call on 2026-04-09 and never returned.

**Recommended prevention (Petter-decides):** add a `quota_bound` flag on `test_suites` (or `capabilities`) so the scheduler excludes quota-capped free-tier capabilities even with `external_cost_cents=0`. Plus a 30/50 budget-consumption alert. Do NOT default to OpenRegister's paid tier without a customer attached (DEC-20260506-G).

## DK — root cause: daily-reset quota gets immediately re-exhausted; breaker isn't firing

- cvrapi.dk free tier is **daily** (~50/day), not monthly. Resets ~24 h.
- Strale's test scheduler hits ~96 calls/day (8-call bursts × ~12 bursts). Daily quota exhausts within hours of every reset, so DK has appeared "always exhausted" for most of May.
- `capability_health` for DK: `state=closed, consecutive_failures=1, total_failures=3, total_successes=0, last_success_at=2026-05-06`. `total_failures=3` is far below the hundreds of actual failures because **`recordFailure` is fire-and-forget at do.ts:1282/1772**, and the test runner fires 8 concurrent calls — calls 2–8 all `checkCircuitBreaker` and see `state=closed, consecutive_failures=0` before call 1's `recordFailure` has committed. None of them trip the breaker. This is a real race in the breaker's interaction with the test-runner burst pattern.
- The 2026-05-06 manual containment (`UPDATE capability_health SET state='open'`) auto-recovered when the next call hit cvrapi.dk during a brief successful window, then quota hit again.

**Recommended fix shape (two pieces, both small):**

1. DK executor: prefix quota errors with `capability-unavailable:` to match DE's pattern at [`german-company-data.ts:117`](apps/api/src/capabilities/german-company-data.ts#L117). **AND** patch `do.ts:1771-1772` so a `capability-unavailable:`-prefixed error returns HTTP 503 `error_code=capability_unavailable` instead of HTTP 500 `execution_failed`. Without the route-side change, the executor's prefix is decoration.
2. Fix the breaker race: make test-runner's `recordFailure` awaitable on the test-runner path; keep customer path fire-and-forget. Two-line change, scoped.

**Source-diversification options (listed not recommended):** cvrapi.dk paid tier (exists, pricing not public, email them); datacvr.virk.dk system-to-system direct (free, formal application via `cvrselvbetjening@erst.dk`; the licensed-bulk path per DEC-20260428-A); Bisnode/Dun & Bradstreet DK; CVRHub.dk (unverified).

## SK — root cause: persistent upstream degradation, not entity- or environment-specific

- 6/6 attempts timed out at 15 s budget across 3 cross-source-verified IČOs (Tatry MR 31560636, Slovak Telekom 35763469, VSE Holding 36211222).
- Independent bare-curl probe to `api.statistics.sk/rpo/v1/` from local egress: timeout >30 s. Host base path responds in 0.4 s with 404; the `/rpo/v1/*` subtree is unresponsive right now.
- Historic prod: 4 % success rate over last 5 days. Successful SK calls land in 0.8–7.6 s. Today: 0 % success.
- Not in the SI onboarding-pipeline-missing pattern (SK is in prod DB and being called as `slovak-company-data`, just timing out).

**Recommended fix path:** ship the `upstream_timeout` structured error code first per DEC-19 (cheapest, makes the failure shape honest). Defer timeout expansion (15→25 s + one retry) until customer signal demands it. Don't touch the upstream endpoint set yet — orsr.sk scraping is blocked by DEC-20260428-A Tier 1, finstat.sk is a commercial vendor decision, ORSF is unverified.

# Cost

- €0 from Strale test wallet (SK upstream is free; no wallet debit; prod DB queries read-only via railway ssh).
- 7 SK upstream calls + 3 curl probes = 10 of 20 cap used. Well under.

# Files produced

- [`c:\tmp\failure-investigation\report.md`](c:/tmp/failure-investigation/report.md) — full consolidated report with mechanical OpenRegister-dashboard cross-check queries Petter can run.
- [`c:\tmp\failure-investigation\diag-output.json`](c:/tmp/failure-investigation/diag-output.json) — raw prod DB diagnostic dump (4373 lines).
- [`c:\tmp\failure-investigation\summary.txt`](c:/tmp/failure-investigation/summary.txt) — pretty-printed diagnostic summary (1109 lines).
- [`c:\tmp\failure-investigation\diag-de-dk-sk.mjs`](c:/tmp/failure-investigation/diag-de-dk-sk.mjs) — read-only diagnostic script (executed once via `railway ssh --service strale` + base64 piping; the `_diag.mjs` file on Railway was removed by the same command via `rm -f` after execution).
- ~~`apps/api/src/scripts/sk-timeout-investigation-2026-05-11.ts`~~ — SK test script. **Deleted at session close** per Petter's call: the script was purpose-built for this investigation (3 hardcoded IČOs, fixed attempt counts) and didn't generalize like the `audit-live-registries.ts` family. Implicit policy this sets: investigation scripts default to delete; only generalizing diagnostic tooling gets committed. Local copy preserved at `c:\tmp\failure-investigation\sk-test.mjs` (the earlier draft) and the .ts source is reproducible from this handoff's content.

# Non-obvious learnings

- **`recordTestQuality` writes to `transactions`.** [test-runner.ts:1209](apps/api/src/lib/test-runner.ts#L1209) inserts a transactions row for every scheduled test execution, attributed to `getSystemUserId()`. The `system@strale.internal` user (`374b977e-42d9-432a-ac72-fd0893a24a45`) was created 2026-03-03 for this purpose. Daily-digest analytics already excludes this user — but that's just analytics; nothing stops the calls themselves.
- **`external_cost_cents` is the wrong gate for quota-bound free APIs.** The scheduler uses it as a binary "free vs paid" filter, but OpenRegister is `€0/call + 50/mo cap` — neither "paid" nor "free-unlimited." The schema needs a `quota_bound` semantic.
- **`capability-unavailable:` prefix is decoration without route-side support.** I noticed DE's executor already uses the prefix on HTTP 429, but do.ts doesn't pattern-match on it — both DE 402s and DK quota errors get serialized as `error_code=execution_failed` with HTTP 500. The prefix is currently a human-readable annotation only; making it load-bearing requires touching do.ts:1771-1772 (the sync-path error mapper).
- **Methodology Rule 3 (domiciliation) on holding entities is non-trivial.** VSE Holding a.s. (36211222) has Slovak Republic 51 % + E.ON 49 % shareholders; the legal entity itself is registered at Košice court Sa 1203/V (SK-domiciled), so it returns SK registry data. Confirmed via orsr.sk + finstat.sk. The DIČ-vs-IČO trap from the 2026-05-11 prompt for Tatry MR (which used `SK2020428036` — a DIČ — as if it were the IČO) was avoided this run.
- **Railway SSH base64-piping pattern is the right shape for ad-hoc prod queries.** `B64=$(cat script.b64) && railway ssh --service strale -- "echo '$B64' | base64 -d > /app/_diag.mjs && cd /app && node _diag.mjs && rm -f /app/_diag.mjs"`. The `cd /app` is load-bearing (ESM resolution to `/app/node_modules`); the `rm -f` at the end cleans up. `railway` CLI must be invoked from the project root for the linked-project context to apply.

# What's open (Petter-decides)

1. **OpenRegister dashboard cross-check** — the report has mechanical queries (Strale-side counts + expected OR-side count of ~50 from Railway US-East IP range, exhausted on/before 2026-05-07 16:29 UTC). If OR-side count exceeds 50 for May 1–7, there's a hidden caller; flag for follow-up.
2. **DE fix-path decision** — `quota_bound` flag (recommended), price-fudge on `external_cost_cents`, or executor-level budget guard.
3. **DK fix-path decision** — wire `capability-unavailable:` prefix on executor + route-side mapper change in do.ts + breaker race fix on test-runner path. Three small pieces, two small PRs.
4. **SK fix-path decision** — ship `upstream_timeout` error code first. Defer timeout expansion.

# Non-decisions made

No Decisions DB entries authored. No supersessions. No to-do mutations. No memory writes. All four "open" items above require Petter's call.
