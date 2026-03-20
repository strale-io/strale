# Performance Audit: Trust/SQS Badge Loading

**Date:** 2026-03-20
**Scope:** Full data flow from frontend page load → backend API → DB queries → render
**Repos:** strale (backend) + strale-frontend

---

## Findings Table

| # | Location | Severity | Description | Est. Impact |
|---|----------|----------|-------------|-------------|
| 1 | trust-helpers.ts:209-242 | **CRITICAL** | N+1 query in getTestResultsForSlug: queries each test suite individually. 20-50 sequential queries per capability. | 3,000+ queries on cold cache batch |
| 2 | suggest.ts:299-364 | **CRITICAL** | Catalog refresh calls computeDualProfileSQS + getTestResultsForSlug per item. ~330 items × ~15 queries = ~5,000 queries every 5 min. | 5,000 queries every 5 minutes |
| 3 | internal-trust.ts:275-276 | **HIGH** | capabilities/batch runs 100 parallel computeDualProfileSQS calls — each makes ~12 DB queries on cache miss. No concurrency limit. | 1,200 concurrent queries, pool saturation |
| 4 | db/index.ts:13 | **HIGH** | postgres() called with no pool config. Default pool size = 10 connections. Batch endpoints try to run 100+ parallel queries. | Connection pool exhaustion |
| 5 | internal-trust.ts:823-865 | **HIGH** | solutions/:slug runs 8 DB queries per step (all in parallel). A 14-step solution = 112 queries. | 112 queries per solution detail |
| 6 | schema.ts:363-367 | **MEDIUM** | Missing composite index on test_results(test_suite_id, executed_at DESC). The N+1 loop in getTestResultsForSlug sorts without index. | Full table scan per suite lookup |
| 7 | internal-trust.ts:609-781 | **MEDIUM** | solutions/batch computes SQS for all unique capability slugs across solutions. 81 solutions with ~200 unique caps = 800+ queries. | 800 queries on cold cache |
| 8 | sqs.ts:722-757 | **LOW** | computeDualProfileSQS cache TTL = 10 min, but trust endpoint cache = 2 min. Endpoint cache expires but SQS cache still valid — partial redundancy. | Cache TTL mismatch (2 min vs 10 min) |
| 9 | Frontend: no React.memo on cards | **LOW** | Capability/solution cards re-render on any trustMap change. Low actual impact due to batch-all-or-nothing updates. | Minimal (React reconciliation handles this) |
| 10 | Frontend: no virtualization | **LOW** | All 50 visible cards rendered to DOM. Mitigated by pagination (50/page caps, 20/page solutions). | Minimal at current scale |

---

## Query Count Analysis

### Capabilities List Page — Cold Cache (249 items, max 100 per batch)

Frontend makes: `ceil(249/50) = 5 batch requests` (50 slugs per chunk), all parallel.

Backend receives 5 requests to `GET /v1/internal/trust/capabilities/batch`:

**First request (50 slugs, cache empty):**
```
Per slug: computeDualProfileSQS() on cache miss = ~12 queries
  ├─ computeQualityProfile: 3 queries
  ├─ computeCapabilitySQS: 4 queries
  ├─ getTestResultsForSlug: S+2 queries (S = suites, avg ~8)
  ├─ getCapabilityQuality: 1 query
  └─ computeReliabilityProfile: 4 queries (2 with pre-fetched context)

50 slugs × ~22 queries = ~1,100 queries
+ 3 batch queries (capabilities, last tests, schedule tiers)
= ~1,103 queries for first batch
```

**Subsequent 4 requests (50 slugs each):** SQS cache (10 min TTL) now populated for the first 50 slugs — but these are DIFFERENT slugs, so still cache-miss:
```
4 × ~1,103 = ~4,412 queries for remaining batches
```

**Total cold-cache load for capabilities page: ~5,515 DB queries**

With warm SQS cache (10 min TTL): 5 × 3 batch queries = 15 queries total.

