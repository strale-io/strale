Intent: run the 2026-10-17 operating session under DAILY-RUN.md — the first
since 2026-10-10 — measure the business over the gap, sweep health over the
whole window, verify blocks 0119/0120 in production, dispose of open work,
and hand back the two artifacts.

# 2026-10-17 — morning operating session (run started 21:33Z)

Proactivity level 5. Everything below is second-sourced or marked
`unverified:`. **Previous completed run: 2026-10-10** (last activity
06:37Z); a manual status session ran 2026-10-13 ~20:00Z (block 0120). Health
windows start at **2026-10-10T06:37Z** (~7.6 days). Batch worktree
`strale-wt-checkin`, branch `chore/checkin-2026-10-17` from `origin/main`
`35596689`, `npm ci`, trunk's two ignored `.env` files copied in,
`mcp-server` + `sdk-typescript` built for the root typecheck.

---

## Headline

1. **Run gap again.** `list_task_runs`: no runs 10-11..10-16; this run
   started 2026-10-17T21:33Z (23:33 Stockholm), not ~06:06Z. No failed
   entries (unlike the 09-29..10-01 weekly-limit failures). `unverified:`
   cause — machine off/asleep is the likely reading, as on 10-03..10-08.
   Second consecutive week with a multi-day hole; nothing customer-facing
   broke in it (below).
2. **Week of 10-05 closed €44.50** (falling from €53.35; 88.7% one buyer).
   **Week of 10-12 is €71.95 at day 6**, 94.2% one buyer — €1.08 short of
   the best completed week on record (08-24, €73.03) with a day to go.
3. **The largest buyer doubled its daily level** (~€5.6/day → ~€11.8/day)
   and held it six days. Everyone else shrank (€5.03 → €4.14).
4. **Classifier fix (F1 row 9):** the Polish registry's HTTP-200 HTML
   maintenance page was being scored `capability_bug` because a generic
   rule pre-empted the HTML-page rule that exists for exactly this case.
5. **Blocks 0119 and 0120 verified live.** The weekly drift sweep went green
   on a manual dispatch 10-13; the first scheduled run after the fix is
   Monday 10-19.
6. **PR #698 merged** (Petter's 10-15 instruction: times for Petter in
   Stockholm local time). Applied in today's brief.

---

## A. Business measurement

`commercial-brief.ts`, `ceo-dashboard.ts` — production read-only.

```
2026-10-12     €71.95   1304 calls  [in progress, day 6 of 7 — NOT comparable]
2026-10-05     €44.50   1093 calls
2026-09-28     €53.35   1079 calls
2026-09-21     €36.13    535 calls
2026-09-14     €62.31   1038 calls
2026-09-07     €51.97   1082 calls
```

Last completed week (10-05): falling; 10 payers; largest 88.7% (€39.47 vs
€5.03; prior week 94.0% across 8); 4 bought on >1 day; 7 paying days;
new/returning `unavailable`. Quiet list 10 (largest €6.66 at 17 d).
Dashboard: revenue €83.54 rolling 7d, buyers 23, identity 100%, spend
€2.71 (estimated).

**Correction to the 10-10 record:** it forecast week 10-05 at "~€35–40";
it closed €44.50 because Sunday 10-11 carried €11.24 — the first day of the
step-up. GOALS.md entry corrected in place of a new forecast.

**Second source — `payerFacts`** (scratchpad `payers.mts`, not committed):
week 10-05 = **4450 c**, largest `x402:v1:e9e672ef…` 3947 c = 88.7% —
equals the pack. Week 10-12 so far 7195 c, largest 6781 c = 94.2% — equals.
€0 unattributed in every window.

**Largest buyer per UTC day** (c / calls): 10-10 229/41, 10-11 1064/231,
10-12 1291/291, 10-13 1268/166, 10-14 1205/110, 10-15 846/179, 10-16
1409/322, 10-17 762/147 (to ~21:50Z). First slug of each day varies
(sanctions-check, whois-lookup, backlink-check, address-geocode, …) — a
broad basket, not one workload.

