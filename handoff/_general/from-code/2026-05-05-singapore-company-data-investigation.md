# Investigation: singapore-company-data has no passing test in 30 days

Intent: explain why PR1's pre-push diagnostics flagged the 3 SG solutions
(`invoice-verify-sg`, `kyb-complete-sg`, `kyb-essentials-sg`) as "would
deactivate on next scheduler tick" once the new is_active gate (DEC-20260503-B
Wave 2) replaces the legacy `matrixSqs > 0` gate. Read-only investigation; no
code changes.

(Note: prompt named the path `apps/api/handoff/...` — that subtree doesn't
exist in this repo. Writing to the canonical `handoff/_general/from-code/`
location at repo root.)

## Trigger
PR1 pre-push diagnostics flagged 3 SG solutions cascading on the new is_active
gate (post-DEC-20260503-B Wave 2 of PR1). All three are blocked on
`singapore-company-data`. The capability was rewritten 2026-04-29 from a
Browserless scrape of opencorporates.com (a Tier-1 violation per
DEC-20260428-A) to the data.gov.sg CKAN datastore_search direct API.

## Evidence

### Step 1 — capabilities row + test_results history

Capability row:

| field             | value                              |
|-------------------|------------------------------------|
| slug              | singapore-company-data             |
| is_active         | true                               |
| lifecycle_state   | degraded                           |
| last_tested_at    | 2026-03-16 10:37 UTC (~50 days)    |
| capability_type   | scraping                           |
| created_at        | 2026-02-26                         |

test_results aggregate for slug:

| total_all_time | passed_all_time | total_30d | passed_30d | total_90d | passed_90d | most_recent | most_recent_passing |
|----------------|-----------------|-----------|------------|-----------|------------|-------------|---------------------|
| 0              | 0               | 0         | 0          | 0         | 0          | null        | null                |

So `last_tested_at` is non-null but `test_results` is empty all-time. That's
data-retention pruning — not the bug. The bug is upstream of pruning: the
scheduler hasn't *written* a result for this slug since 2026-03-16, full stop.

### Step 2 — test_suites for `singapore-company-data`

Five suites exist. **All five are `active = false` with `test_status = 'upstream_broken'`:**

| test_type           | active | schedule_tier | test_status     | external_cost_cents | updated_at |
|---------------------|--------|---------------|-----------------|---------------------|------------|
| schema_check        | false  | B             | upstream_broken | 0                   | 2026-03-14 |
| negative            | false  | B             | upstream_broken | 0                   | 2026-03-14 |
| edge_case           | false  | C             | upstream_broken | 0                   | 2026-03-14 |
| dependency_health   | false  | B             | upstream_broken | 0                   | 2026-03-16 |
| known_answer        | false  | C             | upstream_broken | 0                   | 2026-05-01 |

The known_answer suite's `last_classification` was touched on 2026-05-01 (likely
self-heal/auto-remediation analyzing classification trends), but the suite's
`active` flag is still `false`, so the runner's `WHERE testSuites.active = true`
filter excludes it from every tick.

Scheduler-gate dry-run (mirrors `findOverdueCapabilities()` in
`apps/api/src/jobs/test-scheduler.ts:251`):

| would_be_picked_if_overdue | reason                         |
|----------------------------|--------------------------------|
| false (all 5 rows)         | `ts.active = false` for all rows |

`external_cost_cents = 0` for every row — the new "free-only" filter would
admit it. The blocker is purely `active = false`.

### Step 3 — manual smoke test against live data.gov.sg

Ran `apps/api/scripts/smoke-singapore.ts` (DBS Bank UEN `196800306E` and
name-search "DBS BANK"):

```
=== DBS Bank UEN (196800306E)  (1423ms) ===
output: {
  "entity_name": "DBS BANK LTD.",
  "uen": "196800306E",
  "entity_type": "Local Company",
  "status": "Registered",
  "is_active": true,
  "issuance_agency": "ACRA",
  "uen_issue_date": "1968-07-16",
  "registered_street": "MARINA BOULEVARD",
  "registered_postal_code": "018982",
  "registered_address": "MARINA BOULEVARD, Singapore 018982",
  "jurisdiction": "SG"
}
provenance.acquisition_method: direct_api

=== Name search (DBS BANK)  (747ms — FAILED) ===
error: Singapore registry lookup is currently rate-limited (data.gov.sg).
       Please retry in a few seconds.
```

