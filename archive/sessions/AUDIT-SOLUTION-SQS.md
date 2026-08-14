# Audit: Solution SQS Scoring — Why "20 Degraded" Everywhere

**Date:** 2026-03-23
**Auditor:** Claude Code (automated)
**Scope:** Read-only. No code changes made. Scoring Integrity Protocol observed.

---

## A. Solution SQS Computation Path

### Finding
Solutions use `computeSolutionScore()` in `apps/api/src/lib/trust-labels.ts:37-43`, NOT the dual-profile model. The formula is:

```
avg = mean of all step matrixSqs values
min = lowest step matrixSqs value
result = Math.min(avg, min + 20)   ← "weak step cap"
```

The old `computeSolutionSQS()` was deleted in the cleanup prompt. All solution endpoints now read step-level `matrixSqs` from DB columns and aggregate via `computeSolutionScore()`.

### Evidence
- `trust-labels.ts:37-43` — `computeSolutionScore()` function
- `routes/solutions.ts:77` — GET /v1/solutions calls it
- `routes/internal-trust.ts:702` — batch endpoint calls it
- `routes/internal-trust.ts:825` — detail endpoint calls it

### Impact
The formula is correct by design. The issue is the INPUT DATA, not the formula. When any step has `matrixSqs = 0`, the cap becomes `0 + 20 = 20`, dragging the entire solution to 20 regardless of how well other steps score.

---

## B. Quality/Reliability Grades vs SQS Score

### Finding
**Confirmed inconsistency.** Quality and Reliability grades use a different aggregation than the headline SQS:

