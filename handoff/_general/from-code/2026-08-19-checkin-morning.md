# 2026-08-19 — Morning check-in

Intent: run the daily operations check-in under the Operating Charter (DEC-20260815-A) — dashboard, overnight problems, stale-work sweep, branch graveyard, decision queue, then the highest-leverage work available against M1.

## Headline numbers

From `ceo-dashboard.ts` (canonical path, production read-only):

- **Revenue observed: €52.99** (rolling 7d) · **buyers estimated: 6** (explicitly a lower bound — wallet identity only recorded since 2026-08-15) · **spend estimated €5.66** against the €50/week envelope.
- **Circuit breakers open: 1** — `us-court-search`, open since 2026-08-17, which is the expected state: it was deliberately switched off in DQ-11 pending a CourtListener key (DQ-14 item 1).
- **CI on main: green.** Prod served main's tip throughout.

Direction is up. A discrete-week cross-check (external-only) shows the current week already at €30.83 across 464 calls by Wednesday morning, against €39.24 for the whole of the previous week. **I am reporting the dashboard's figure, not that query's** — the ad-hoc SQL lacks the window/population/instrument guards in `lib/metrics`, so it is directional corroboration only, which is also why its absolute numbers differ slightly from GOALS.md's table.

## The one that mattered: the instrument was blaming the capability again (#341, merged, deployed)

Running the **T4.3 exit measurement** (deferred to today specifically for a clean 24h window) surfaced `eu-regulation-search` at 60.4% — a capability that had been at 100% for three straight days and was in no prior failing list.

It is not broken. Every one of its failures is the harness's own fixture-staleness marker, whose message literally ends **"Not evidence about the capability."** Three separate consumers scored it as exactly that:

1. **The taxonomy called it our bug.** `classifyTransactionFailure` returned `internal` — *"OUR bug until proven otherwise"* — so it counted in the correctness denominator. The emitting function's own docstring asserted the opposite: *"classifies this as `config` … so the correctness invariant excludes it."* The docstring was untrue, and nothing had ever checked it.
2. **It opened false regressions.** Production fired three `regression_detected` alerts on 2026-08-18: *"eu-regulation-search was passing (100% over 10 runs), now failing"* — while the capability answered correctly.
3. **The classification never arrived anywhere.** `SingleTestResult` never declared `failureClassification`; all four consumers read it via `(r as any)` and got `undefined`. Measured consequence: **14 of 14 production `infrastructure_alert` events grouped as `{"unknown": 6}`**. A detector whose entire job is naming the common cause of a systemic failure has never once named one.

**This is DQ-12 and E3 for the third time, arriving by a third route** — an instrument that knows it has no evidence, scoring "no evidence" as evidence of a defect. Worth stating as a standing rule: a comment claiming the exclusion wiring exists is not the wiring.

Fixed, with 9 tests using the verbatim production failure string. Discrimination proven by reverting all three source files to `origin/main` with the tests in place: **8 of 9 fail**; the 9th is a deliberate over-match guard that correctly passes both ways. Full suite green (170 files, 2,138 tests), `tsc` clean, merged as `f4b3561`, and **prod confirmed serving that commit**.

One detail worth keeping: pre-fix, an adversarial baseline payload containing "timed out" classified as **`timeout`** — third-party text really did leak into the verdict. The fix anchors on our own literal prefix ahead of every other pattern, and a test pins that.

## T4.3: the quality program's exit measurement passes

**3 capabilities under 90%** against a ≤5 target, down from 30 at program start, across 210 capabilities and 13,779 runs:

| capability | rate | verdict |
|---|---|---|
| `uk-gazette-notice-search` | 60.0% | vendor API 500s to everyone — DQ-14 item 2, needs Petter |
| `eu-regulation-search` | 60.4% | **not a capability fault** — the staleness bug above, fixed in #341 |
| `canadian-company-data` | 88.1% | genuine, marginal |

Cross-checked at 12h/48h/7d. The same three dominate; the 7d window additionally carries pre-fix rows from the program's own remediation, which is exactly why a clean window was specified.

## Two false alarms I talked myself out of — both killed by re-measuring, not by care

Recording these because in both cases the first reading was confident and wrong.

1. **"27 capabilities were delisted overnight."** They were not. `updated_at` had been bumped on 203 of ~340 capabilities within one hour, which looked like a mass quarantine. It is a broad harness writer; the off-rail set is stable at 34 and several entries date from May. No quarantine event exists.
2. **"The quality floor has been down for 17 hours."** It has not. Its interval is **24h with a 15-minute startup delay**, so ticks are *deploy-driven*: 8 merges on 2026-08-18 produced 8 ticks, and the silence since was simply the absence of a ninth deploy. The unconditional `tick_complete` heartbeat is what made the gap look like a failure. Now recorded in GOALS.md so the next session doesn't spend an hour on it. Side note: the documented self-throttle of "3 quarantines per run" is therefore per *deploy*, not per day — harmless while decisions are 0, but it is not the stated bound.

I also expected the staleness bug to be systemic (a startup migration invalidating every fixture baseline on each boot). **It is not** — `baseline_older_than_edit = 1` across 138 fixture suites. Checking is what killed that hypothesis.

## Stale-work sweep (B2/B2b)

