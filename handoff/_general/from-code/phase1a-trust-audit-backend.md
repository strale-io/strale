# Phase 1A: Trust Data Consistency Audit — Backend

**Date:** 2026-03-23
**Scope:** Read-only audit of every backend path that produces, stores, or serves SQS/trust/quality data
**Scoring Integrity Protocol:** No scoring logic changes recommended or made

---

## 1. Endpoint Map — Every Route That Serves Trust Data

| # | Route | HTTP | Scoring Source | Freshness Decay? | Trend Source | Returns Score? | Returns Grades? | Returns Freshness? | Cache |
|---|-------|------|----------------|------------------|-------------|----------------|-----------------|--------------------|----|
| 1 | `/v1/capabilities` | GET | `capabilities.matrixSqs` column (cached DB) | **NO** | Hardcoded `"stable"` | Yes | Yes (derived from qp/rpScore) | No | None |
| 2 | `/v1/capabilities/:slug` | GET | None | N/A | N/A | **No** | No | No | None |
| 3 | `/v1/solutions` | GET | `capabilities.matrixSqs` per step → avg+cap | **NO** | Hardcoded `"stable"` | Yes | Yes (worst step) | No | None |
| 4 | `/v1/solutions/:slug` | GET | None | N/A | N/A | **No** | No | No | None |
| 5 | `/v1/quality/:slug` | GET | `computeDualProfileSQS()` live | **NO** | `dual.rp.trend` | Yes | Yes (full QP/RP) | Category only (not staleness) | HTTP 5 min |
| 6 | `/v1/internal/quality/capabilities/:slug` | GET | `computeDualProfileSQS()` live | **NO** | `dual.rp.trend` | Yes | Yes (QP/RP grades) | No | None |
| 7 | `/v1/internal/quality/solutions/:slug` | GET | Per-step `computeDualProfileSQS()` | **NO** | `dual.rp.trend` per step | Yes | Yes | No | None |
| 8 | `/v1/internal/trust/capabilities/batch` | GET | `computeDualProfileSQS()` + `applyFreshnessDecay()` | **YES** | RP trend + freshness override → may be `"stale"` | Yes (raw + decayed) | Yes | Yes (`freshness_level`) | SWR 2m/30m |
| 9 | `/v1/internal/trust/capabilities/:slug` | GET | `computeDualProfileSQS()` + `applyFreshnessDecay()` | **YES** | RP trend + freshness override → may be `"stale"` | Yes (raw + decayed) | Yes (full factors) | Yes (level, last_tested, decay) | SWR 2m/30m |
| 10 | `/v1/internal/trust/capabilities/:slug/sqs-history` | GET | `sqsDailySnapshot` table | At snapshot time | From snapshot | Yes | Yes | No | SWR 2m/30m |
| 11 | `/v1/internal/trust/solutions/batch` | GET | Per-step `computeDualProfileSQS()` + `applyFreshnessDecay()` | **YES** per step | Majority vote; stale overrides all | Yes | Yes | Implicit (in trend) | SWR 2m/30m |
| 12 | `/v1/internal/trust/solutions/:slug` | GET | Per-step `computeDualProfileSQS()` + `applyFreshnessDecay()` | **YES** per step | Majority vote; stale overrides all | Yes (+ raw per step) | Yes (full) | Yes (per step via trend) | SWR 2m/30m |
| 13 | `POST /v1/do` (response) | POST | `computeDualProfileSQS()` | **NO** | `dual.rp.trend` | Yes | Yes (QP/RP grades) | No | None |
| 14 | `POST /v1/suggest` | POST | From suggest catalog (cached) | **NO** | No | Yes | No | No | HTTP 1 min |
| 15 | `GET /v1/suggest/typeahead` | GET | From suggest catalog | **NO** | No | Partial | No | No | HTTP 30s |
| 16 | `GET /.well-known/agent-card.json` | GET | `capabilities.matrixSqs` column | **NO** | No | In description text | No | No | HTTP 1h |

---

## 2. Function Dependency Graph