### Solutions List Page — Cold Cache (81 items)

Frontend makes: `ceil(81/50) = 2 batch requests`, both parallel.

Backend receives 2 requests to `GET /v1/internal/trust/solutions/batch`:

**First request (50 slugs):**
```
Step 1: Fetch solutions + steps (2 queries)
Step 2: Collect unique capability slugs across 50 solutions (maybe ~100 unique caps)
Step 3: computeDualProfileSQS per unique cap (100 × ~12 = ~1,200 queries)
Step 4: Batch fetch last tests + tiers (2 queries)
= ~1,204 queries
```

**Second request (31 slugs):** Unique caps may overlap — SQS cache hits reduce this.

**Total cold-cache for solutions page: ~1,500-2,400 DB queries** (depends on cap overlap)

### Solution Detail Page (single solution, 14 steps)

```
2 queries (solution + steps lookup)
+ 14 steps × 8 queries each (computeDualProfileSQS + getTestResultsForSlug + tier lookup)
= 114 queries
+ 14 × getTestHistory30d = 14 queries
+ 14 × getLimitationsForSlug = 14 queries
= ~142 queries total
```

### Suggest Catalog Refresh (every 5 min)

```
~249 capabilities: computeDualProfileSQS + getTestResultsForSlug + getCapabilityQuality
  = 249 × ~15 queries = ~3,735
~81 solutions: getSolutionQuality + per-step getTestResultsForSlug + computeSolutionSQS
  = 81 × ~20 queries = ~1,620
Total: ~5,355 queries every 5 minutes (even if no user visits the site)
```

---

## Root Cause Analysis

### The Core Problem: getTestResultsForSlug N+1

**File:** trust-helpers.ts:209-242

```typescript
// This runs for EVERY test suite of EVERY capability
for (const suite of suites) {
  const [latest] = await db
    .select()
    .from(testResults)
    .where(eq(testResults.testSuiteId, suite.id))
    .orderBy(desc(testResults.executedAt))
    .limit(1);
  // ... process latest result
}
```

A capability with 8 test suites = 8 sequential round-trips to PostgreSQL. This function is called:
- In every `computeDualProfileSQS` call (via the parallel fetch at sqs.ts:732)
- In the suggest catalog refresh per-item
- In single capability trust endpoint
- In single solution trust endpoint (per step)

**This single function is responsible for ~60% of all trust-related DB queries.**

### The Secondary Problem: No Connection Pool Configuration

**File:** db/index.ts:13

```typescript
const client = postgres(connectionString); // defaults to pool of 10
```

When 5 parallel batch requests arrive (capabilities page cold load), each triggering ~100 parallel `computeDualProfileSQS` calls, the system tries to execute ~500 concurrent DB operations through 10 connections. This causes queuing, backpressure, and potentially timeouts.

### The Tertiary Problem: Suggest Catalog Refresh

**File:** suggest.ts:299-364

The catalog refreshes every 5 minutes with NO user request required. It individually computes trust data for every item, generating ~5,355 queries. If this overlaps with a user page load, the combined query load is ~10,000+ queries in a few seconds.

---

## Recommended Fixes — Ordered by Impact

### 1. Replace N+1 in getTestResultsForSlug with batch query
**Impact:** CRITICAL | **Effort:** Small (1-2 hours)

Replace the per-suite loop with a single `DISTINCT ON` query:

```sql
SELECT DISTINCT ON (test_suite_id)
  test_suite_id, passed, failure_reason, response_time_ms,
  executed_at, actual_output, failure_classification
FROM test_results
WHERE test_suite_id = ANY($1)
ORDER BY test_suite_id, executed_at DESC
```

This turns 8-50 queries into 1 query. Reduces cold-cache capabilities page from ~5,500 queries to ~1,500.

### 2. Add missing composite index
**Impact:** HIGH | **Effort:** Small (<30 minutes)