- **Zero open backend PRs at start and at finish.** Both PRs I opened today were merged in the same session.
- Checkout on `main`, level with origin. Hygiene script clean apart from today's handoff (this file).
- **Deployed SHA tracked main's tip throughout** — verified before and after each merge.
- `strale-frontend#5` remains open: a May cleanup PR in the other repo, unrelated to today's work. Flagged rather than merged blind.
- Leftovers from earlier sessions: a worktree `C:/Users/pette/Projects/strale-wt-checkin` (detached HEAD) and a non-worktree directory `C:/tmp/strale-wt-docs`. Harmless, but they are why I used `-wt-docs2`.

## Branch graveyard (B3): 13 → 8 unmerged

**Deleted (all recoverable from these SHAs):**

| branch | sha | why |
|---|---|---|
| `rescue/wip-2026-07-23-fix-screenshot-waitfor-edgar-retry-af2bd66` | `af2bd66a5207b9661533545d4bcc50b3fc376433` | main's `screenshot-url.ts` is strictly newer (7 dialect-probe markers vs 0); its handoff already on main |
| `rescue/wip-2026-07-16-detached-013108c` | `013108ce2d1b74aa49e18684dfbe7784cfc49065` | one `.gitignore` line |
| `rescue/wip-2026-07-16` | `d910b64ff0106bb78555ed4fe4ce46a66455baed` | only unique content was `.claude/model-os/*` (removed platform-wide 2026-08-16) and `.agents/skills/*` (rebuilt in #319); all 11 of its `audit-output/` docs byte-identical on main |
| `rescue/wip-2026-07-16-worktree-agent-a000fba7eea386276-b70a1ff` | `b70a1ffe06fcc2dcc990ef7e229c0dd62ae7d650` | sole unique file was the HVD research doc, landed in #342 first |

**Landed first so deletion was safe (#342):** `se-hvd-api-probe-2026-05-18.md` (Bolagsverket HVD API — including that redistributing personnummer needs a **DPA with Bolagsverket, not just the HVD licence**, which we would otherwise rediscover the hard way) and `eu-coverage-use-case-tier-audit-2026-05-18.md`.

**A methodological correction worth carrying forward.** My first pass compared file *paths* and reported five documents as missing from main. Three were not missing — the Phase-3 sweep had moved `audit-output/` under `archive/sessions/` months ago, and a path check cannot see a move. Content comparison found them byte-identical. **After a file move, a path-based "is it on main" check is not evidence of absence.** Only two were genuinely unique.

**Kept, with reasons:**

- `rescue/wip-2026-07-16-docs-phase-7b-enumeration-edc1d46` — I had queued this for deletion once its research landed. It holds a **different version** of the Italian stakeholders work: same capability file, three *differing* supporting files. Deleting it would have discarded a variant of live DQ-1 work.
- `rescue/wip-2026-07-16-feat-phase-7a-it-stakeholders-ca1ab4e` and `feat/phase-7a-it-stakeholders` — live DQ-1 work with a known PII hazard (real *codice fiscale* in a fixture) to resolve first.
- `rescue/stale-2026-08-15-…-6bb5cf4` — holds `guarded-executor.budget.test.ts`, a test file not on main. Assess and land or drop.
- `archive/retire-solutions-abandoned-2026-05`, `tooling/session-state-marker`, `feat/phase-3-extraction-lv`, `fix/t02-quality-floor-reinstatement-audit` — previously documented keeps.

## Decision queue (C)

Nothing matured into action: **DQ-14 is `your_call` with no deadline** (silence is never approval), and every other open entry is already `decided`. Added **DQ-15** recording today's branch deletions and the path-vs-content correction.

## What's queued for Petter

Unchanged from DQ-14, and none of it blocks anything: CourtListener key · report the Gazette outage to TheGazette · the read-only frontend GitHub token · archive/delete `wow-core`.

Two of today's findings touch that list: the Gazette really is our worst capability at 60.0%, with a written reason, and `us-court-search` is the one open breaker — both waiting on him, neither urgent.

## Next session should pick up

1. **`eu-regulation-search`'s suite is stuck and needs a production write I deliberately did not make.** Its baseline predates its last edit and `external_cost_cents = 1`, so it is not free to re-run and **can never self-heal**. #341 stops it being *scored* as a defect; it does not refresh the baseline. Fixture refresh is platform-acts-alone under DEC-20260812-A, but this check-in runs under a hard read-only-prod rule, so it is the first action for a session that can write.
2. **The seven fixture-contract bugs** (`iso-country-lookup` et al.) — still the standing fixture-hygiene batch, and the same *shape* as today's bug: fixtures asserting a flattened shape against a nested response.
3. **E4 is now measurable.** The four growth bundles have been payable since 2026-08-18; the 14-day kill criterion runs to ~2026-09-01. Nothing to decide yet — just don't let the window pass unmeasured.
4. `rescue/stale-…-6bb5cf4`: land or drop `guarded-executor.budget.test.ts`.
5. `uk-disqualified-director-check` still has `processes_personal_data = true` with an empty `personal_data_categories` (carried from 2026-08-18; `["name"]` is almost certainly right).

## Merged this session

- **[#341](https://github.com/strale-io/strale/pull/341)** — stop scoring the harness's own stale fixtures as capability defects. `f4b3561`, deployed and verified.
- **[#342](https://github.com/strale-io/strale/pull/342)** — land two research documents stranded on rescue branches. `f223a86`.