```
CANONICAL ENTRY POINT (all trust endpoints use this):
computeDualProfileSQS(slug)          [sqs.ts:761]  10-min cache
├── computeQualityProfile(slug)      [quality-profile.ts:100]
│   └── computeQPFromRows()          [quality-profile.ts:210]
├── computeReliabilityProfile(slug)  [reliability-profile.ts:160]
│   ├── computeHealthState()         [health-state.ts:3]
│   ├── scoreLatency()               [reliability-profile.ts:130]
│   └── getCapabilityQuality()       [quality-aggregation.ts:58]  5-min cache
├── computeMatrixSQS(qp, rp)        [sqs-matrix.ts:63]
│   └── gradePosition()              [sqs-matrix.ts:106]
└── computeCapabilitySQS(slug)       [sqs.ts:167]  ← LEGACY, for legacy_score only
    └── computeFromRows()            [sqs.ts:398]  ← LEGACY helper
        └── computeTrend()           [sqs.ts:564]  ← LEGACY helper

FRESHNESS (applied by trust endpoints and persistence):
computeFreshnessDecay(lastTested, tierHours)  [freshness-decay.ts:30]
applyFreshnessDecay(rawSqs, freshness)        [freshness-decay.ts:123]
shouldOverrideTrend(freshness)                [freshness-decay.ts:141]

PERSISTENCE (called after test runs):
persistDualProfileScores(slugs)      [test-runner.ts:~970]
├── computeDualProfileSQS(slug)
├── computeExecutionGuidance()
├── computeFreshnessDecay()
├── applyFreshnessDecay()
└── DB UPDATE capabilities SET qp_score, rp_score, matrix_sqs, guidance_*

LEGACY (not called by any current endpoint directly):
computeSolutionSQS(stepSlugs)        [sqs.ts:293]  ← DEAD CODE (no callers)
```

---

## 3. Inconsistency Register

### I-1: CRITICAL — Score divergence between list and detail endpoints

**What:** Solutions list page gets score from `GET /v1/solutions` (cached `matrixSqs` column), detail page gets score from `GET /v1/internal/trust/solutions/:slug` (live computation with freshness decay).

**Magnitude:** Score differences of 0–5+ points observed. Can cross grade thresholds (91 → 89 crosses the 90 Excellent/Good boundary).

**Root cause:** `persistDualProfileScores()` writes `matrixSqs` with freshness decay at write time, but the decay amount changes with elapsed time. By the time the trust endpoint recomputes, more time has passed → more decay.

**Severity:** HIGH — users see different scores on different pages.

### I-2: CRITICAL — Trend divergence between list and detail endpoints

**What:** Solutions list page calls `GET /v1/internal/trust/solutions/batch` for trust badges (real trend like "improving"), but the detail page calls `GET /v1/internal/trust/solutions/:slug` which may compute different trend due to stale-while-revalidate cache timing.

**Even worse:** `GET /v1/solutions` hardcodes `trend: "stable"` on line 114 — but the frontend doesn't use this field for display (it overlays the batch trust data).

**Severity:** HIGH — "Improving" on list vs "Stale" on detail page.

### I-3: MEDIUM — Hardcoded trend in catalog endpoints

**What:** `GET /v1/capabilities` (line 85) and `GET /v1/solutions` (line 114) both return `trend: "stable"` as hardcoded values. This is never the actual trend.

**Impact:** Any consumer that reads trend from these endpoints gets wrong data. The frontend works around this by overlaying trust batch data.

**Severity:** MEDIUM — misleading for API consumers and SDK users, but frontend ignores it.

### I-4: MEDIUM — Freshness decay applied inconsistently

**What:** Freshness decay is applied by:
- `persistDualProfileScores()` → writes decayed score to `matrixSqs` column
- `GET /v1/internal/trust/capabilities/batch` → applies decay at request time
- `GET /v1/internal/trust/capabilities/:slug` → applies decay at request time
- `GET /v1/internal/trust/solutions/batch` → applies per-step decay
- `GET /v1/internal/trust/solutions/:slug` → applies per-step decay

