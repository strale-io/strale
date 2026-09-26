# 2026-09-26 — morning operating session

Intent: run the 2026-09-26 operating session under DAILY-RUN.md — measure the
business, dispose of overnight health and stale work, verify yesterday's
Lithuanian delisting in production, take the three month-old platform alarms
this run was named fallback owner of, and hand back the two artifacts.

Proactivity level 5. Everything below is second-sourced or marked
`unverified:`. **Previous run: 2026-09-25** (gate passed 07:01:29Z), so every
health window starts at **2026-09-25T07:01Z** (~24 h). This run started
~06:05Z from batch worktree **`strale-wt-checkin-0926`** at `origin/main`
`3fb818ed` (copied the trunk's two ignored `.env` files in; no tracked change).

**Why a new worktree path:** `C:\Users\pette\Projects\strale-wt-checkin`
still exists as a plain directory — yesterday's worktree, deregistered from
git (`git worktree list` does not show it; no `.git` file) but with
`README.md`, `package*.json`, `packages/`, `scripts/`, `node_modules/` left
behind, all timestamped 2026-09-25 08:08–08:58. No junctions (`dir /AL`:
none). Per the task's hard rule ("if `git worktree remove` refuses, stop and
look"; LESSONS F12) this run did **not** delete it. It holds no tracked work
(not a repository). Owner: next attended session, or Petter — it is safe to
delete after confirming it contains no junction, which this run did. Recorded
so the next check-in does not collide with it.

---

## Headline

1. **Week in progress: the largest buyer is spending less** — €21.86 in five
   days against €51.99 the whole prior week; nothing so far today. Its
   failures are few and uncharged; the mix shifted to a smaller workload. The
   week closes Sunday; no conclusion drawn yet.
2. **The account buyer's stock quotes arrive about every 90 minutes** — five
   evenly spaced `stock-quote` calls on 09-25. Sixth active day of six.
3. **Unmet demand found:** on 09-18 the largest buyer asked `us-company-data`
   for 114 US companies; 103 were correct refusals (private companies, not in
   SEC EDGAR). It stopped calling after 09-19. Logged in IDEAS.md.
4. **Two of the three month-old alarms fixed** by deploy-time block 0117
   (Czech `geography`, adverse-media known-answer input). The Danish one is
   not, and why is below.
5. Lithuanian delisting **verified in production** (all three flags false;
   absent from `/x402/catalog`).
6. New: `cz-unreliable-vat-payer` "fetch failed" since the 09-25 deploy; zero
   customers in 60 days, already off x402. Recorded, not acted on.

---

## A. Business measurement

`commercial-brief.ts` and `ceo-dashboard.ts`, production read-only.

```
2026-09-21     €30.69    462 calls  [in progress, day 6 of 7 — NOT comparable]
2026-09-14     €62.31   1038 calls
2026-09-07     €51.97   1082 calls
2026-08-31     €58.77   1168 calls
2026-08-24     €73.03   1295 calls
```

Last completed week unchanged: `growth()` rising; 11 payers; largest 83.4%
(€51.99 vs €10.32); 2 bought on >1 day; 7 paying days; new/returning
`unavailable`. Week in progress: 7 payers, largest 71.2% (€21.86 vs €8.83).
Dashboard: revenue €37.92 rolling 7d (€50.12 yesterday; `unverified:` the
drop is mostly 09-18 leaving the window — €14.08 from the two main buyers
that day — against a smaller day entering; the dashboard's window edges were
not reconciled exactly),
buyers 36, identity 100%, spend €1.69. Quiet list 9, largest €6.64 at 19 d
(same membership as 09-25).

**Second source — `payerFacts`** (via `lib/metrics/commercial.ts`, throwaway
script in the session scratchpad, not committed):
- week of 09-21: 2186 + 852 + 20 + 5 + 2 + 2 + 2 = **3069 c = €30.69** —
  equals the pack; largest 2186/3069 = 71.2% — equals the pack. €0
  unattributed.
- since 09-25T07:01Z: 3 payers — largest `x402:v1:e9e672ef…` €2.73/16 calls;
  account buyer `user:v1:e3c68534…` €0.62/8; `user:v1:fa6a0cd5…` €0.02/1
  (vat-validate, new this week).
- largest buyer per UTC day, 09-14..09-20: 178, 1508, 1062, 478, 906, 755,
  312 c; 09-21..09-25: 974, 220, 284, 413, 295 c; 09-26: none (last call
  09-25T23:13Z).

**Largest buyer's mix** (read-only rows for that one payer hash, grouped by
week × slug × status): week 09-14 top earners serp-analyze €9.00,
image-to-text €8.15, sanctions-check €3.20, German €3.00; 112 failed
`us-company-data`. Week 09-21: adverse-media-check €8.00, seo-audit €3.30,
serp-analyze €2.25; 26 failures of 334 rows (image-to-text 7, base64 6,
German 5, job-board 3, price-compare 2, others 1 each), none charged. No
failure pattern on our side that would explain lower spend.