**Others, week 10-12:** account buyer `user:v1:e3c68534…` 156 c on 3 days
(was 335 c on 6); wallet `x402:v1:6bfcaec6…` 200 c on 10-12 (+25 c 10-11),
image-to-text, not since; `x402:v1:2e55b616…` nothing since 10-11; five
others ≤ 29 c. DQ-21 stands: no outreach.

**Revenue-heartbeat alerts decoded** (the 10-10 record's item 5): keys are
`revenue-heartbeat:<payer key>`. In the window: `x402:v1:59273355…` (the
nightly jwt-decode wallet) to 229.9 h, last alert 10-11 15:15Z, then stops;
`user:v1:e3c68534…` 12.4 h → 97.4 h, resets, 14.4 h on 10-17 (it bought
10-17 01:50Z); `x402:v1:2e55b616…` 78.6 h → 139.6 h (10-17 10:06Z),
still quiet. `unverified:` why the 59273355 sequence stopped alerting
(a cap on alert age is the likely reading; not checked in code).

## B. Overnight health (window 10-10T06:37Z → 10-17T~21:50Z)

**Vendor Control Tower** — ACTION NEEDED, no new substance. OpenRegister
**430/500** (474 on 10-10; resets 2026-11-06). Serper 46,899/50,000,
**allowance expires 2026-11-08 (22 days)** — ~47k queries lapse unused
(sunk; nothing to buy or ask). Dilisense, self-hosted Browserless ok.
Standing warnings unchanged (anthropic/cdp spend unreported, eSortcode no
balance endpoint, cobalt-intelligence / einsearch / sec-api-io without
vendor-account records).

**`fixtures:drift`:** nothing actionable (326 suites, 350 manifests).

**`scheduled:outcomes`:** exit 1 — `weekly-drift.yml` 9 consecutive failed
*scheduled* runs, latest 38277962347 (2026-10-12T16:31Z), which predates
block 0120. The manual dispatch 38462997668 (2026-10-13T20:27Z, after 0120
deployed) **succeeded**. Per the check's own rule a manual run is not
evidence the cron is healthy; first scheduled proof is Monday 10-19. The
10-10 record's "blind over-statement" owner item is moot if that run is
green. Other scheduled workflows green (M3 digest shadow daily 10-14..10-17).
CI on main green.

**Blocks verified in production (DEC-20260504-C):**
- `startup_migration_ledger`: `0119_resyncGermanCompanyDataDependencyHealth`
  applied 2026-10-10T06:36Z rows 1; `0120_declareFearGreedAttribution`
  2026-10-13T20:26Z rows 1.
- German `dependency_health` suite `69a00c0a-…` input
  `{"company_name":"SAP SE"}`, mode live. `fixture_input_drift` absent
  from the window's platform alerts (was 94 last window).
- `fear-greed-index` `output_field_reliability ? 'attribution'` = true.
- **German suite has not run since 10-07, by design:**
  `capability_budget_counters` window 2026-10-07 monthly, `test_count 2 /
  budget_cap 2` (capability `quota_cap 45`, `quota_reset_dom 7`). The two
  test slots went on 10-07 (the Google run) and 10-10 06:54Z (the
  `negative` suite, input `{}` — refused before any OpenRegister call, yet
  it consumed a slot). So the corrected input first runs on/after
  2026-11-07. `unverified:` that it passes — the live `schema_check` suite
  on the same SAP SE input passed 10-07. **Minor instrument inefficiency
  (owner: next session, low):** a test refused at input validation spends a
  scarce monthly test slot without spending a vendor credit.

**Alarms grouped, whole window, no row cap** (excluding `dependency_probe`,
`scheduler_heartbeat`, `situation_assessment`, `meta_monitoring`):

| slug | events | reading |
|---|---|---|
| `uk-gazette-notice-search` | violation 41 (8 d), classification 15, alert 5 | standing Gazette 500; promotion refused 10-17 ("known_answer 0/9"); not for sale |
| platform | alert_sent 35 | 21 revenue-heartbeat (decoded above), rest test-budget notices |
| `polish-company-data` | classification 32, regression 13 (10-16..17) | **KRS API maintenance page** — see D |
| `company-news` | alert 18 (6 d), classification 7 | GDELT, environmental-only, standing |
| `eori-validate` | violation 16 (3 d), classification 3 | see below |
| `us-product-recall-search`, `slovak-company-data`, `charity-lookup-uk`, `tech-stack-detect`, `eu-regulation-search`, `arxiv-search`, `latvian-company-data`, `npm-package-info`, `protocol-tvl-lookup`, `irish-company-data`, others | 1–11 each | single-cause upstream blips; none on a paying path this week |
| `french-company-data` | quality_floor flagged 8 ticks | still "65% on 23 calls/30d, burst, deferred" — the 10-05 429 burst; ages out ~11-04 |
| — | quality_floor 8 ticks, capability_promotion 8 ticks | 0 quarantines, 0 promotions |

**`polish-company-data`** — `who-called --days 7 --errors`: 421 calls, all
harness; 0 account, 0 x402, 0 anonymous. 24 × `Unexpected token '<' …
<html>…`, 8 × fetch failed, rest correct refusals. Direct probe of
`https://api-krs.ms.gov.pl/api/krs/OdpisPelny/0000028860?rejestr=P&format=json`
(free, no auth) ×3 at ~21:40Z: **HTTP 200, `text/html`, title "Przerwa
techniczna"** (technical break). Upstream maintenance since ~10-16 14:20Z.
No customer impact. Executor still returns the raw parse error to a caller
during maintenance — owner: next session, low (no paying caller in 30 d):
check content-type in `fetchByKrs` and throw a "temporarily unavailable"
message.

**`eori-validate`** — 418 calls, all harness. When the EU EORI SOAP service
is down the executor returns `valid: null` with a "format validation only"
note (documented limitation); the manifest declares `valid` guaranteed
boolean, so the correctness check fails and the
`algorithmic_correctness_floor` invariant fires (83%, "provider_health
verified_healthy" — the probe hits a host that answers while the SOAP call
fails). Contract-vs-degraded-mode mismatch, F1 shape. Owner: next session;
choose between declaring `valid` nullable in the contract or classifying the
degraded-mode output as environmental. Not done here.

**Breakers:** only `us-court-search` open (since 2026-08-17, DQ-14).
**Deployed:** `GET /health` → `35596689eeba` = `origin/main` at run start;
after #698 merged, main is `51bedd3c` (docs-only; deploy not re-checked —
verify at the next session along with this PR's merge).

## B2. Stale work

- **PR #698** (`claude/trusting-albattani-ljrso7`, draft, docs-only, 10-15,
  Petter's instruction, CI green, CLEAN): reviewed here (two identical lines
  in CLAUDE.md/AGENTS.md + inventory hashes), marked ready, squash-merged at
  head `80435282` with `--match-head-commit`. `git diff 80435282
  origin/main` empty. Remote branch deleted (no local ref existed); verified
  via `ls-remote`.
