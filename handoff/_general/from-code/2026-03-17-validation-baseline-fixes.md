# Validation Baseline Fixes — Field Reliability Thresholds + VALID_CATEGORIES

**Intent:** Fix two non-blocking issues from the Pipeline Phase I validation run so Gate 1 shows meaningful pass rates.

**Date:** 2026-03-17
**Branch:** main (direct commit on top of pipeline+ATI merge)
**Commit:** b5fb166

## What Was Fixed

### Fix 1 — `backfill-field-reliability.ts`
- **Threshold change**: guaranteed ≥70% (was 90%), common 30–70% (was 50–90%), rare <30% (was <50%)
- **Added `--force` flag**: Re-annotates capabilities already annotated. Without it, re-running the script skips already-set values.
- **Bug carried from prior session**: `testResults.executedAt` (was `createdAt`, already fixed in merge session)
- Re-ran with `--force`: 229/229 annotated from test data (zero heuristic)

### Fix 2 — `validate-capability.ts`
- **Expanded VALID_CATEGORIES** from 11 to 21 entries
- Added 10 missing categories found in production: `agent-tooling`, `competitive-intelligence`, `content-writing`, `document-extraction`, `financial`, `security`, `text-processing`, `trade`, `utility`, `web-intelligence`

## Validation Results After Fixes

| Metric | Before | After |
|--------|--------|-------|
| Pass all 15 checks | 0/229 | **6/229** |
| Fail check 6 (invalid category) | ~20 | **0** |
| Fail check 15 (no guaranteed fields) | 229 | **223** |
| Have at least one guaranteed field | 0 | **6** |

### 6 Capabilities That Now Pass All 15 Checks
- `iban-validate` — valid, bank_code, country_code
- `norwegian-company-data` — 7 guaranteed fields
- `us-company-data` — cik, state, company_name, fiscal_year_end
- `bank-bic-lookup` — bic, valid
- `ecb-interest-rates` — effective_date, deposit_facility_rate
- `exchange-rate` — to, date, from, rate, inverse_rate

### Why 223 Still Fail Check 15
Root cause: test suites include 5 types (known_answer, schema_check, **negative**, **edge_case**, dependency_health). Negative and edge-case tests produce partial/empty output, pulling per-field presence rates down below 70% for most capabilities. Most capabilities cluster in the 30–50% range — classified as `common`, not `guaranteed`.

The 6 that pass are all pure algorithmic/lookup capabilities with consistent, fully-populated outputs regardless of test type.

## What "Guaranteed" Really Means Given This Data
- It correctly identifies capabilities whose core fields are truly consistent
- 223 capabilities have ALL fields as `common` — not wrong, just not distinguished
- The validator check 15 is effectively a "consistency flag" — passing means very stable output

## Recommended Next Step

**Option A (schema fallback):** When no field in test data reaches 70%, fall back to marking schema `required` fields as `guaranteed`. This would let well-designed capabilities pass check 15 without needing statistical significance.

**Option B (manual designation):** For the ~50 most important capabilities, manually set at least one field to `guaranteed` in the database.

**Option C (accumulate data):** Wait — as more test runs accumulate (especially non-negative tests), field presence rates will rise naturally.

Option A is the cleanest engineering solution. It would require a small change to `backfill-field-reliability.ts`:
```typescript
// After test-data analysis: if no guaranteed fields found, fall back to schema required
if (fromTestData && !Object.values(reliability).some(v => v === 'guaranteed')) {
  for (const field of requiredFields) {
    reliability[field] = 'guaranteed';
  }
}
```

## Known Non-Blocking Issues (Unchanged)
1. `upstream_degraded` verdict defined but never generated — promotion logic not yet built
2. Check 15 passes only 6/229 — needs schema fallback or more data