**`us-company-data` — the unmet-demand finding.** `who-called --slug
us-company-data --days 14 --errors`: 0 harness, **121 x402, 8 completed, 113
failed**; error strings are "No confident SEC EDGAR match for …" and "No US
company found matching …" for private software firms (Sysdig, Cyara,
Fireblocks, ActiveCampaign, Muck Rack, …). Per-day for that buyer: a
background of ~1 success + ~1 refusal on scattered days from 08-17, then
**09-18: 6 completed, 81 no-confident, 22 not-found, 5 "SEC EDGAR search
returned HTTP 500"**; 09-19: 2 refusals; nothing since. Quality floor tick
09-25T10:40Z: `enforce`, 156 evaluated, 0 proposals — the refusals are
correctly not counted against the capability (cf. GOALS 08-16 E3). Logged
in `docs/company/IDEAS.md` as `inbox`. Not escalated: a source is research
first; buying one would be spend and vendor contact, founder-gated only if it
leaves the envelope.

**The account buyer** (read-only rows since 09-25T07:01Z, reconciling with
`payerFacts` 62 c): `stock-quote` 15:13, 16:42, 18:11, 19:35, 21:05Z (≈89–90
min apart) and 02:54Z; `url-to-text` 15:17Z; `company-tech-stack` 02:42Z. All
completed. Active 09-21..09-26, six of six. No outreach (DQ-21).

## B. Overnight health

**Vendor Control Tower** — ACTION NEEDED, no new substance. OpenRegister
**291/500**, unchanged since 09-24 (no German credit spent), resets
2026-10-07T00:05Z. Serper 47,080/50,000. Dilisense ok. Browserless
self-hosted render ok. Same six standing warnings (anthropic/cdp spend
unread; esortcode; cobalt-intelligence, einsearch, sec-api-io — DQ-30).

**`npm run fixtures:drift`**: "Nothing" (326 suites, 350 manifests).

**`npm run scheduled:outcomes`**: exit 1 — `weekly-drift.yml` 6 consecutive
failed scheduled runs, last green 2026-08-10, latest 35607072076
(09-21T13:40Z). Next scheduled run Sunday 09-27. DQ-34 unchanged.

**Alarms grouped, whole window, no row cap** (`health_monitor_events` since
09-25T07:01:29Z, excluding `dependency_probe`/`scheduler_heartbeat`/
`meta_monitoring`/`situation_assessment`):

| slug | events | reading |
|---|---|---|
| platform (null) | invariant_alert 48, alert_sent 4 | the four standing messages ×12 each — see D |
| `uk-gazette-notice-search` | classification 23, invariant_alert 12, auto_remediation 1 | standing Gazette 500; not for sale |
| **`cz-unreliable-vat-payer`** | invariant_violation 11, classification 10, upstream_escalation 2 | **new** — below |
| `paid-api-preflight` | invariant_violation 6 | 5/6 correctness (one httpbin `is_reachable false`); 83% vs floor 85; single cause, no action |
| `academic-paper-search` | invariant_alert 3 | standing (OpenAlex rate limit, 09-25) |
| `slovak-company-data` | invariant_alert 3, classification 2 | standing (timeouts, harness) |
| `us-product-recall-search`, `company-news`, `country-economic-indicators`, `job-board-search`, `ssl-check`, `tech-stack-detect` | 1–2 each | single events |
| — | quality_floor 1, capability_promotion 1 | ticks, 0 decisions |