- **PR #682** (M4 batch 7 → `m4/cutover`) — unchanged since 2026-09-13.
  Not touched (M4 delegated-merge rule). The M4 programme has had no
  activity for **34 days**. Owner: next M4 session.
- Worktree `.claude/worktrees/agent-aa0d77d823b642e00` (`b7-fix-work`) —
  not touched (F12). Owner: next M4 session.

## B2b. Hygiene (primary checkout)

`session-close-check --hygiene-only` from the trunk: **0 red, 2 yellow** —
no handoff for today yet (this file, pre-merge); the same 16 M4-batch local
branches (oldest 36 d). Owner: next M4 session.

## B3. Branch graveyard

Remote has 10 non-main branches; all ten oldest are `m4/*`, `b3-*`, and
`rescue/wip-2026-09-17-b7-fix-work-171f7c3` — M4 programme property, with an
open PR into `m4/cutover`. No deletions. Owner: next M4 session.

## C. Decision queue

No `preauthorized_notice` item. DQ-33 (`your_call`, German correction —
all six corrected; open for Petter to close), DQ-27, DQ-14 unchanged. No
new entries.

## D. The work — classifier fix

`apps/api/src/lib/failure-classifier.ts`: step 4 (`CAPABILITY_BUG_PATTERNS`,
including `/unexpected token/i`) ran before step 6
(`UPSTREAM_EMPTY_PATTERNS`, including `/<html/i`, `/<!DOCTYPE/i`,
`/Unexpected token.*</i`), so every JSON-parse-of-HTML failure became
`capability_bug` (tier-2 interrupt at `test-runner.ts:832`, "internal" badge
in `interrupt-sender.ts`) and step 6's HTML patterns were dead. New
`HTML_BODY_PATTERNS` (`<!DOCTYPE`, `<html` — markup evidence only); step 4
skips when they match, so step 6 returns `upstream_transient` (medium).
`<thinking>`-style LLM parse failures stay `capability_bug`;
`validateByCapabilityType` still rewrites deterministic capabilities to
`capability_bug`.

