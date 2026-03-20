Intent: Optimize suggest catalog trust data fetching and add stale-while-revalidate to trust endpoint cache.

## What changed

### A) Suggest catalog: batch SQS instead of per-item recomputation (suggest.ts)
**Already applied before this session.** The catalog refresh now uses 2 batch queries:
1. `SELECT slug, matrix_sqs, success_rate, avg_latency_ms FROM capabilities` — persisted SQS scores
2. `WITH latest_results AS (DISTINCT ON test_suite_id) ... GROUP BY capability_slug` — test pass/fail/last_tested

**Old:** ~5,355 queries per catalog refresh (330 items × ~16 queries each via `computeDualProfileSQS`, `getTestResultsForSlug`, `getCapabilityQuality`, `getSolutionQuality`)
**New:** 2 queries total. Removed imports: `pLimit`, `getCapabilityQuality`, `getSolutionQuality`, `computeDualProfileSQS`, `computeSolutionSQS`, `getTestResultsForSlug`.

Solution SQS computed locally from step persisted scores using floor-aware formula (avg capped at lowest + 20).

### B) Stale-while-revalidate on all trust endpoints (internal-trust.ts)
Cache infrastructure was already in place (CACHE_FRESH_MS=2min, CACHE_STALE_MS=30min, `getCachedWithRevalidate`, `revalidating` Set). Applied to all remaining endpoints:

| Endpoint | Before | After |
|---|---|---|
| `GET /capabilities/batch` | Already SWR | Already SWR |
| `GET /capabilities/:slug/sqs-history` | Simple TTL | SWR |
| `GET /capabilities/:slug` | Simple TTL | SWR |
| `GET /solutions/batch` | Already SWR | Already SWR |
| `GET /solutions/:slug` | Simple TTL | SWR |

For detail endpoints with 404 paths, `computeDetail` returns `null` to signal not-found. The 404 response is only sent on true cache miss.

`getCached` is now unused but retained for reference.

## Verification
- `npm run build` passes cleanly
- No SQS scoring logic modified (Scoring Integrity Protocol respected)
- `determineBadge` still called correctly with persisted data
- `trustSummary` shape unchanged — same fields as before
- `computeDualProfileSQS` still available for detail pages (not removed)
