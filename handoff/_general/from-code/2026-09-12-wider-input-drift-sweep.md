Intent: close the wider stored-input drift PR #677's own sweep flagged (34
actionable dependency_health suites, 3 repaired at the time). Re-derive the
set fresh, group it by cause, repair the stale-identifier case that verifies
live, decide the automation question with a real mechanism, and report the
quota-limited group's spend.

## 1. Re-derived the actionable set (read-only, production)

Re-ran the actionable-set conjunction (`findFixtureDrift`, unchanged) fresh
against production, `dependency_health`, 30-day window:
`archive/receipts/2026-09-12-sweep-wider-input-drift-groups.json`. **31**
suites (down from 34: PR #677's block 0114 already released the three it
named). New permanent tool: `apps/api/scripts/fixture-drift-groups.ts` +
`apps/api/src/lib/drift-cause.ts` (`classifyDriftCause`, unit-tested in
`drift-cause.test.ts`), grouping each finding by cause from its
`sampleFailure` text and manifest `cost_class`:

| cause | count | members / cost_class |
|---|---|---|
| stale_identifier | 1 | canadian-company-data (free_unlimited) |
| ambiguous_match | 2 | spanish-company-data (free_quota, cap 100/day), german-company-data (free_quota, cap 45/month) |
| policy_refusal | 27 | all `paid_prepaid`, refused pre-flight by `assertGuardedAllow`'s ALLOW_MATRIX (`apps/api/src/capabilities/guarded-executor.ts:685-702`) before the executor ever sees the input; no stored input could ever make these pass |
| quota_refusal | 1 | danish-company-data (free_quota, cap 20/day); the one recorded run in the window is a `BudgetExhaustedError`, refused pre-flight by the internal test-budget gate (`guarded-executor.ts:380-437`), before any vendor call |

How each was decided: `policy_refusal` matches `/refuses invocation from
context kind/` in `sampleFailure` (the exact `CapabilityInvocationRefusedError`
string, `guarded-executor.ts:196`); `quota_refusal` matches `/has exhausted
its .* test budget/` (`BudgetExhaustedError`, `guarded-executor.ts:211`) or a
vendor-side 429/quota string; `ambiguous_match` matches `/No confident .*
registry match|Ambiguous .* name/`; `stale_identifier` is the remainder that
matches a registry not-found phrasing. Verified against the manual
classification done by reading all 31 sample failures directly before writing
the classifier (matches exactly).

## 2. Repaired the stale-identifier group

`canadian-company-data`, `free_unlimited` (`manifests/canadian-company-data.yaml:8`,
no vendor cost either way). Verified live before writing anything, via the
capability's own registered executor (not a reimplementation):

| input | result |
|---|---|
| `{"corporation_number":"2408951"}` (stored) | THROWS: "No Canadian federal corporation found for 2408951..." |
| `{"corporation_number":"1007"}` (manifest, corrected 2026-08-12 per that manifest's own comment) | SUCCESS: Abbotsford Chamber of Commerce, Active since 1947 |

Both calls free (`cost_class: free_unlimited`). Resynced through the
mechanism PR #677 added (`checkDependencyHealthDrift`,
`src/lib/test-input-drift.ts`), not a second one: new startup migration
block **0115** (`runMigration0115_resyncCanadianCompanyDataDependencyHealth`,
ledger `M058`) rewrites the exact stale literal
`{"corporation_number":"2408951"}` to `{"corporation_number":"1007"}`,
clears the baseline, writes one `health_monitor_events` row
(`event_type: auto_fix`). This row was NOT quarantined (`test_status =
'normal'`, unlike the three block 0114 released), so the predicate matches on
the exact stale input literal rather than a quarantine marker, verified
live, read-only, before writing the block. This has not run against
production yet: it fires on the next deploy that includes this branch
(`runStartupMigrations()`, `apps/api/src/index.ts`), same as every other
startup-migration block; this session made no production write itself.

`spanish-company-data` and `german-company-data` (ambiguous_match) were left
unrepaired: the brief scoped repair to the stale-identifier group, and
verifying a corrected identifier for these would itself spend a live vendor
call against their own scarce quota, deliberately not spent this session.

## 3. Automation decision: detector automatic, resync stays manual

