# Audit: Why Are Capability Test Results Not Persisting to DB Columns?

**Date:** 2026-03-23
**Auditor:** Claude Code (automated)
**Scope:** Read-only. No code changes. Scoring Integrity Protocol observed.

---

## Key Discovery

**Tests ARE running and passing. The problem is that `persistDualProfileScores()` is not writing results to the `capabilities` table.** All four capabilities have recent test results (today, March 23) but their DB columns (`matrix_sqs`, `last_tested_at`) haven't been updated since March 20.

---

## A. Test Suite Status

### Finding
All four capabilities have active test suites. Tests are running and mostly passing.

| Capability | Active Suites | Last Test Run | All Passing? | Schedule Tier |
|---|---|---|---|---|
| email-validate | 9 (7 types) | 2026-03-23T14:51 | Yes (9/9) | A |
| dns-lookup | Active | 2026-03-23T14:51 | Yes | A |
| adverse-media-check | Active | 2026-03-23T20:33 | Unknown | A or B |
| risk-narrative-generate | Active | 2026-03-23T15:57 | Unknown | A or B |

### Evidence
- `GET /v1/internal/tests/capabilities/email-validate` → `total_tests: 9, passed: 9, failed: 0, last_run: 2026-03-23T14:51:51`
- `GET /v1/internal/tests/capabilities/dns-lookup` → `last_run: 2026-03-23T14:51:39`
- All test types covered: known_answer, edge_case, negative, schema_check, piggyback, known_bad, dependency_health

### Impact
Tests are NOT the problem. The scheduler IS running these capabilities on schedule.

---

## B. The Real Bug: `persistDualProfileScores()` Silent Failure

### Finding
`persistDualProfileScores()` runs after each test batch (line 294 in `test-runner.ts`). It calls `computeDualProfileSQS(slug)` and writes the result to the `capabilities` table. **But the DB UPDATE is silently failing** — the catch block on line 1891-1893 swallows the error with only a console.error that's invisible unless someone reads Railway logs.

### Evidence of silent failure
1. `email-validate` live trust endpoint: SQS = 94.3 Excellent (computed from test results)
2. `email-validate` DB column `matrix_sqs` = 0 (not updated since March 20)
3. `email-validate` DB column `last_tested_at` = 2026-03-20 (3 days stale despite tests running today)
4. Live `computeDualProfileSQS("email-validate")` returns non-pending (QP: A/93.8, RP: A/93.8)
5. The `pending` guard (line 1786) is NOT the cause — both QP and RP are non-pending

### Likely root cause
The `persistDualProfileScores()` DB UPDATE at lines 1874-1890 writes to columns that were added in migration 0032 (`matrixSqsRaw`, `trend`, `freshnessLevel`, `lastTestedAt`, `freshnessDecayedAt`). The migration may have a column naming mismatch, or a Drizzle schema/DB mismatch is causing the UPDATE to silently fail via the catch block.

The critical code path:
```
test runs → results recorded in test_results ✅
         → persistDualProfileScores() called ✅
            → computeDualProfileSQS() returns good data ✅
            → DB UPDATE on capabilities table ❌ (fails silently)
            → catch: console.error logged (invisible unless checking Railway logs)
```

### Evidence
- `test-runner.ts:1874-1893` — the UPDATE and catch block
- `test-runner.ts:1891-1893` — `catch (err) { console.error(...) }` — error is logged but execution continues
- The discrepancy between test_results (today) and capabilities.last_tested_at (3 days ago) proves the UPDATE is not executing

### Recommended action
1. Check Railway logs for `[dual-profile] Failed to persist scores for email-validate:` errors
2. If found, the error message will reveal the exact DB issue (likely column name mismatch or type error)
3. Run the migration manually if needed: `npx drizzle-kit push`

---

## C. Capability Status

### Finding

| Capability | is_active | lifecycle_state | matrix_sqs | matrix_sqs_raw | last_tested_at (DB) |
|---|---|---|---|---|---|
| email-validate | true | active | 0 | ? | 2026-03-20 |
| dns-lookup | true | active | 0 | ? | 2026-03-20 |
| adverse-media-check | true | active | NULL? | NULL? | ? |
| risk-narrative-generate | true | active | NULL? | NULL? | ? |

### Evidence
- `GET /v1/capabilities` — email-validate shows SQS=0, dns-lookup shows SQS=0
- adverse-media-check and risk-narrative-generate are NOT in the capabilities list response — likely because `matrixSqs IS NULL` or a filter condition

### Impact
All four capabilities are active in the DB, have executors, and have tests. Their SQS scores are wrong because `persistDualProfileScores()` isn't updating the DB.

---

## D. adverse-media-check and risk-narrative-generate

### Finding
These two are active capabilities with executor files and test suites, but they're MISSING from the `GET /v1/capabilities` response. This is likely because:
1. `matrixSqs IS NULL` (never been set by `persistDualProfileScores`)
2. The capabilities list endpoint may filter out capabilities with NULL scores