Freshness decay is NOT applied by:
- `GET /v1/quality/:slug` (returns raw dual-profile score)
- `GET /v1/internal/quality/capabilities/:slug` (returns raw)
- `GET /v1/internal/quality/solutions/:slug` (returns raw)
- `POST /v1/do` response (returns raw)
- `GET /v1/capabilities` (reads cached `matrixSqs` which was decayed at write time but may be stale)

**Severity:** MEDIUM — two scores possible for same capability depending on which endpoint is called.

### I-5: LOW — `computeSolutionSQS()` is dead code

**What:** `computeSolutionSQS()` in sqs.ts (line 293) has zero callers. It computes legacy single-composite solution SQS.

**Impact:** None (dead code), but confusing for developers reading the codebase.

**Severity:** LOW — cleanup opportunity.

### I-6: LOW — `successRate` column is legacy but still read

**What:** `capabilities.successRate` is never written by the test pipeline but is still referenced in `matching.ts` for capability matching/ranking.

**Severity:** LOW — matching uses it as a tiebreaker, not primary signal.

### I-7: MEDIUM — POST /v1/do does not apply freshness decay

**What:** The execute endpoint returns trust data via `buildDualProfileResponse()` which calls `computeDualProfileSQS()` directly without applying freshness decay. An agent could get a score of 91 from `/v1/do` while the trust detail shows 89.

**Severity:** MEDIUM — could affect agent decision-making if they compare pre/post-execution quality.

### I-8: LOW — SWR cache can serve stale trust data

**What:** Internal trust endpoints use stale-while-revalidate (2 min fresh, 30 min stale). Two requests within the 30-min window may get different scores if one triggers revalidation.

**Severity:** LOW — inherent in SWR pattern, usually resolves within seconds.

---

## 4. Legacy Code Inventory

### Actively Called (Bridge Code)
| Function | File | Called By | Purpose |
|---|---|---|---|
| `computeCapabilitySQS()` | sqs.ts:167 | `computeDualProfileSQS()` | Produces `legacy_score` for regression comparison |
| `computeFromRows()` | sqs.ts:398 | `computeCapabilitySQS()` | Internal helper for legacy model |
| `computeTrend()` (sqs.ts) | sqs.ts:564 | `computeFromRows()` | Legacy trend computation |
| `scoreToLabel()` (sqs.ts) | sqs.ts:132 | `computeFromRows()` | Legacy label mapping |

### Dead Code (Zero Callers)
| Function | File | Notes |
|---|---|---|
| `computeSolutionSQS()` | sqs.ts:293 | Was the legacy solution scorer. Replaced by inline solution aggregation in internal-trust.ts |

### Legacy Types
| Type | File | Status |
|---|---|---|
| `SQSResult` | sqs.ts:60 | Still used as return type of `computeCapabilitySQS()` and `computeFromRows()`. Has legacy-only fields (`availability` factor, `circuit_breaker`, `external_service_issues`). |

### Legacy Constants
| Constant | File | Status |
|---|---|---|
| `WEIGHTS` | sqs.ts:91 | `{correctness: 0.40, schema: 0.25, availability: 0.20, error_handling: 0.10, edge_cases: 0.05}` — only used by legacy `computeFromRows()`. Current QP uses different weights in quality-profile.ts. |
| `NEUTRAL_DEFAULT = 70` | sqs.ts:98 | Only used by legacy model for missing-factor re-weighting. |

---

## 5. Agent Surface Audit

### POST /v1/do (Primary agent interface)
- Returns: `quality.sqs`, `quality.label`, `quality_profile.grade`, `reliability_profile.grade`, `quality.trend`
- **No freshness decay applied** — raw dual-profile score
- **No freshness level exposed** — agent doesn't know if data is stale
- **Compact execution guidance** — usable, strategy, confidence (3 fields vs 10 in trust detail)
- **Inconsistency with website**: Agent sees raw score, website trust page shows decayed score

### MCP Tools (strale_search, strale_do)
- strale_search: Returns capability descriptions with SQS score text from `GET /v1/capabilities` (cached DB column, no freshness)
- strale_do: Proxies to `POST /v1/do` — same issues as above

### A2A Agent Card
- Skills include "SQS: {score}/100" in descriptions
- Source: `capabilities.matrixSqs` column (decayed at write time, potentially stale)
- **No trend, freshness, or grades exposed**