- **SQS score**: `computeSolutionScore()` — average capped at weakest + 20
- **Quality grade**: Weakest QP grade across all steps (e.g., worst step's QP)
- **Reliability grade**: Weakest RP grade across all steps

So a solution can show Quality: B (75+), Reliability: B (75+), but SQS: 20 (Degraded). This happens because QP/RP grades are derived from `qpScore`/`rpScore` columns which can remain populated even when `matrixSqs` decays to 0 (freshness decay only affects `matrixSqs`, not the profile scores).

### Evidence
- `routes/internal-trust.ts:711-712` — weakest-link for QP/RP
- `routes/internal-trust.ts:702` — `computeSolutionScore()` for headline SQS
- `routes/solutions.ts:81-88` — same pattern in catalog

### Impact
Users see B+B grades with a "20 Degraded" score. This is confusing but mathematically consistent — the grades reflect the pre-decay profile scores while the SQS reflects the freshness-decayed `matrixSqs`.

---

## C. Frontend Data Path — Solutions List Page

### Finding
The frontend at `strale-frontend/src/pages/Solutions.tsx` calls:
1. `GET /v1/solutions` — fetches solution summaries (includes `sqs`, `sqs_label`, `trend`)
2. `POST /v1/internal/trust/solutions/batch` — fetches trust badges

The SQS value displayed comes from the API response's `sqs` field, which is computed server-side by `computeSolutionScore()`. The "20" is NOT a frontend default or fallback — it comes directly from the API.

### Evidence
- `strale-frontend/src/pages/Solutions.tsx:38-44` — API calls
- `strale-frontend/src/components/solutions/SolutionCard.tsx:67` — `Math.round(trust.sqs)`
- `strale-frontend/src/components/solutions/sqs-display.ts:62-68` — `getSQSLabel()`: score < 25 → "Degraded"

### Impact
Frontend is displaying exactly what the API serves. No frontend bug.

---

## D. Per-Step Quality Breakdown

### Finding
The solution detail page quality breakdown calls `GET /v1/internal/trust/solutions/:slug` which returns per-step data from the same DB columns. A step showing "SQS 0" in the breakdown reads the same `capabilities.matrixSqs` column as the standalone capability page.

If a capability shows SQS 94 on its own page but SQS 0 in the solution breakdown, the issue is **timing** — the standalone page may be reading from a different cache or the score was updated between the two requests.

### Evidence
- `routes/internal-trust.ts:771-777` — per-step data from DB columns
- `strale-frontend/src/components/solutions/ZoneBReliability.tsx` — renders per-step data

### Impact
Per-step scores in the breakdown should match standalone pages since both read from the same DB column. Any discrepancy is a cache timing issue.

---

## E. Staleness / Freshness

### Finding
The staleness refresh job (`apps/api/src/jobs/refresh-stale-scores.ts`) runs every 2 hours and re-decays `matrixSqs` for capabilities that haven't been tested recently. The 5-level freshness system:

- **fresh**: ≤ 2× schedule interval → 0 decay
- **aging**: ≤ 4× → 0 decay (visibility only)
- **stale**: ≤ 8× → moderate decay
- **expired**: ≤ 12× → heavy decay
- **unverified**: > 12× or > 30 days → score → 0

For solutions, freshness is derived from constituent capabilities' `freshnessLevel` — the worst level among all steps is used.

### Evidence
- `apps/api/src/lib/freshness-decay.ts` — `computeFreshnessDecay()` and `applyFreshnessDecay()`
- `apps/api/src/jobs/refresh-stale-scores.ts` — staleness refresh job
- `apps/api/src/routes/solutions.ts:101` — `worstFreshnessLevel(steps.map(...))`

### Impact
When `email-validate` and `dns-lookup` go untested for >30 days, they become "unverified" and their `matrixSqs` decays to 0. This pulls every solution containing them down to SQS ≤ 20.

---

## F. The "20" Score Specifically

### Finding
**The score of 20 is mathematically correct given the current data.**

Live API data for `invoice-verify-uk` (14 steps):

| Capability | matrixSqs | Freshness |
|---|---|---|
| uk-company-data | 96.1 | fresh |
| vat-validate | 84.6 | aging |
| vat-format-validate | 93.0 | expired |
| iban-validate | 94.5 | stale |
| bank-bic-lookup | 93.0 | expired |
| sanctions-check | 76.3 | fresh |
| adverse-media-check | MISSING | — |
| invoice-validate | 93.0 | expired |
| domain-reputation | 91.1 | expired |
| whois-lookup | 95.1 | stale |
| **email-validate** | **0** | **unverified** |
| **dns-lookup** | **0** | **unverified** |
| redirect-trace | 94.5 | stale |
| risk-narrative-generate | MISSING | — |

**Computation:**
- `min = 0` (email-validate and dns-lookup have matrixSqs = 0)
- `cap = min + 20 = 0 + 20 = 20`
- `avg ≈ 65` (sum of all steps / 14, treating MISSING as 0)
- `result = Math.min(65, 20) = 20`

The "20" comes from the weak-step cap formula: `Math.min(avg, min + 20)`. When ANY step has score 0, the entire solution is capped at 20.

### Evidence
- Live API response: `curl -s https://api.strale.io/v1/solutions | python3 -c "..."` → SQS: 20
- Individual capability scores verified via `GET /v1/capabilities`
- Formula in `trust-labels.ts:42`

### Impact
This is the root cause. Two free-tier capabilities (`email-validate`, `dns-lookup`) have decayed to SQS 0 because they haven't been tested in >30 days ("unverified" freshness). Since these capabilities appear as steps in MANY solutions, the +20 cap drags ALL those solutions to SQS 20.

---

## Summary

### Confirmed Bugs

| # | Severity | Description |
|---|----------|-------------|
| BUG-1 | **CRITICAL** | `email-validate` and `dns-lookup` have `matrixSqs = 0` with freshness "unverified". These are free-tier capabilities that should be among the most reliable. They appear as steps in 40+ solutions, pulling ALL of them to SQS ≤ 20. |
| BUG-2 | **HIGH** | `adverse-media-check` and `risk-narrative-generate` are MISSING from the capabilities list response (possibly `is_active = false` or `matrixSqs IS NULL`). Their missing scores contribute 0 to solution averages. |
| BUG-3 | **MEDIUM** | The freshness decay system can silently zero out healthy capabilities if tests haven't run — even if the capability itself is working perfectly. This is a design issue, not a code bug: freshness measures "when was it last tested" not "is it working." |

### Confirmed Inconsistencies

| # | Description |
|---|---|
| INC-1 | Quality: B + Reliability: B + SQS: 20 Degraded — grades come from profile scores (not freshness-decayed), while SQS comes from decayed matrixSqs. These are structurally different metrics shown side-by-side without explanation. |
| INC-2 | A capability can show SQS 94 on its own page but SQS 0 inside a solution breakdown if the matrixSqs column has decayed since the last test run. |

### Recommended Investigation Order

1. **IMMEDIATE**: Check why `email-validate` and `dns-lookup` haven't been tested in 30+ days. These are free-tier capabilities with the simplest test fixtures. Are their test suites active? Is the scheduler running them? Is there a dependency issue?

2. **IMMEDIATE**: Check the status of `adverse-media-check` and `risk-narrative-generate`. Are they active? Do they have test suites? Why is `matrixSqs` NULL?

3. **SHORT-TERM**: Consider whether the +20 cap formula is appropriate when freshness decay can zero out a step. One option: use `matrixSqsRaw` (pre-decay) for solution aggregation, with the freshness tag as separate metadata. This way freshness information is preserved but doesn't cascade to destroy solution scores.

4. **SHORT-TERM**: Address INC-1 — either show the grades alongside the decayed score with an explanation, or compute grades from the same decayed source as the headline SQS.