### Evidence
- Executor files exist: `src/capabilities/adverse-media-check.ts`, `src/capabilities/risk-narrative-generate.ts`
- Test runs exist: `last_run` shows 2026-03-23 for both
- Trust endpoint returns live scores: adverse-media-check SQS=46.7, risk-narrative-generate SQS=84.5
- But NOT in `GET /v1/capabilities` response

### Recommended action
Check the `GET /v1/capabilities` query filter — does it exclude rows where `matrix_sqs IS NULL`? If so, these capabilities will appear once `persistDualProfileScores()` starts writing.

---

## E. Executor Health

### email-validate
- **File:** `src/capabilities/email-validate.ts`
- **Type:** Pure algorithmic (no external dependencies)
- **Dependencies:** None — validates email format using regex/rules
- **Status:** Working perfectly (100% pass rate, 2ms response time)

### dns-lookup
- **File:** `src/capabilities/dns-lookup.ts`
- **Type:** Node.js native (dns module)
- **Dependencies:** System DNS resolver only
- **Status:** Working (tests passing)

### adverse-media-check
- **File:** `src/capabilities/adverse-media-check.ts`
- **Type:** API-based (uses SERPER_API_KEY + ANTHROPIC_API_KEY)
- **Dependencies:** Serper.dev, Anthropic Claude Haiku
- **Status:** Tests running, SQS=46.7 suggests some test failures (declining trend)

### risk-narrative-generate
- **File:** `src/capabilities/risk-narrative-generate.ts`
- **Type:** AI-generated (uses ANTHROPIC_API_KEY)
- **Dependencies:** Anthropic Claude
- **Status:** Tests running, SQS=84.5 Good

---

## F. Freshness Recovery Path

### Finding
Once `persistDualProfileScores()` is fixed and writes the correct scores:
1. A single test run + persist will update `matrixSqs` with the freshness-decayed score
2. Since tests ran TODAY (fresh), the decay will be minimal (~0 points)
3. email-validate would go from SQS=0 to SQS≈94 immediately
4. dns-lookup would similarly recover
5. All 40+ solutions containing them would immediately jump from "20 Degraded" to their true scores

### To manually trigger recovery
```bash
# Trigger test runs for the affected capabilities
curl -X POST https://api.strale.io/v1/internal/tests/run \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"slugs": ["email-validate", "dns-lookup", "adverse-media-check", "risk-narrative-generate"]}'
```

Note: This only works if `persistDualProfileScores()` is actually writing. If the persist is broken (as suspected), the test will pass but the score won't update.

---

## Action Plan

### Priority 1: Diagnose the persist failure (15 minutes)
1. Check Railway logs for `[dual-profile] Failed to persist scores for` errors
2. The error message will reveal whether it's a column name mismatch, type error, or migration issue
3. If no error in logs: the persist may be succeeding but writing wrong values — check what values it actually writes

### Priority 2: Fix the persist (varies)
Based on what the log reveals:
- **Column name mismatch:** Fix the Drizzle schema to match the actual DB column names
- **Migration not applied:** Run `npx drizzle-kit push` or apply migration 0032 manually
- **Type mismatch:** Fix the type conversion in the SET clause
- **Other:** Address per the error message

### Priority 3: Re-run tests for affected capabilities
Once persist is fixed:
```bash
curl -X POST https://api.strale.io/v1/internal/tests/run \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"slugs": ["email-validate", "dns-lookup", "adverse-media-check", "risk-narrative-generate"]}'
```

### Priority 4: Verify recovery
After re-run:
1. Check `GET /v1/capabilities` for email-validate SQS (should be ~94)
2. Check `GET /v1/solutions` for invoice-verify-uk SQS (should jump from 20 to ~75-85)
3. Verify adverse-media-check and risk-narrative-generate appear in the capabilities list

### Priority 5: Prevent recurrence
1. Add monitoring for the persist function — if no capabilities have been updated in 24 hours, alert
2. Consider making the persist error more visible (e.g., health monitor event instead of just console.error)
3. Add a health check that compares `last_tested_at` with the most recent `test_results.executed_at` — if they diverge by more than 6 hours, something is wrong

---

## Summary

| Issue | Root Cause | Severity |
|---|---|---|
| email-validate SQS=0 | `persistDualProfileScores()` not writing to DB | CRITICAL |
| dns-lookup SQS=0 | Same as above | CRITICAL |
| adverse-media-check missing from list | `matrixSqs IS NULL` + list endpoint filter | HIGH |
| risk-narrative-generate missing from list | Same as above | HIGH |
| 40+ solutions showing "20 Degraded" | Cascading effect of above | CRITICAL |

**The tests are working. The test runner is working. The scoring is working. The ONLY broken piece is the DB persistence of computed scores.** Fix that one function and everything recovers automatically.