### GET /v1/capabilities (public catalog)
- Returns: sqs, sqs_label, quality grade, reliability grade, trend (hardcoded "stable"), usable, strategy
- **Trend always "stable"** regardless of actual trend
- **No freshness data**

---

## 6. Trend/Freshness Map

### Trend Values
| Value | Meaning | Source | Where Used |
|---|---|---|---|
| `"stable"` | Score not changing significantly | `computeTrend()` in RP (needs 6+ runs, <5pt diff) | Trust endpoints, quality endpoint |
| `"improving"` | Recent scores trending up | `computeTrend()` in RP (>5pt improvement) | Trust endpoints, quality endpoint |
| `"declining"` | Recent scores trending down | `computeTrend()` in RP (>5pt decline + 3 failures in legacy) | Trust endpoints, quality endpoint |
| `"stale"` | Not recently tested | `shouldOverrideTrend()` when freshness is stale/expired/unverified | Trust endpoints ONLY |
| `"stable"` (hardcoded) | Placeholder | Hardcoded literal | `/v1/capabilities`, `/v1/solutions` |

### Freshness Values (from `computeFreshnessDecay()`)
| Level | Condition | Decay Points | Trend Override? |
|---|---|---|---|
| `"fresh"` | ≤ 2× schedule interval | 0 | No |
| `"aging"` | ≤ 4× schedule interval | 0 (visibility only) | No |
| `"stale"` | ≤ 8× schedule interval | floor(intervalsOverdue − 3) | **Yes → "stale"** |
| `"expired"` | ≤ 12× schedule interval | floor(intervalsOverdue − 3), floor 50 | **Yes → "stale"** |
| `"unverified"` | > 12× interval or > 30 days | Infinity (score → 0) | **Yes → "stale"** |

### Key Distinction: Trend ≠ Freshness
- **Trend** measures score trajectory (improving/declining based on recent pass rates)
- **Freshness** measures test recency (when was this capability last tested?)
- They are **conflated** in the trust endpoints: freshness can override trend to "stale"
- The frontend displays "↑ Improving" from trend, "⏱ Stale — not recently tested" from freshness override
- Different endpoints may show different values because freshness override is only applied in trust endpoints

### Where "↑ Improving" Comes From
- Frontend solutions list: `useSolutionsTrustBatch()` → `GET /v1/internal/trust/solutions/batch`
- The batch endpoint computes trend per step via `computeDualProfileSQS()` → RP trend
- If no step is stale, majority vote of step trends wins
- Returned as `sqs.trend: "improving"` in the batch response

### Where "⏱ Stale — not recently tested" Comes From
- Frontend solution detail: `useSolutionTrust()` → `GET /v1/internal/trust/solutions/:slug`
- The detail endpoint computes freshness per step via `computeFreshnessDecay()`
- If ANY step is stale/expired/unverified, `shouldOverrideTrend()` → true → trend becomes `"stale"`
- Returned as `sqs.trend: "stale"` in the detail response

### Why They Differ for the Same Solution
Both endpoints compute live, but:
1. **SWR cache timing**: The batch may have been cached 5 minutes ago when no step was stale. The detail endpoint recomputes now when one step has crossed the staleness threshold.
2. **freshness decay sensitivity**: A step that was "fresh" 5 minutes ago may now be "stale" (crossed 2× schedule interval). The batch cache hasn't expired yet.
3. **No shared cache**: The batch and detail endpoints have separate SWR caches.

---

## Summary

The core architectural issue is that **trust data flows through 4 different paths**, each with different processing:

1. **Cached DB column** (`capabilities.matrixSqs`): Decayed at write time, read by catalog endpoints and agent card. Never recomputed at read time.
2. **Live dual-profile** (`computeDualProfileSQS()`): 10-min in-memory cache. Used by quality endpoints. No freshness decay at read time.
3. **Live dual-profile + freshness decay**: Used by trust endpoints. Applies decay at read time. May override trend to "stale".
4. **Daily snapshot**: Point-in-time capture for historical trends. Decayed at snapshot time.

These four paths can produce 4 different scores for the same capability at the same moment.