**`cz-unreliable-vat-payer`.** Every harness run failed "fetch failed" from
**09-25T07:34Z**, the first run on deploy `3fb818ed` (yesterday's merge);
every run on `b136d933` before it completed, hourly. Two runs at 09:34Z and
09:57Z on the same deploy completed, then failed again to 17:57Z, when
`upstream_escalation` (5 in 48 h) fired and runs stopped; the 12-hour
correctness invariant kept re-evaluating those same failures until 05:14Z.
Yesterday's diff touched only `auto-register.ts`'s DEACTIVATED map, a test
and docs — no plausible code cause. The ministry endpoint
(`adisrws.mfcr.cz …rozhraniCRPDPHSOAP?wsdl`) answered **200 in 0.78 s** from
this machine at ~06:40Z. `unverified:` the Lithuanian shape (the new
container's egress refused) — the two successes on the same deploy argue
for intermittence instead. **Customer exposure:** `who-called --days 60`:
zero account, x402 or anonymous calls, ever in the window; `x402_enabled =
false` already. Nothing to protect; not delisted. If it is still failing when
its suites resume, it gets the Lithuanian treatment and a production-side
read to tell egress from outage.

**Danish** (the third standing alarm): `who-called --days 7`: 7 harness
calls, all "The Danish business registry API quota has been temporarily
exceeded"; `visible = false`, `x402_enabled = false`. Its `capability_health`
row is frozen at 2026-08-16T13:49Z (`total_successes 0`, `last_success_at`
08-12) while 1,344 lifetime transactions continue to 09-26T00:03Z, so the
breaker writer stopped updating this row. See D for why no value was written.

**Breakers:** `us-court-search` open since 2026-08-17 (DQ-14), unchanged.
**CI on main:** green at `3fb818ed` (CI, Coverage matrix, M3 digest shadow,
09-25). **Deployed commit `3fb818ed6eee` equals `origin/main` tip
`3fb818ed`.**

**Lithuanian delisting verified (DEC-20260504-C post-deploy):**
`is_active/visible/x402_enabled = false/false/false` (`lifecycle_state` still
`active`, as the Phase 3 sync leaves it); `/x402/catalog` (205,625 bytes,
contains e.g. `latvian-company-data`) has no `lithuanian` string.

## B2. Stale work

- **PR #682** (M4 batch 7 → `m4/cutover`) — unchanged since 2026-09-13,
  `MERGEABLE`, thirteen days idle. Not touched, same reason as 09-24/25 (the
  improved follow-up is in `rescue/wip-2026-09-17-b7-fix-work-171f7c3` and
  another session's worktree `.claude/worktrees/agent-aa0d77d823b642e00`;
  the M4 merge needs a whole-PR pass). Owner: next M4 session.
- `session-close-check --hygiene-only` from the **primary checkout**: 0 red,
  2 yellow — today's handoff (this file, not yet committed then); local
  branches `m4/b1c-entrypoint-check`, `m4/b1d-activate` 14 d old. Those two
  are M4 batch branches targeting `m4/cutover`, not `main`, and still exist on
  the remote; deleting them is the M4 session's call. Owner: next M4 session.
- The stale `strale-wt-checkin` directory — see top.

## B3. Branch graveyard

Remote heads unchanged from 09-25 (`m4/*` ×7, `b3-fix2-local`,
`b3-r10-work`, `rescue/wip-2026-09-17-…`); oldest from 2026-09-12, none a
month old. No deletions.

## C. Decision queue

No `preauthorized_notice` window matured. DQ-33 (German check, waits for
10-07), DQ-34 (weekly-drift credential), DQ-27, DQ-14 unchanged; no update
lines added (nothing changed).

## D. The work — block 0117, two month-old alarms cleared

Yesterday's record made this run the fallback owner of the three platform
alerts firing every invariant tick since 2026-08-25. Findings, production
read-only:

1. **`compliance_profile_completeness`** — `cz-bank-account-validate`,
   `cz-birth-number-validate`, `cz-datova-schranka-id-validate`,
   `cz-ico-validate`, `cz-unreliable-vat-payer` have `geography NULL`
   (only field missing); sibling `cz-company-data` holds `eu`; their five
   manifests had no `geography` line. `compliance-profile.ts` maps `eu` to
   EU frameworks as primary, NULL falls back to `global`.
2. **`fixture_quality`** — the three active `adverse-media-check`
   known_answer suites store `{"entity_name": X}`; the input schema requires
   `name` (executor accepts the alias); manifest known_answer already uses
   `name`. No other active known_answer suite is flagged (reviewer re-ran
   `validateFixture`'s logic over all of them). Suites are `fixture` mode,
   `scheduled_testing_eligible = false`, last run 08-27.
3. **`lying_breaker` (Danish)** — not fixed. The alert's own remediation is a
   hand UPDATE that fabricates a failure; and the row has been frozen since
   08-16 while calls continue, so the defect is in whichever writer stopped
   touching it. Writing a value now would paper over that. Owner: next
   session with room for a real investigation (why `capability_health` is not
   updated for a capability that is called daily); `visible = false`, so no
   public exposure.

**Change** (branch `chore/checkin-2026-09-26`):
- `manifests/cz-*.yaml` ×5: `geography: eu`.
- `startup-migrations.ts`: block **0117**
  `runMigration0117_clearStandingCatalogueAlerts` — `UPDATE capabilities SET
  geography='eu' WHERE slug IN (5) AND geography IS NULL`; `UPDATE
  test_suites SET input = jsonb_build_object('name', input->>'entity_name'),
  updated_at = now() WHERE capability_slug='adverse-media-check' AND
  test_type='known_answer' AND input IN (two exact literals)`; one
  `auto_fix` event; ledger-guarded.
- Ledger row **M060**; M060 added to ten `known_overlaps` entries with
  disjointness notes (no other writer of `capabilities.geography`;
  adverse-media-check is not in `CAPABILITY_OUTPUT_CONTRACTS`, so M050 never
  targets it).
- Tests: six cases in `startup-migrations.test.ts` (happy path, geography
  scope, fixture scope, nothing-matches, idempotent, no Date/Buffer bind);
  max-block assertion 116 → 117.

**Verification:** `startup-migrations.test.ts` 165/165; `npm run
migrations:check` ok (60 blocks); `migrations:test` ok; manifest suites
(`capability-manifest-types`, `capability-manifest`, `manifest-completeness`,
`manifest-sync-fields`) 77/77; `npm run typecheck` (root, incl.
`typecheck:scripts`) exit 0 after building the MCP and TS SDK packages in the
fresh worktree. Discrimination: the new cases import a function that does not
exist on `origin/main`, and the scope cases fail if either predicate is
loosened (reviewer confirmed).

**Workload (DEC-20260504-B):** eight rows, once. **Deploy dependency
(DEC-20260504-C):** `runStartupMigrations()` from `index.ts`; block is in the
exported block array (`startup-migrations.ts`, after 0116). **Post-deploy
check for the next session:** `select slug, geography from capabilities where
slug like 'cz-%'` → all `eu`; the three adverse-media known_answer inputs →
`{"name": …}`; `startup_migration_ledger` has `0117_…` with rows_affected 8;
and the next invariant tick no longer emits `compliance_profile_completeness`
or `fixture_quality`.

**Review:** independent same-provider review in a separate context (fresh
read-only agent, worktree-isolated): **PASS-WITH-NITS**, no defects. Verified
the premise in production (5 and 3 rows), SQL semantics, no reverting writer
(`self-heal.ts:245`, `auto-remediation.ts:603` fire only after failures and
use manifest-derived inputs that also carry `name`), no scheduler path to a
paid call. Nits, recorded not changed: (1) two of the three suites carry
`external_cost_cents = 0` although the capability is paid, so a *manual*
`/v1/internal/tests/run?slug=adverse-media-check` would run them live — true
before this change; a cost-value correction is the fix, candidate below;
(2) rewritten inputs omit the manifest's `entity_type: company` — cosmetic.
No Codex-register row (DEC-20260910-A).

## E. Authorities updated

- `docs/company/GOALS.md` — three entries: the account buyer's ~90-minute
  cadence; the largest buyer's lower week-in-progress spend and mix; the
  `us-company-data` private-company demand.
- `docs/company/IDEAS.md` — first entry: US private-company lookup.
- DECISION-QUEUE.md, LESSONS.md unchanged. The standing-alarm pattern
  (reported daily for a month without an owner) is recorded here; two of
  three are now fixed and the third has an owner.

## Next session

1. **Verify block 0117 in production** (queries above) and that the two
   alerts stop; confirm `cz-*` public pages show EU.
2. **Close the week** (Sunday): did the largest buyer's week finish below
   €62.31, and by how much? First read of a falling week under the new
   identity instruments.
3. **Weekly-drift Sunday run** (DQ-34) — record its outcome.
4. `cz-unreliable-vat-payer`: when suites resume, pass or fail? If fail,
   delist-and-record like Lithuanian.
5. Candidates: Danish `capability_health` writer investigation;
   adverse-media-check suites' `external_cost_cents = 0` on a paid capability;
   research a licensed US private-company source (IDEAS.md); PR #682 / M4.
6. OpenRegister 291 — below ~110 before 10-07 re-opens the 08-27 trigger.