```sql
CREATE INDEX CONCURRENTLY test_results_suite_executed_idx
ON test_results (test_suite_id, executed_at DESC);
```

Until fix #1 is applied, this index makes each of the N+1 queries ~10x faster by avoiding sort.

### 3. Increase connection pool size
**Impact:** HIGH | **Effort:** Small (<15 minutes)

```typescript
const client = postgres(connectionString, { max: 30 });
```

Railway PostgreSQL typically supports 97 connections. Default of 10 is too low for the batch parallelism pattern. 30 provides headroom without risk.

### 4. Add concurrency limiter to batch SQS computation
**Impact:** HIGH | **Effort:** Small (1 hour)

Instead of `Promise.all(100 × computeDualProfileSQS)`, use a semaphore:

```typescript
import pLimit from 'p-limit';
const limit = pLimit(10); // Max 10 concurrent SQS computations
const dualResults = await Promise.all(
  slugs.map((s) => limit(() => computeDualProfileSQS(s).catch(() => null)))
);
```

This prevents connection pool saturation while still parallelizing.

### 5. Make suggest catalog use the persisted SQS from capabilities table
**Impact:** HIGH | **Effort:** Medium (2-3 hours)

The capabilities table already has `matrix_sqs`, `qp_score`, `rp_score` columns (persisted by `persistDualProfileScores` after each test batch). The suggest catalog should read these directly instead of recomputing:

```sql
SELECT slug, matrix_sqs, qp_score, rp_score, guidance_usable, guidance_strategy
FROM capabilities
WHERE is_active = true
```

This replaces ~5,355 queries with 1 query. The data is at most 1 hour stale (test batches run hourly), which is acceptable for the suggest catalog.

### 6. Add stale-while-revalidate to endpoint cache
**Impact:** MEDIUM | **Effort:** Small (1 hour)

Current cache: serve stale → purge → next request waits for full computation.
Better: serve stale → return immediately → recompute in background.

```typescript
function getCachedOrRevalidate<T>(key: string, compute: () => Promise<T>): T | Promise<T> {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data as T;

  // Serve stale if we have it
  if (entry) {
    // Recompute in background
    compute().then(data => setCache(key, data)).catch(() => {});
    return entry.data as T; // Return stale immediately
  }

  // No cached data — must wait
  return compute().then(data => { setCache(key, data); return data; });
}
```

This eliminates the "first request after cache expiry is slow" problem.

### 7. Pre-warm trust batch cache after test runs
**Impact:** MEDIUM | **Effort:** Small (30 minutes)

After `persistDualProfileScores` runs in the scheduler, warm the trust batch cache by pre-populating the in-memory map for all affected slugs. This ensures the next user page load gets cached data.

---

## Quick Wins (<1 hour each)

1. **Add composite index** on `test_results(test_suite_id, executed_at DESC)` — apply via admin migration endpoint. Immediate 10x speedup for the N+1 loop until it's replaced.

2. **Increase pool size** to 30 in db/index.ts — one-line change, prevents connection starvation.

3. **Add concurrency limiter** (p-limit or simple semaphore) to batch endpoints — prevents >10 concurrent SQS computations.

4. **Align cache TTLs** — endpoint cache is 2 min, SQS cache is 10 min. The endpoint cache provides no value beyond the SQS cache. Either remove endpoint cache (rely on SQS cache) or extend to match SQS (10 min).

---

## Verify Findings

### Index check (run on production DB)
```sql
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'test_results'
ORDER BY indexname;
-- Expect: NO index on (test_suite_id, executed_at DESC)
```

### Query count verification
```sql
-- Count actual queries during a batch request (enable pg_stat_statements)
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
WHERE query LIKE '%test_results%'
ORDER BY calls DESC
LIMIT 20;
```

### Connection pool saturation
```sql
SELECT count(*) FROM pg_stat_activity WHERE datname = 'railway';
-- During a cold-cache batch request, this should NOT exceed max_connections
```