**Population (production, 30 d):** 24 `capability_bug` classifications with
an HTML-parse snippet — all `polish-company-data`, 10-16..10-17. No other
capability affected; no customer traffic.

**Tests:** `failure-classifier.test.ts` +4 (HTML page → upstream_transient;
`<!DOCTYPE` → upstream_transient; `<thinking>` → capability_bug;
deterministic → capability_bug). Message reproduced verbatim from Node's
`JSON.parse` on the captured KRS body. **Discrimination observed:** against
the parent classifier 2 fail / 6 pass; with the fix 8/8. Adjacent:
`platform-refusal-breaker.test.ts`, `fixture-staleness-attribution.test.ts`
23/23. Root `npm run typecheck` exit 0.

**Review:** independent same-provider review in a separate context (fresh
read-only agent, sonnet): **PASS** on correctness (whole decision order
walked), deterministic guard, module-scope const, discrimination, other
callers (`test-runner.ts`, `internal-tests.ts`, `diagnostics/self-heal-check.ts`;
`self-heal.ts` has its own separate classifier, unaffected), style. Nit
accepted: two regexes duplicate entries in `UPSTREAM_EMPTY_PATTERNS`. No
Codex-register row (DEC-20260910-A).

**Deploy dependency:** none beyond the normal image build — the classifier is
imported by the test runner at request time. Post-deploy check (next
session): while KRS maintenance lasts, new `polish-company-data`
classifications read `upstream_transient`; if the maintenance has ended,
the check is moot — say so.

## E. Authorities updated

- `docs/company/GOALS.md` — one entry: the step-up, the correction to the
  10-10 forecast, the shrinking second tier.
- `docs/company/LESSONS.md` — F1 row 9; count line 7/8 → 8/9.
- DECISION-QUEUE.md unchanged.

## Escalation test (CHARTER)

Nothing escalated. Every finding was resolved by measurement or code
(classifier), is upstream (KRS, EORI SOAP, Gazette), or is owned by a named
next session.

## Next session

1. **Monday 10-19:** confirm the scheduled weekly drift run is green — the
   first scheduled proof since 2026-08-10.
2. **Close the week of 10-12:** likely passes €73.03 (record); concentration
   ~94%.
3. Verify this PR deployed (`/health` = merge commit) and the Polish
   classification flip (or KRS back up).
4. **x402 transient-retry parity** (10-10 record item 4, `task_f23d8194`) —
   not started; no commit on main since 10-10 touches
   `x402-gateway-v2.ts`. Highest-value engineering item: wallet payments are
   ~all revenue.
5. EORI degraded-mode contract decision (above).
6. Polish executor: clean "temporarily unavailable" error on non-JSON body.
7. `unverified:` why the scheduler skipped 10-11..10-16 and fired at 21:33Z.
8. M4 programme idle 34 days — the M4 session's call.
