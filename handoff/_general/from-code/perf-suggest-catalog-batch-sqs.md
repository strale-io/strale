# Suggest Catalog: Persisted SQS + Stale-While-Revalidate Cache

**Intent:** Reduce suggest catalog DB queries from ~5,355 to 2-3 by reading persisted SQS scores, and add stale-while-revalidate caching to trust endpoints.

**Date:** 2026-03-21

---

## Changes Made

### A) Suggest catalog — batch persisted SQS (suggest.ts)

**Before:** Lines 298-367 looped over all ~330 catalog items with `pLimit(10)`, calling per-item:
- `getCapabilityQuality()` — 1+ queries
- `getTestResultsForSlug()` — S+1 queries (S = test suites, avg ~8)
- `computeDualProfileSQS()` — ~12 queries
- For solutions: `getSolutionQuality()` + per-step `getTestResultsForSlug()` + `computeSolutionSQS()`

**Total: ~5,355 queries every 10 minutes** (catalog cache TTL).

**After:** Two batch queries:
1. `SELECT slug, matrix_sqs, success_rate, avg_latency_ms FROM capabilities WHERE is_active = true` — persisted scores from last test batch run
2. `WITH latest_results AS (SELECT DISTINCT ON (test_suite_id) ...) SELECT capability_slug, COUNT(*) FILTER (WHERE passed), COUNT(*), MAX(executed_at) FROM latest_results GROUP BY capability_slug` — batch test counts

**Total: 2 queries.** Reduction: ~99.96%.

For solutions, SQS is derived from step capability scores using the floor-aware formula (avg capped at lowest + 20), matching `computeSolutionSQS` logic.

Removed imports: `pLimit`, `getCapabilityQuality`, `getSolutionQuality`, `getTestResultsForSlug`, `computeDualProfileSQS`, `computeSolutionSQS`.

### B) Trust endpoint cache — stale-while-revalidate (internal-trust.ts)

**Before:** Simple TTL cache (2 min). When TTL expires, cache entry deleted, next request waits for full recomputation.

**After:** Two-tier TTL:
- `CACHE_FRESH_MS = 2 min` — serve directly, no recomputation
- `CACHE_STALE_MS = 30 min` — serve stale data immediately, trigger background recomputation

New `getCachedWithRevalidate(key, compute)` function: returns stale data instantly while re-populating cache in background. Uses a `revalidating` Set to prevent duplicate concurrent revalidations.

Applied to:
- `GET /v1/internal/trust/capabilities/batch` — wrapped computation in `computeBatch()` async function
- `GET /v1/internal/trust/solutions/batch` — wrapped computation in `computeSolBatch()` async function

Detail endpoints (`/capabilities/:slug`, `/solutions/:slug`) still use simple `getCached` — these are single-item and less impactful.

### Fields populated from persisted data

| TrustSummary field | Source | Notes |
|---|---|---|
| `sqs` | `capabilities.matrix_sqs` | Persisted after each test batch |
| `sqs_label` | Derived from score (same thresholds as SQS engine) | |
| `badge` / `badge_label` | `determineBadge(tests_total, 0, success_rate)` | |
| `avg_response_time_ms` | `capabilities.avg_latency_ms` | |
| `success_rate` | `capabilities.success_rate` | Used for badge determination |
| `tests_passing` | Batch CTE query | Latest result per active test suite |
| `tests_total` | Batch CTE query | |
| `last_tested_at` | Batch CTE query (`MAX(executed_at)`) | |
| `data_source` | Hardcoded `"internal_testing"` | Same as before |

### Staleness

Persisted SQS scores are written by `persistDualProfileScores` after each test batch (runs hourly). The suggest catalog caches for 10 minutes. Worst case: trust data in suggest results is ~1 hour + 10 min stale. This is acceptable for catalog browsing — detail pages still compute live.

---

## Verification

- `npm run build` — compiles cleanly
- Old query count: ~5,355 per catalog refresh
- New query count: 2 (capabilities scores) + 1 (test counts) = 3
- `trustSummary` shape unchanged — frontend consumers unaffected
- `determineBadge` still called correctly with test totals and success rate
