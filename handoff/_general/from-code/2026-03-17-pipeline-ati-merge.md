# Pipeline Phase I + ATI Phase A: Verification & Merge

**Intent:** Verify both feature branches, fix issues, merge to main, run post-deploy steps.

**Date:** 2026-03-17
**Merged to main:** Yes (pushed)

## Branches Merged

### 1. feat/pipeline-phase-1 (3 commits)
- Migration 0023: `lifecycle_state`, `output_field_reliability`, `visible`, `onboarding_manifest` columns + `health_monitor_events` table
- Public endpoints filter by `visible` + `lifecycle_state`
- Scripts: `validate-capability.ts` (15-check Gate 1), `smoke-test.ts` (7-step E2E), `backfill-field-reliability.ts`
- Test runner respects field reliability annotations (guaranteed/common/rare)

### 2. feat/ati-phase-a (1 commit on top of pipeline-phase-1)
- `upstream-tracker.ts`: 48h transient escalation, 7d changed flagging via `health_monitor_events`
- `apply-test-status.ts`: won't-fix annotations for 4 capabilities
- Quality endpoints (`/v1/quality/:slug`, `/v1/internal/trust/capabilities/:slug`) include `failure_classification` breakdown
- Test runner wired to upstream escalation check post-run
- Health sweep runs bulk upstream escalation

## Verification Results

| Check | Result |
|-------|--------|
| Branch structure | ATI based on pipeline-phase-1 (correct) |
| Type-check | Clean compile, zero errors |
| Schema consistency | All 12 columns/tables verified in schema.ts |
| Migrations | 0018 (ATI columns), 0023 (Pipeline Phase I) — both present and correct |
| All files exist | 9/9 expected files present |
| Failure classifier | 7 verdicts implemented, correct precedence. `upstream_degraded` defined but never generated (by design — promotion not yet built) |
| SQS computation | ROLLING_RUNS=10, MIN_RUNS=5, linear decay, evidence filtering, circuit breaker, Building/Unverified states — all verified |
| Test runner wiring | classifyFailure called in 6 paths, verdict stored in every insert, field reliability respected, upstream escalation wired |
| Query filters | All 5 endpoint filters verified correct (capabilities list/detail, do direct/search, suggest) |

## Post-Deploy Results

### Schema Push
- Drizzle push applied `lifecycle_state`, `output_field_reliability`, `visible`, `onboarding_manifest`, `health_monitor_events` table

### Backfill: Field Reliability
- 229/229 capabilities annotated from test data (zero heuristic)
- 7 uncertain cases near thresholds flagged for manual review
- **Bug fixed:** `backfill-field-reliability.ts` referenced `testResults.createdAt` (doesn't exist) — fixed to `testResults.executedAt`

### Test Status Annotations
- ecb-interest-rates: 5 suites → `infra_limited`
- page-speed-test: 6 suites → `env_dependent`
- youtube-summarize: 3 suites → `env_dependent`
- norwegian-company-data: 7 suites → `upstream_broken`

### Validation Baseline
- **0/229 pass all 15 checks** (expected — establishing baseline, not blocking)
- **Universal failure: check 15 "No guaranteed fields"** — backfill's 90% threshold classified all fields as `common` given current test result patterns. Most test outputs have ~50% field presence rates. This needs either: (a) more test results to build statistical significance, or (b) manual guaranteed field designation for core capabilities.
- **~20 capabilities fail check 6 "Invalid category"** — categories like `utility`, `document-extraction`, `competitive-intelligence`, `security`, `agent-tooling` not in validator allowlist. Either update the validator's VALID_CATEGORIES or re-categorize the capabilities.

### Smoke Test
- email-validate: all 7 steps pass (dry-run mode), SQS = 98

### Production Quality API
- `GET /v1/quality/email-validate` returns `failure_classification: { "unknown": 31 }` — confirms new field is live. "unknown" count is from pre-classification test results.

## Issues Found & Fixed
1. `backfill-field-reliability.ts` line 86: `testResults.createdAt` → `testResults.executedAt` (column doesn't exist on test_results table)

## Known Issues (Not Blocking)
1. `upstream_degraded` verdict is defined in types but never generated — promotion logic (transient → degraded) not yet built
2. Validator check 15 threshold too strict — 90% presence rate leaves all capabilities without guaranteed fields
3. Validator check 6 category allowlist incomplete — 7+ categories in use but not in VALID_CATEGORIES

## What's Next
- **HM-1** (Health Monitor event logging wiring) — next pipeline phase
- **Pipeline Phase II** (lifecycle transitions) — uses upstream-tracker for automated state changes
- Consider lowering guaranteed threshold from 90% to 70%, or manually designating guaranteed fields for core capabilities
- Add missing categories to validator allowlist (`utility`, `security`, `agent-tooling`, `document-extraction`, `competitive-intelligence`, `text-processing`, `content-writing`, `financial`, `web-intelligence`)