Not automating the actual resync write. `dependency_health`'s input has no
supported concept of an intentional divergence (any drift is staleness, per
`test-input-drift.ts`'s own doc comment), but a newly-drifted capability
can enter the actionable set with its MANIFEST also unverified (nobody has
yet confirmed the "corrected" value still resolves live), which is exactly
the judgment step the Capability Onboarding Protocol reserves for a person.
Auto-writing an unverified manifest value into production would risk
converting "stale DB, corrected manifest" into "stale DB, ALSO-unverified
manifest" silently.

What IS now automatic: **CHECK 14** in the invariant checker
(`apps/api/src/jobs/invariant-checker.ts`, `checkFixtureInputDrift`), wired
into `runInvariantChecks` (runs every 2h + 60s after boot, already-scheduled
infrastructure, no new cron). Read-only: reuses `findFixtureDrift` +
`classifyDriftCause`, no vendor calls, no write to `test_suites`. When the
actionable set is non-empty it writes one `health_monitor_events` row per
run (`event_type: invariant_alert`, `details.by_cause` breakdown) and pages
via `alertOnce` on a 24h cooldown. This is the detector the brief asked to
name: the next `canadian-company-data`-shaped drift (manifest corrected,
row never resynced) surfaces within 2 hours instead of silently firing
`regression_detected` for a month, which is what actually happened here
(see PR #677's own background section). Tests:
`apps/api/src/jobs/invariant-checker.fixture-drift.test.ts` (4 cases,
db/health-monitor/alert-once mocked, proved by contrast: identical suite row
with the only change being the mocked manifest content flips the outcome
from silent to alerting).

## 4. Quota-limited failures: spend and recommendation

- **danish-company-data** (`free_quota`, cap 20/day): the one recorded
  failure in the window is `BudgetExhaustedError`. Strale's own internal
  test-budget gate (mirrors the vendor cap) refuses the call BEFORE any
  vendor request (`guarded-executor.ts` `assertBudgetAvailable`, decrements
  and throws over cap). **Cost of this specific failure: zero vendor
  requests.** Whether the stored `cvr_number` (`47458714` vs manifest's
  `24256790`) itself resolves is unverified; checking would spend one of
  the same 20 daily requests, so per Test Infrastructure Cost Principle A/B
  I did not spend it. Recommendation: **no scheduling change**, the
  existing budget gate already bounds the marginal cost of this failure
  mode to zero regardless of the input.
- **spanish-company-data** (`free_quota`, cap 100/day): `resolveByName`
  (`apps/api/src/capabilities/spanish-company-data.ts:144-187`) makes
  exactly one `omSearch` request before throwing on "no confident match",
  never reaching the `/company/{slug}` detail call. **1 vendor request per
  failing run**, at most once/day (scheduler's `free_quota` floor is 24h,
  `test-scheduler.ts` `minRetestIntervalHours`), so roughly 1% of its daily
  allotment. Recommendation: **no scheduling change**, low absolute cost,
  not urgent.
- **german-company-data** (`free_quota`, cap **45/month**): `autocomplete`
  (`apps/api/src/capabilities/german-company-data.ts:146-164`) costs 1
  vendor unit and is the only call made before `pickByName` throws on "No
  confident German registry match" for `"Google"`, never reaching
  `fetchCompany` (weight 10). At the scheduler's 24h floor that is **roughly
  30 units/month spent on a guaranteed-fail probe alone: about two-thirds
  of the entire monthly cap**, on a capability whose OWN health_check_input
  choice (a generic name) is what makes every run ambiguous, not vendor
  health. Recommendation: **stop scheduling this suite until its input is
  fixed.** Mechanism: `test_suites.active = false` for this one
  `dependency_health` row, same append-only/ledgered startup-migration
  shape as blocks 0113-0115. A production write, deploy-time, not
  executed this session (the brief asked for a recommendation here, and
  deliverable 2 scoped repair/release to the stale-identifier group only).
  Separately worth noting: the scheduler's `quotaHours` map
  (`test-scheduler.ts:341-344`) gives every `free_quota` capability the
  same 24h floor regardless of whether its manifest's own
  `quota_window` is `daily` or `monthly`, which is why a monthly-capped
  suite burns through its budget as fast as a daily-capped one. That gap is
  a separate, pre-existing scheduler question, out of this session's scope;
  flagging it here rather than silently working around it.

## Gates

- `apps/api`: `npx tsc --noEmit -p .`, pass (after
  `npm --workspace=packages/mcp-server run build`, the pre-existing
  worktree node_modules/mcp-server-types gap, unrelated, see WORKTREES.md).
- `apps/api`: vitest on `startup-migrations.test.ts`, `fixture-drift.test.ts`,
  `test-input-drift.test.ts`, `drift-cause.test.ts`, `invariant-checker.test.ts`,
  `invariant-checker.correctness.test.ts`, `invariant-checker.fixture-drift.test.ts`,
  pass. Receipt: `archive/receipts/2026-09-12-test-run-wider-input-drift.json`.
- `npm run migrations:check`, pass (58 blocks, no overlap findings).
- `npm run migrations:test`, pass.
- `npm run env:check`, pass (no new env reads).
- `npm run context:check`, pass (ran `context:generate` twice first, `git add -A`
  after each).
- `npm run receipts:check`, pass (same 11 pre-existing unrelated warnings
  PR #677's handoff already noted, none from this session).
- `npm run archive:index`, pass.

## Not done / out of scope

- `spanish-company-data` / `german-company-data` ambiguous-match inputs: not
  repaired (out of the stale-identifier repair scope); german flagged above
  for a scheduling stop, not executed this session.
- The scheduler's daily-vs-monthly `quota_window` gap: flagged, not fixed.
- Migration block 0115 has not run against production yet; it fires on
  the next deploy. This session made no production write.
