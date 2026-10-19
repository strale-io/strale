Intent: run the 2026-10-19 operating session under DAILY-RUN.md — close week
10-12, verify the 10-18 classifier wiring fix in production, sweep the health
window, and land the x402 transient-retry parity fix deferred since 10-10.

# 2026-10-19 — morning operating session (run started 06:06Z, 08:06 Stockholm)

Proactivity level 5. Everything below is second-sourced or marked
`unverified:`. **Previous run: 2026-10-18** (06:06Z, merged #700). Health
window **2026-10-18T06:15Z → 2026-10-19T~06:15Z** (24 h). Batch worktree
`strale-wt-checkin`, branch `chore/checkin-2026-10-19` from `origin/main`
`a03c1e75`, `npm ci`, trunk's two ignored `.env` files copied in,
`mcp-server` + `sdk-typescript` built for the root typecheck.

---

## Headline

1. **Week 10-12 closed at €77.57 — the best completed week on record**
   (prior best 08-24, €73.03; previous week €44.50). **94.7% one buyer**,
   up from 88.7%.
2. **Yesterday's classifier fix works in production.** Polish
   classifications flipped from `capability_bug` to `upstream_transient`
   after deploy; KRS has since recovered (48 passes, 0 failures after 08:19Z).
3. **x402 transient-retry parity landed** (D) — wallet buyers now get the
   same one-retry-on-429/5xx the account rail has had. Customer evidence:
   eight lost paid French lookups on 10-05. LESSONS F8 incident 4.
4. Nothing customer-facing broke overnight.

---

## A. Business measurement

`commercial-brief.ts`, `ceo-dashboard.ts` — production read-only.

```
2026-10-19      €0.42     11 calls  [in progress, day 1 of 7 — NOT comparable]
2026-10-12     €77.57   1394 calls
2026-10-05     €44.50   1093 calls
2026-09-28     €53.35   1079 calls
2026-09-21     €36.13    535 calls
2026-09-14     €62.31   1038 calls
```

Growth: rising. Week 10-12: 7 payers, largest 94.7% (€73.43 vs €4.14),
€0 unattributed, 2 payers bought on >1 day, 7 paying days. New/returning
and first-purchase: `unavailable` (identity instrument younger than
lookback). Quiet list 11 (largest €6.66 at 18 d). Dashboard: revenue €77.22
rolling 7d, buyers 22, identity 100%, spend €2.58 (estimated).

**Second source:** `revenueCents` and `payerFacts` over
10-12T00:00Z → 10-18T23:59:59Z (scratchpad `week.mts`): both **7757 c**,
€0 unattributed. Payers: `x402:v1:e9e672ef…` 7343 c (7 days, last 10-18
23:17Z); `x402:v1:6bfcaec6…` 200 c (1 day, 10-12); `user:v1:e3c68534…`
156 c (3 days, last 10-17); four others ≤ 29 c, one day each. In the health
window only the largest bought (368 c, last 10-19 05:26Z). DQ-21 stands: no
outreach.

## B. Overnight health

**Vendor Control Tower** — ACTION NEEDED, no new substance. OpenRegister
430/500 (resets 11-06). Serper 46,897/50,000, prepaid allowance expires
11-08 (20 days; sunk, ~47k queries will lapse). Anthropic, Browserless Cloud,
CDP, Dilisense healthy. Standing warnings unchanged (anthropic/cdp spend
readings absent; esortcode no balance endpoint; cobalt/einsearch/sec-api-io
no account record).

**`fixtures:drift`:** nothing actionable (326 suites, 350 manifests).

**`scheduled:outcomes`:** exit 1 — `weekly-drift.yml` 9 consecutive failed
scheduled runs, latest 38277962347 (10-12), unchanged. **Today's scheduled
run (cron `0 7 * * 1`) had not fired at run time** (~06:20Z); GitHub has
been starting it ~15:30–16:30Z. It is the first scheduled run since block
0120 / the 10-13 manual green. Next session reads it.

**CI on main:** green at `a03c1e75` (CI, Coverage matrix, M3 digest
shadow). **Deployed:** `GET /health` → `a03c1e758596` = `origin/main` tip.

**Alarms grouped, whole window, no row cap** (`health_monitor_events`,
excluding `dependency_probe`/`scheduler_heartbeat`/`meta_monitoring`/
`situation_assessment`):

| slug | events | reading |
|---|---|---|
| `academic-paper-search` | invariant_alert 6, regression 1, classification 1 | **one** OpenAlex rate-limit failure (10-18 07:27Z) re-alerted every 2 h for 12 h; harness-only |
| `arxiv-search` | invariant_alert 5 (2 days), classification 1 | one timeout (10-18) + one HTTP 429 (10-19); harness-only |
| `uk-gazette-notice-search` | violation 5, classification 1, promotion held | standing Gazette 500, not for sale (x402 off, invisible) |
| `polish-company-data` | classification 3, upstream_escalation 3, regression 1 | KRS maintenance; fix verified (below); recovered |
| `company-news` | invariant_alert 2, classification 1 | GDELT, standing |
| platform | alert_sent 5 | revenue-heartbeat |
| `french-company-data` | quality_floor flagged_only | 65% on 23 eligible/30d, failures span 1 day → deferred; the 10-05 burst (D) |
| single classifications | `usgs-earthquake-search`, `us-product-recall-search`, `tech-stack-detect`, `charity-lookup-uk`, `protocol-tvl-lookup`, `ted-procurement` | one each, blips |

**arXiv / OpenAlex — the "two days" threshold was met, and it is
explained, not a defect.** The invariant is
`algorithmic_correctness_environmental_only` ("no correctness evidence
either way"): each alert is one environmental known-answer failure seen in
a rolling 12 h window, re-raised every ~2 h. Underlying failures:
arxiv-search 1/day on 10-17, 10-18, 10-19 (timeout, timeout, 429), with
passes the same days; academic-paper-search 1 on 10-18 (OpenAlex
rate-limit), 3 passes the same day. Second source: `who-called --days 7
--errors` — arxiv 23 calls, academic 19, **all harness**, 0 account / x402 /
anonymous. Not acted on. Observation for whoever next touches the invariant
checker: one failure producing ~6 alerts is amplification; `unverified:`
whether that is intended.

**Polish verification (10-18 next-session item 2).** `test_results`
`polish-company-data` not passed since 06:15Z: 06:19Z `capability_bug`
(pre-deploy image), 07:30Z and 08:19Z `upstream_transient` — same stored
reason string. `health_monitor_events` classifications agree (3 rows,
same verdicts). Since 08:19Z: 48 passes, 0 failures — KRS is back. Fleet
classification counts on failures since 06:45Z: upstream_transient 9,
upstream_changed 2, unknown 1, **capability_bug 0**.

**Breakers:** only `us-court-search` open (since 2026-08-17, DQ-14).
**Quarantines/promotions:** none executed; floor tick evaluated 145, 0
quarantined; promotion tick evaluated 12, 0 promoted, gazette held.

## B2. Stale work

- **PR #682** (M4 batch 7 → `m4/cutover`) unchanged since 2026-09-13; not
  touched (M4 delegated-merge rule). M4 idle **36 days**. Owner: next M4 session.
- Worktree `.claude/worktrees/agent-aa0d77d823b642e00` (`b7-fix-work`) not
  touched (F12). Owner: next M4 session.
- No other open PR; no branch ahead of main besides this run's.

## B2b. Hygiene (primary checkout)

`session-close-check --hygiene-only` from the trunk: **0 red, 2 yellow** —
no handoff for today yet (this file, pre-merge); the same 16 M4 local
branches (oldest 37 d). Owner: next M4 session.

## B3. Branch graveyard

`git ls-remote --heads origin`: 10 non-main branches, all M4 property
(`m4/*`, `b3-fix2-local`, `b3-r10-work`,
`rescue/wip-2026-09-17-b7-fix-work-171f7c3`). No deletions.

## C. Decision queue

No `preauthorized_notice` items in the file. DQ-33, DQ-27, DQ-14 (all
`your_call`) unchanged. No new entries.

## D. The work — x402 transient-retry parity (`task_f23d8194`)

**Finding (re-confirmed today).** `who-called --slug french-company-data
--days 30 --errors`: 34 calls — 33 x402 (12 completed, 21 failed), 1
account (completed), 0 harness. Of the 21: **8 × "French API returned HTTP
429"** (the 10-05 15:55–15:58Z burst found in the 10-10 record), the rest
correct refusals (ambiguous / not found / no confident match). Unbilled.
Code: `routes/do.ts` `executeWithRetry` retried non-deterministic executors
once (`withRetry`, 1 s, 429/502/503/504/network); `routes/x402-gateway-v2.ts`
wildcard handler called `await executor(inputs)` bare.

**Fix** (commit `813d29ba`):
- `lib/retry.ts` — `executeWithTransientRetry(executor, input, {slug,
  capabilityType})`: the old do.ts ternary verbatim.
- `routes/do.ts` — `executeWithRetry` calls it (no behaviour change);
  `withRetry` import dropped.
- `routes/x402-gateway-v2.ts` — the capability handler calls it inside the
  existing try, before settle. Failure path, settle order, payment-hash
  replay unchanged; 300 s authorization window absorbs the ~1 s wait.
- Solution handler (`executeSolution`) unchanged — out of scope.

**Tests.** New `lib/retry.executor-parity.test.ts`: behavioural (429 once →
served, 2 calls; second failure → original error; refusal not retried;
deterministic not retried) and structural (no bare `await executor(` in
either route; each calls the shared helper).
`x402-gateway-v2.settlement-order.test.ts` anchor retargeted to the helper
call; its ordering and catch-block checks are otherwise unchanged.
**Discrimination observed:** with `origin/main`'s gateway restored, the
gateway structural test fails (1 of 6); restored to the fix, 6/6.
Adjacent: `src/routes/do*`, `src/routes/x402*`, `src/lib/retry*`,
`src/lib/x402*` — 18 files passed, 6 skipped, 196 tests passed. Root
`npm run typecheck` exit 0.

**Review:** independent same-provider review in a separate context (fresh
read-only agent, sonnet) on `813d29ba`: **PASS-WITH-NOTES**, no payment-
safety defect; confirmed DEC-14 order, single settlement, replay untouched,
/v1/do equivalence, one invocation fact per request. Notes, all low and
accepted: (a) a retry can double upstream cost on a paid vendor — identical
to /v1/do; the caller is charged once; (b) `us-company-data.ts` keeps its
own inner `withRetry`, so up to 2×2 attempts — pre-existing on /v1/do, now
matched on x402; (c) worst case ~52 s latency on a 25 s-timeout executor,
inside the 300 s window; (d) the structural test is source-text based
(DEC-20260504-A exemption: no HTTP harness for the gateway). No
Codex-register row (DEC-20260910-A).

**Deploy dependency:** none beyond the image build (the route imports the
helper). **Post-deploy check (next session):** `GET /health` = merge
commit; then any x402 call whose first attempt hits 429/5xx shows a
`retry-attempt` warning in the logs and, if the retry succeeds, a completed
transaction. `unverified:` until a real transient occurs — there is no
zero-cost way to provoke one.

## E. Authorities updated

- `docs/company/GOALS.md` — week 10-12 closed at €77.57, 94.7% one buyer.
- `docs/company/LESSONS.md` — F8 incident 4, count 3 → 4; the due
  investigation's starting point named (enumerate every per-call policy
  do.ts applies around an executor and diff against the gateway). Not done.
- DECISION-QUEUE.md unchanged.

## Escalation test (CHARTER)

Nothing escalated. The one defect with customer impact was fixed, tested and
reviewed in this run; everything else is upstream, harness-only, or owned by
a named session.

## Next session

1. **Weekly drift scheduled run of 10-19** (expected ~15:30–16:30Z) — first
   scheduled proof since 2026-08-10. Read its conclusion.
2. Verify this PR deployed (`GET /health`).
3. **F8 investigation:** do.ts vs x402 gateway per-call policy diff
   (retry, billable-output, timeouts, input validation, free-tier, spend
   cap analogues) — the highest-value engineering item now that parity
   retry is in.
4. EORI degraded-mode contract decision (10-17 record).
5. Polish executor: clean "temporarily unavailable" error on non-JSON body.
6. Invariant-alert amplification (one failure → ~6 alerts) — decide whether
   intended.
7. M4 idle 36 days — the M4 session's call.