UEN lookup: full record returned, all expected fields populated, sub-2s.
Name search: 429 from data.gov.sg on the immediate retry against the same
endpoint — transient and expected when calls are issued back-to-back.

The new direct_api executor is healthy.

## Diagnosis

**(B) Scheduler registration gap** — specifically: the test_suites for
`singapore-company-data` were deactivated when the prior Browserless+OpenCorporates
scrape was upstream_broken (sometime in March), and were never reactivated when
the capability was rewritten 2026-04-29 to use the free data.gov.sg CKAN API.
The capability code is healthy; the suites are silenced, so the scheduler
writes no test_results, so the new is_active gate (DEC-20260503-B Wave 2) sees
"no passing test in 30 days" and would cascade-deactivate the 3 SG solutions.

Two collateral observations worth noting (both stale-state symptoms of the
same incomplete cutover, not standalone bugs):

- `capabilities.capability_type` is still `'scraping'`. The new executor is
  `stable_api`. This affects retry strategy in `runSingleTest()`
  (`apps/api/src/lib/test-runner.ts:476`) — `scraping` gets retried,
  `deterministic` doesn't; `stable_api` does. So the type mismatch is benign
  for now but should be corrected.
- `capabilities.lifecycle_state = 'degraded'`. With automatic lifecycle
  transitions removed (DEC-20260503-B), this won't self-correct on a passing
  test — it requires a manual flip.

## Silent-failure trigger check

The prompt's stop condition says: "Investigation reveals the capability has
been broken for more than 14 days and nobody noticed → halt." That trigger
does not cleanly fire here:

- The OLD Browserless implementation was *known* broken (suites set to
  `active = false`, `test_status = 'upstream_broken'`). That's a tracked
  deactivation, not silent failure.
- The NEW implementation shipped 2026-04-29, ~6 days ago — within the 14-day
  window.
- The cascade only became visible because PR1 introduced the new is_active gate
  that *checks* for 30d passing test results. The previous gate (`matrixSqs > 0`)
  apparently still let these solutions stay active despite the dead suites,
  which is itself a finding (the old gate was lenient).

So no Phase 1 (Contain) trigger. Proceeding with diagnosis.

## Recommended next action

Write a follow-up fix prompt that re-runs the onboarding pipeline with
`--backfill --discover --fix` against the existing manifest at
`manifests/singapore-company-data.yaml`. The new executor's output shape is
completely different from the old Browserless+LLM scrape, so simply flipping
`active = true` on the existing suites would fail every known_answer check
against stale `validation_rules`. Specifically the fix prompt should:

1. Run `cd apps/api && npx tsx scripts/onboard.ts --backfill --discover --fix --manifest ../../manifests/singapore-company-data.yaml` — regenerates fixtures, reactivates suites where the discovered output matches.
2. Update `capabilities.capability_type` from `'scraping'` to `'stable_api'` (the new executor is direct_api against data.gov.sg).
3. Reset `capabilities.lifecycle_state` from `'degraded'` to `'live'` once a test_result lands (manual flip; lifecycle is no longer automatic per DEC-20260503-B).
4. Verify with `npx tsx scripts/smoke-test.ts --slug singapore-company-data` and re-check `test_suites.active`.
5. Confirm the 3 SG solutions (kyb-essentials-sg, kyb-complete-sg, invoice-verify-sg) are no longer flagged by `apps/api/scripts/prepush-diagnostics.ts` Check B.

## Impact if unfixed

3 SG solutions deactivate on the next scheduler tick after PR1 deploys.
Singapore country coverage on Counterparty Assurance v1 is broken until the
test_suites are reactivated (or the cap is replaced with a healthy peer —
no SG peer exists today).

## Wider lesson worth flagging

This is a "test-suite reactivation gap after capability rewrite" pattern. When
a capability's underlying implementation is replaced (here: Browserless scrape
→ direct API), the rewrite session needs to also reactivate the suites and
refresh fixtures via the onboarding pipeline, otherwise the cap silently fails
to be tested. The 2026-04-29 SG rewrite shipped without that step and only
surfaced now because PR1's stricter is_active gate revealed the gap. Worth
adding a check to the Capability Onboarding Protocol checklist: "if rewriting
an existing capability, run `--backfill --discover` and verify all suites are
`active = true` afterward." (Not in scope of this investigation to land —
flag for Petter.)
