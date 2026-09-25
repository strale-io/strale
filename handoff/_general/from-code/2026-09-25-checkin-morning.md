# 2026-09-25 — morning operating session

Intent: run the 2026-09-25 operating session under DAILY-RUN.md — measure the
business, dispose of overnight health and stale work, act on yesterday's
Lithuanian open question, and hand back the two artifacts.

Proactivity level 5. Everything below is second-sourced or marked
`unverified:`. **Previous run: 2026-09-24** (gate passed 19:53:09Z), so every
health window starts at **2026-09-24T19:53Z** (~10.5 h). This run started
~06:15Z from batch worktree `strale-wt-checkin` at `origin/main` `b136d933`
(copied the trunk's two ignored `.env` files in; no tracked change).

---

## Headline

1. **The account (card) buyer came back a fifth day running and started
   repeating capabilities** — `fear-greed-index` ×3, `company-tech-stack` ×3,
   `stock-quote` ×3, `url-to-text` ×2 since the previous run; two of those it
   had also called on 09-24. First recurrence across days.
2. **Lithuanian: the snapshot fix removed one failure and exposed the next.**
   5/5 post-deploy runs failed on the register query (HTTP 500) that answers
   200 off-platform. **Taken off sale via `DEACTIVATED`** (commit `e75c69b0`),
   as the 09-24 record and brief committed to.
3. Nothing a customer saw overnight except **one** x402 `tech-stack-detect`
   call ("External service temporarily unavailable"; 11/12 paid calls completed
   over 7 days; not charged — failures do not settle).
4. Three platform invariant alarms have fired ~12×/day since 2026-08-25 and
   were only ever called "standing". Now a finding with an owner (below).

---

## A. Business measurement

`commercial-brief.ts` and `ceo-dashboard.ts`, production read-only.

```
2026-09-21     €27.32    427 calls  [in progress, day 5 of 7 — NOT comparable]
2026-09-14     €62.31   1038 calls
2026-09-07     €51.97   1082 calls
2026-08-31     €58.77   1168 calls
2026-08-24     €73.03   1295 calls
```

Last completed week unchanged from 09-24's read: `growth()` rising; 11 payers;
largest 83.4% (€51.99 vs €10.32); 2 bought on >1 day; 7 paying days;
new/returning `unavailable`. Week in progress: 6 payers, largest 70.0% (€19.13
vs €8.19). Dashboard: revenue €50.12 rolling 7d, buyers 37 (lower bound),
identity 100%, spend €1.82. Quiet list 9, largest €6.64 at 18 d (unchanged
membership vs 09-24).

**Second source — `payerFacts`** (via `lib/metrics/commercial.ts`, throwaway
script, deleted):
- since 09-24T19:53Z: 2 payers — largest `x402:v1:e9e672ef…` €1.19/49 calls;
  account buyer `user:v1:e3c68534…` €1.15/11 calls. €0 unattributed.
- week of 09-21: 1913 + 790 + 20 + 5 + 2 + 2 = **2732 c = €27.32** — equals
  the pack; largest 1913/2732 = 70.0% — equals the pack.

**The account buyer** (read-only rows for that one account, qualitative):
active days 09-21…09-25, five of five. Since the previous run, 11 rows, all
completed, 115 c (= `payerFacts`): `fear-greed-index` 23:16Z, 23:46Z (09-24)
and 05:51Z; `company-tech-stack` 02:42/02:45/02:46Z; `stock-quote`
05:26/05:37/05:42Z; `url-to-text` 05:34/05:49Z. On 09-24 (record of that day)
it called `company-enrich`, `company-tech-stack`, `fear-greed-index` once each.
So `company-tech-stack` and `fear-greed-index` have now recurred across days.
The 09-24 reading ("different each day") no longer fits. No outreach (DQ-21).

## B. Overnight health

**Vendor Control Tower** — ACTION NEEDED, no new substance. OpenRegister
**291/500**, unchanged since 09-24 (no German credit spent overnight), resets
2026-10-07T00:05Z. Serper 47,081/50,000. Dilisense authenticated ok.
Browserless self-hosted render ok. Same six standing warnings (anthropic/cdp
spend unread; esortcode no balance endpoint; cobalt-intelligence, einsearch,
sec-api-io with no vendor record — DQ-30).

**`npm run fixtures:drift`**: "Nothing" (326 suites, 350 manifests). German
still absent only for lack of runs (see 09-24 caveat).

**`npm run scheduled:outcomes`**: exit 1 — `weekly-drift.yml` 6 consecutive
failed scheduled runs, last green 2026-08-10, latest 35607072076
(09-21T13:40Z). No new run since; DQ-34 updated.

**Alarms grouped, whole window, no row cap** (`health_monitor_events` since
09-24T19:53Z, excluding `dependency_probe`/`scheduler_heartbeat`/
`meta_monitoring`/`situation_assessment`):

| slug | events | `who-called --days 1 --errors` |
|---|---|---|
| platform | invariant_alert 20, alert_sent 2 | see below |
| `uk-gazette-notice-search` | classification 10, invariant_alert 5, auto_remediation 1 | standing Gazette 500; not for sale |
| `lithuanian-company-data` | classification 5, invariant_alert 5 | 16 harness: 9 classifier 500 (pre-deploy), **5 register 500 (post-deploy)**, 2 negatives. See D. |
| `academic-paper-search` | invariant_alert 3, classification 1, regression 1 | 3 harness: 1 OpenAlex rate-limit, 1 negative, 1 completed |
| `slovak-company-data` | classification 1, upstream_escalation 1 | 36 harness: 24 negatives, 6 timeouts |
| `tech-stack-detect` | classification 1 | 3 harness (1 `fetch failed`, 1 negative); **3 x402, 1 failed "External service temporarily unavailable"** |
| `company-news` | classification 1 | 3 harness: 1 negative, 1 GDELT 429 |

`tech-stack-detect` second source: `who-called --days 7`: x402 12 calls, 11
completed, 1 failed — the same one. Single event; no action.

**Platform alerts — a finding, not "standing".** Grouped by message over 60
days, three have fired every day since **2026-08-25** (367 each):
- `lying_breaker`: `capability_health` for `danish-company-data` closed with
  `last_success_at` 2026-08-12 and `total_successes = 0`. The alert's own
  remediation text is a hand `UPDATE` — not permitted here.
- `fixture_quality`: `adverse-media-check` known_answer ×3 "missing required
  fields: name" — rendered on the public detail page.
- `compliance_profile_completeness`: five `cz-*` capabilities missing
  `geography` — rendered on public detail pages.

The 09-11 and 09-18 records list them as "standing alerts, unchanged" with no
explanation or owner. DAILY-RUN.md: "an alarm that recurs on the same
capability on more than one day is a finding until it is explained". Not
fixed today (two are public-page data needing a deploy-time route, one needs a
DB correction route); raised as a spawned task with the full brief, owner =
that session, else the next check-in. Also the "28 dependency_health suites
differ" alert: the wider population `fixtures:drift` narrows to its
actionable (zero today); not new (30 → 29 → 28 since 09-13).

**Breakers:** `us-court-search` open since 2026-08-17 (DQ-14), unchanged.
**CI on main:** green at `b136d933` (CI + Coverage matrix, 09-24T19:46Z).
**Deployed commit `b136d9339da9` equals `origin/main` tip `b136d933`.**

## B2. Stale work

- **PR #682** (M4 batch 7 → `m4/cutover`) — unchanged since 2026-09-13,
  `MERGEABLE`, twelve days idle. Deliberately not touched: the improved
  follow-up lives in `rescue/wip-2026-09-17-b7-fix-work-171f7c3` and another
  session's worktree `.claude/worktrees/agent-aa0d77d823b642e00`, and the
  M4 cutover merge requires a whole-PR pass (memory: M4 merge delegation).
  Owner: next M4 session, before batch 8 (T7 `next_action`).
- `session-close-check --hygiene-only` from the **primary checkout**: 0 red,
  1 yellow (today's handoff not yet written at that point — this file).

## B3. Branch graveyard

Remote heads unchanged from 09-24 (`m4/*` ×7, `b3-fix2-local`, `b3-r10-work`,
`rescue/wip-2026-09-17-…`); oldest from 2026-09-12, none a month old. No
deletions.

## C. Decision queue

- **DQ-33** — update: Lithuanian off sale (hosting refusal, not the fixture);
  only the German check remains, waiting for 10-07. Stays open.
- **DQ-34** — update: no new weekly run; unchanged.
- DQ-27, DQ-14 unchanged. No `preauthorized_notice` window matured.

## D. The work — `lithuanian-company-data` off sale

**Evidence.** Transactions for the slug, last 26 h, with
`receipt_deploy_commit`: 12 rows on `2a65ffd6` (pre-fix; classifier 500 or
missing-input negatives); from 09-24T20:31Z every row is on `b136d933` and
fails "Lithuanian Open Data Portal returned HTTP 500" — 5/5, hourly-ish
(20:31, 22:31, 00:31, 02:31, 04:31Z). Second source: the same register URL
(`…/JuridinisAsmuo/:format/json?eq(ja_kodas,304151376)&limit(10)`) returned
**200 in 0.38 s** from this machine at ~06:25Z. So the portal refuses
production's egress for the register as it did for the classifiers; the
snapshot fix was correct and insufficient.

**Action (SYSTEM_ACTING — delisting is inside the charter).** Added to
`DEACTIVATED` in `auto-register.ts` with the reason and a reactivation
condition (register reachable *from production*, proven by a production-side
read). DEACTIVATED is the switch that also stops `getDirectExecutor` callers
and syncs `is_active`/`visible`/`x402_enabled` to false at boot (Phase 3).
Dependents checked: `solution_steps` has no row for the slug (read-only
query); `website-to-company.ts` LT route guards `if (executor)` and falls
through to whois-only. Zero customer calls in the window (`who-called`; second source `--days 36`: zero non-harness calls).
Current DB state before deploy: `is_active`/`visible`/`x402_enabled` true,
`lifecycle_state` active.

**Test.** New case in `lithuanian-company-data.test.ts` asserts the map entry.
Discrimination measured: with `auto-register.ts` restored from `origin/main`
the case fails (1 failed | 4 passed); with the change, 5/5. Related suites
`vendor-terms.test.ts`, `credential-health.test.ts`: 35/35 across the three
files.

**Deploy verification (DEC-20260504-C).** Dependency: the boot-time Phase 3
sync in `autoRegisterCapabilities()` (`auto-register.ts`, "Phase 3: sync
DEACTIVATED list to DB catalog state"). Post-deploy check for the next
session: `select is_active, visible, x402_enabled from capabilities where
slug='lithuanian-company-data'` → all false, and the slug absent from
`/x402/catalog`.

## E. Authorities updated

- `docs/company/GOALS.md` — Lithuanian answer appended to its entry; new
  entry for the account buyer's fifth day and repetition.
- `docs/company/DECISION-QUEUE.md` — DQ-33 and DQ-34 updates.
- LESSONS.md not changed. The standing-alarm finding is the F7 "sampled, not
  grouped" shape's cousin (reported daily, never explained) — recorded here;
  if the spawned session confirms any of the three was masking a real public
  defect, that session logs it.

## F. Review

Independent same-provider review in a separate context (fresh read-only agent,
worktree-isolated) of `e75c69b0`: see the PR description for its verdict. No
Codex-register row (DEC-20260910-A).

## Next session

1. **Verify the Lithuanian delisting reached production** (query above; the
   slug gone from `/x402/catalog`). Record the platform's company-registry
   country count change if `/v1/platform/facts` exposes one.
2. **OpenRegister first thing** (291). Below ~110 before 10-07 re-opens the
   08-27 trigger.
3. The three month-old platform alarms — if the spawned task has not run,
   take it (brief in the chip; summary above).
4. PR #682 / rescued b7 work — thirteen days idle tomorrow; M4 session.
5. Candidates, unchanged: Lithuanian reactivation needs a different egress
   (hosting question, not urgent — zero demand observed); undici `cause` in
   bare `fetch failed` strings.
